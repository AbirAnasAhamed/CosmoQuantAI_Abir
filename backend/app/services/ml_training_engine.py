import pandas as pd
import numpy as np
import yfinance as yf
import pandas_ta as ta
import os
import time
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from app import models
import traceback
from datetime import datetime, timedelta
import joblib
from app.services.ml_utils import extract_feature_importance, calculate_classification_metrics, calculate_regression_metrics

def fetch_l2_data(symbol: str, db: Session, lookback_hours: int = 6, timeframe: str = None) -> pd.DataFrame:
    from app.models.orderbook_snapshot import OrderBookSnapshot
    # Fetch last `lookback_hours` of L2 data
    since = datetime.utcnow() - timedelta(hours=lookback_hours)
    snapshots = db.query(OrderBookSnapshot).filter(
        OrderBookSnapshot.symbol == symbol.upper(),
        OrderBookSnapshot.timestamp >= since
    ).order_by(OrderBookSnapshot.timestamp.asc()).all()
    
    if not snapshots:
        raise Exception(f"No L2 OrderBook data found for {symbol}")
        
    data = []
    for s in snapshots:
        # We need a proxy for "Close" to calculate Target
        data.append({
            "timestamp": s.timestamp,
            "Close": s.microprice, 
            "obi": s.obi,
            "spread": s.spread,
            "microprice": s.microprice
        })
        
    df = pd.DataFrame(data)
    df.set_index("timestamp", inplace=True)
    
    if timeframe:
        tf_map = {"5m": "5min", "15m": "15min", "1h": "1H", "4h": "4H", "1d": "1D"}
        pd_tf = tf_map.get(timeframe)
        if pd_tf:
            # Resample tick data into candles
            df = df.resample(pd_tf).agg({
                "Close": "last",
                "microprice": "last",
                "obi": "mean",
                "spread": "mean"
            }).dropna()
            
    return df

def fetch_data(symbol: str, timeframe: str, period: str = None) -> pd.DataFrame:
    # Note: yfinance format is 'BTC-USD', binance is 'BTC/USDT'
    yf_symbol = symbol.replace("/", "-").replace("USDT", "USD")
    
    tf_map = {"5m": "5m", "15m": "15m", "1h": "1h", "4h": "1h", "1d": "1d"}
    tf = tf_map.get(timeframe, "1d")
    
    if period is None:
        period = "2y" if tf == "1d" else "60d"
    
    df = yf.download(yf_symbol, period=period, interval=tf)
    if df.empty:
        raise Exception(f"No data found for symbol {yf_symbol}.")
    
    # Flatten MultiIndex columns if present
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    
    return df

def train_model_task(job_id: str, db: Session):
    job = db.query(models.ModelTrainingJob).filter(models.ModelTrainingJob.id == job_id).first()
    if not job:
        return
        
    def add_log(msg: str):
        print(msg)
        logs = list(job.logs) if job.logs else []
        logs.append(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")
        job.logs = logs
        db.commit()

    try:
        job.status = models.TrainingStatus.RUNNING
        job.progress = 5.0
        add_log(f"Starting training job for {job.symbol} using {job.algorithm}")
        
        config = job.config or {}
        dataset_type = config.get("dataset_type", "ohlcv")
        lookback_hours = config.get("data_lookback_hours", 6)
        
        if dataset_type == "l2_orderbook":
            resample_l2 = config.get("resample_l2", True)
            timeframe_to_pass = job.timeframe if resample_l2 else None
            
            add_log(f"Fetching High-Frequency L2 OrderBook data for {job.symbol} (Last {lookback_hours} hours)...")
            df = fetch_l2_data(job.symbol, db, lookback_hours, timeframe_to_pass)
            if resample_l2:
                add_log(f"Fetched L2 data and resampled to {job.timeframe} timeframe.")
            else:
                add_log(f"Fetched {len(df)} ticks of raw High-Frequency L2 data.")
            job.progress = 15.0
            
            # L2 doesn't need TA-Lib indicators, we use micro-features
            features = ["obi", "spread", "microprice"]
            
            prediction_target = config.get("prediction_target", "classification")
            if prediction_target == "classification":
                df['Target'] = (df['Close'].shift(-1) > df['Close']).astype(int)
            else:
                df['Target'] = df['Close'].shift(-1)
                
            df.dropna(inplace=True)
            
        else:
            ohlcv_period = config.get("ohlcv_period")
            add_log(f"Fetching historical OHLCV data for {job.symbol} (Period: {ohlcv_period or 'Auto'})...")
            df = fetch_data(job.symbol, job.timeframe, period=ohlcv_period)
            add_log(f"Fetched {len(df)} rows of market data.")
            job.progress = 15.0
            
            # 2. Feature Engineering
            indicators = config.get("indicators", ["RSI", "MACD"])
            add_log(f"Calculating technical indicators: {', '.join(indicators)}")
            
            if "RSI" in indicators:
                df.ta.rsi(append=True)
            if "MACD" in indicators:
                df.ta.macd(append=True)
            if "BBANDS" in indicators:
                df.ta.bbands(append=True)
                
            prediction_target = config.get("prediction_target", "classification")
            if prediction_target == "classification":
                df['Target'] = (df['Close'].shift(-1) > df['Close']).astype(int)
            else:
                df['Target'] = df['Close'].shift(-1)
                
            df.dropna(inplace=True)
            
            features = [col for col in df.columns if col not in ['Target', 'Open', 'High', 'Low', 'Close', 'Volume', 'Adj Close']]
            if not features:
                features = ['Close']
        
        job.progress = 30.0
        
        # 3. Prepare Data
        add_log("Preparing and scaling data...")
        from sklearn.preprocessing import MinMaxScaler
        
        X = df[features].values
        y = df['Target'].values
        
        scaler_x = MinMaxScaler()
        scaler_y = MinMaxScaler()
        X_scaled = scaler_x.fit_transform(X)
        y_scaled = scaler_y.fit_transform(y.reshape(-1, 1))
        
        split = int(len(X) * 0.8)
        X_train, X_test = X_scaled[:split], X_scaled[split:]
        y_train, y_test = y_scaled[:split], y_scaled[split:]
        
        job.progress = 40.0
        
        model_filename = f"model_{job.id}.pkl"
        model_path = os.path.join("uploads", "models", model_filename)
        os.makedirs(os.path.dirname(model_path), exist_ok=True)
        
        epochs = int(config.get("epochs", 10))
        learning_rate = float(config.get("learning_rate", 0.1))
        max_depth = int(config.get("max_depth", 6))
        prediction_target = config.get("prediction_target", "classification")
        
        # 4. Train Model
        if job.algorithm == "Random Forest":
            add_log(f"Training Random Forest ({prediction_target.capitalize()})...")
            if prediction_target == "classification":
                from sklearn.ensemble import RandomForestClassifier
                model = RandomForestClassifier(n_estimators=epochs, max_depth=max_depth, random_state=42)
                model.fit(X_train, y_train.ravel())
                y_pred = model.predict(X_test)
                add_log(calculate_classification_metrics(y_test.ravel(), y_pred))
            else:
                from sklearn.ensemble import RandomForestRegressor
                model = RandomForestRegressor(n_estimators=epochs, max_depth=max_depth, random_state=42)
                model.fit(X_train, y_train.ravel())
                y_pred = model.predict(X_test)
                add_log(calculate_regression_metrics(y_test.ravel(), y_pred))
                
            job.progress = 80.0
            joblib.dump(model, model_path)
            
            fi_log = extract_feature_importance(model, features)
            if fi_log: add_log(fi_log)
            add_log(f"Random Forest training complete.")
            
        elif job.algorithm == "XGBoost":
            add_log(f"Training XGBoost ({prediction_target.capitalize()})...")
            if prediction_target == "classification":
                from xgboost import XGBClassifier
                model = XGBClassifier(n_estimators=epochs, learning_rate=learning_rate, max_depth=max_depth, random_state=42)
                model.fit(X_train, y_train.ravel(), eval_set=[(X_test, y_test.ravel())], verbose=False)
                y_pred = model.predict(X_test)
                add_log(calculate_classification_metrics(y_test.ravel(), y_pred))
            else:
                from xgboost import XGBRegressor
                model = XGBRegressor(n_estimators=epochs, learning_rate=learning_rate, max_depth=max_depth, random_state=42)
                model.fit(X_train, y_train.ravel(), eval_set=[(X_test, y_test.ravel())], verbose=False)
                y_pred = model.predict(X_test)
                add_log(calculate_regression_metrics(y_test.ravel(), y_pred))
                
            job.progress = 80.0
            joblib.dump(model, model_path)
            
            fi_log = extract_feature_importance(model, features)
            if fi_log: add_log(fi_log)
            add_log(f"XGBoost training complete.")
            
        elif job.algorithm == "LSTM":
            add_log("Initializing PyTorch LSTM network...")
            import torch
            import torch.nn as nn
            
            class SimpleLSTM(nn.Module):
                def __init__(self, input_size, hidden_size, num_layers, output_size):
                    super(SimpleLSTM, self).__init__()
                    self.hidden_size = hidden_size
                    self.num_layers = num_layers
                    self.lstm = nn.LSTM(input_size, hidden_size, num_layers, batch_first=True)
                    self.fc = nn.Linear(hidden_size, output_size)
                    
                def forward(self, x):
                    h0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size).to(x.device)
                    c0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size).to(x.device)
                    out, _ = self.lstm(x, (h0, c0))
                    out = self.fc(out[:, -1, :])
                    return out
            
            X_train_t = torch.FloatTensor(X_train).unsqueeze(1)
            y_train_t = torch.FloatTensor(y_train)
            
            model = SimpleLSTM(input_size=X_train.shape[1], hidden_size=64, num_layers=2, output_size=1)
            
            if prediction_target == "classification":
                criterion = nn.BCEWithLogitsLoss()
            else:
                criterion = nn.MSELoss()
                
            optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)
            
            add_log(f"Starting LSTM training for {epochs} epochs...")
            for epoch in range(epochs):
                outputs = model(X_train_t)
                optimizer.zero_grad()
                loss = criterion(outputs, y_train_t)
                loss.backward()
                optimizer.step()
                
                pct = 40.0 + (40.0 * (epoch+1)/epochs)
                job.progress = pct
                
                if (epoch+1) % max(1, epochs//5) == 0 or epoch == 0:
                    add_log(f"Epoch [{epoch+1}/{epochs}], Loss: {loss.item():.6f}")
                    time.sleep(0.5) # allow ui to poll nicely
            
            model_filename = model_filename.replace(".pkl", ".pt")
            model_path = model_path.replace(".pkl", ".pt")
            torch.save(model.state_dict(), model_path)
            
            # Simple eval
            model.eval()
            with torch.no_grad():
                X_test_t = torch.FloatTensor(X_test).unsqueeze(1)
                preds = model(X_test_t).numpy()
                if prediction_target == "classification":
                    preds_class = (1 / (1 + np.exp(-preds)) > 0.5).astype(int)
                    add_log(calculate_classification_metrics(y_test, preds_class))
                else:
                    add_log(calculate_regression_metrics(y_test, preds))
                    
            add_log("PyTorch LSTM training complete.")
            
        else:
            raise ValueError(f"Unsupported algorithm: {job.algorithm}")
            
        # 5. Register in ML Registry
        add_log("Registering newly trained model in ML Registry...")
        timestamp = int(time.time() * 1000)
        version_id = f"v1.0-{timestamp}"
        
        target_model_id = config.get("target_model_id")
        is_auto_retrain = config.get("is_auto_retrain", False)
        retrain_interval_hours = config.get("retrain_interval_hours", 6)
        
        if target_model_id:
            # We are auto-retraining an existing model
            db_model = db.query(models.CustomMLModel).filter(models.CustomMLModel.id == target_model_id).first()
            if not db_model:
                raise Exception(f"Target model {target_model_id} not found.")
            
            # Find the latest version to increment
            last_v = db.query(models.ModelVersion).filter(models.ModelVersion.model_id == target_model_id).order_by(models.ModelVersion.version.desc()).first()
            new_v_num = (last_v.version + 0.1) if last_v else 1.0
            version_id = f"v{new_v_num:.1f}-{timestamp}"
            
            db_version = models.ModelVersion(
                id=version_id,
                model_id=target_model_id,
                version=new_v_num,
                description=f"Auto-retrained using {job.algorithm} on {job.symbol}",
                file_path=model_path,
                status=models.ModelStatus.READY
            )
            db.add(db_version)
            db.flush()
            
            db_model.active_version_id = version_id
            registry_id = target_model_id
        else:
            # We are creating a new model from scratch
            custom_model_name = config.get("model_name", "").strip()
            
            registry_id = f"model_{timestamp}"
            db_model = models.CustomMLModel(
                id=registry_id,
                name=custom_model_name if custom_model_name else f"{job.symbol} {job.algorithm} Auto",
                model_type=job.algorithm,
                user_id=job.user_id,
                active_version_id=None,
                is_auto_retrain=1 if is_auto_retrain else 0,
                retrain_interval_hours=retrain_interval_hours,
                data_lookback_hours=lookback_hours
            )
            db.add(db_model)
            db.flush()
            
            # Add version pointing to model
            db_version = models.ModelVersion(
                id=version_id,
                model_id=registry_id,
                version=1.0,
                description=f"Auto-trained using {job.algorithm} on {job.symbol} {job.timeframe}",
                file_path=model_path,
                status=models.ModelStatus.READY
            )
            db.add(db_version)
            db.flush()
            
            # Update model with active_version_id
            db_model.active_version_id = version_id
            
        job.output_model_id = registry_id
        job.progress = 100.0
        job.status = models.TrainingStatus.COMPLETED
        job.completed_at = func.now()
        add_log("Training job completed successfully! Model is now in Registry.")
        
        db.commit()

    except Exception as e:
        job.status = models.TrainingStatus.FAILED
        job.error_message = str(e)
        add_log(f"ERROR: {str(e)}")
        print(traceback.format_exc())
        db.commit()
