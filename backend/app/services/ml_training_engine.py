import pandas as pd
import numpy as np
import yfinance as yf
import pandas_ta as ta
import ccxt
import os
import time
import asyncio
import websockets
import json
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from app import models
import traceback
from datetime import datetime, timedelta
import joblib
from app.services.ml_utils import extract_feature_importance, calculate_classification_metrics, calculate_regression_metrics
from app.services.auto_feature_selector import calculate_l2_advanced_features
from app.services.advanced_ml.engine import AdvancedMLEngine # ✅ Import New Engine
from app.services.helpers.vwap_calculator import calculate_vwap_sd_features
from app.services.helpers.institutional_features import add_smc_fvg, add_ict_killzones, add_wick_rejection, add_swing_structure, add_order_blocks

def fetch_l2_data(symbol: str, db: Session, lookback_hours: int = 6, timeframe: str = None) -> pd.DataFrame:
    from app.models.orderbook_snapshot import OrderBookSnapshot
    # Fetch last `lookback_hours` of L2 data
    since = datetime.utcnow() - timedelta(hours=lookback_hours)
    clean_symbol = symbol.upper().split(":")[0].replace("/", "")
    snapshots = db.query(OrderBookSnapshot).filter(
        OrderBookSnapshot.symbol == clean_symbol,
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
            "microprice": s.microprice,
            "bids": s.bids,
            "asks": s.asks
        })
        
    df = pd.DataFrame(data)
    df.set_index("timestamp", inplace=True)
    
    # Calculate advanced features on tick data
    try:
        df_feats, _ = calculate_l2_advanced_features(df.reset_index())
        df_feats['timestamp'] = df.index
        df_feats.set_index('timestamp', inplace=True)
        # Merge back
        for col in df_feats.columns:
            if col not in df.columns:
                df[col] = df_feats[col]
    except Exception as e:
        print(f"Failed to calc advanced features: {e}")
        
    # Drop raw bids/asks
    df = df.drop(columns=['bids', 'asks'], errors='ignore')
    
    if timeframe:
        tf_map = {"5m": "5min", "15m": "15min", "1h": "1H", "4h": "4H", "1d": "1D"}
        pd_tf = tf_map.get(timeframe)
        if pd_tf:
            # Resample tick data into candles
            agg_dict = {col: "mean" for col in df.columns if col not in ["Close"]}
            agg_dict["Close"] = "last"
            df = df.resample(pd_tf).agg(agg_dict).dropna()
            
    return df

def fetch_data(symbol: str, timeframe: str, period: str = None, exchange_name: str = 'binance') -> pd.DataFrame:
    tf_map = {"5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", "1d": "1d"}
    tf = tf_map.get(timeframe, "1d")
    
    try:
        ex_class = getattr(ccxt, exchange_name)
        exchange = ex_class({'enableRateLimit': True})
    except Exception:
        exchange = ccxt.binance({'enableRateLimit': True})
        
    try:
        # Fetch up to 1500 candles to ensure enough data for indicators
        ohlcv = exchange.fetch_ohlcv(symbol, tf, limit=1500)
    except Exception as e:
        # Fallback to spot if futures fails, or try parsing symbol
        try:
            spot_symbol = symbol.split(':')[0]
            ohlcv = exchange.fetch_ohlcv(spot_symbol, tf, limit=1500)
        except Exception as fallback_e:
            raise Exception(f"Failed to fetch data for {symbol} via CCXT: {e}")
            
    if not ohlcv:
        raise Exception(f"No data found for symbol {symbol} on {exchange_name}.")
        
    df = pd.DataFrame(ohlcv, columns=['timestamp', 'Open', 'High', 'Low', 'Close', 'Volume'])
    df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
    df.set_index('timestamp', inplace=True)
    
    return df

def _run_live_scraper(symbol: str, target_rows: int, db: Session, job: models.ModelTrainingJob, add_log_func) -> pd.DataFrame:
    """Run the async scraper synchronously inside the celery task."""
    try:
        return asyncio.run(_async_live_scraper(symbol, target_rows, db, job, add_log_func))
    except Exception as e:
        add_log_func(f"Scraper crashed: {e}")
        return pd.DataFrame()

async def _async_live_scraper(symbol: str, target_rows: int, db: Session, job: models.ModelTrainingJob, add_log_func) -> pd.DataFrame:
    clean_symbol = symbol.upper().split(":")[0].replace("/", "")
    ws_url = f"wss://stream.binance.com:9443/ws/{clean_symbol.lower()}@depth20@100ms"
    data = []
    scraped_count = 0
    buffer = []
    
    # 100ms stream is fast. We will log every 5% progress or 1000 rows.
    log_interval = max(100, target_rows // 20)
    
    from app.models.orderbook_snapshot import OrderBookSnapshot
    
    retry_count = 0
    max_retries = 5
    
    while scraped_count < target_rows and retry_count < max_retries:
        try:
            async with websockets.connect(ws_url, ping_interval=30, ping_timeout=10) as ws:
                add_log_func(f"WebSocket connected. Scraping started...")
                retry_count = 0 # reset on successful connect
                
                while scraped_count < target_rows:
                    msg = await asyncio.wait_for(ws.recv(), timeout=15)
                    msg_data = json.loads(msg)
                    
                    bids = msg_data.get('bids', [])
                    asks = msg_data.get('asks', [])
                    if not bids or not asks:
                        continue
                        
                    best_bid = float(bids[0][0])
                    best_ask = float(asks[0][0])
                    bid_vol = sum([float(level[1]) for level in bids])
                    ask_vol = sum([float(level[1]) for level in asks])
                    total_vol = bid_vol + ask_vol
                    
                    obi = bid_vol / total_vol if total_vol > 0 else 0.5
                    spread = (best_ask - best_bid) / best_bid
                    if total_vol > 0:
                        microprice = ((bid_vol * best_ask) + (ask_vol * best_bid)) / total_vol
                    else:
                        microprice = (best_bid + best_ask) / 2
                        
                    ts = datetime.utcnow()
                    
                    row = {
                        "timestamp": ts,
                        "Close": microprice,
                        "obi": obi,
                        "spread": spread,
                        "microprice": microprice,
                        "bids": bids,
                        "asks": asks
                    }
                    data.append(row)
                    
                    snapshot = OrderBookSnapshot(
                        exchange="binance",
                        symbol=symbol.upper(),
                        timestamp=ts,
                        bids=json.dumps(bids),
                        asks=json.dumps(asks),
                        obi=obi,
                        spread=spread,
                        microprice=microprice
                    )
                    buffer.append(snapshot)
                    scraped_count += 1
                    
                    if len(buffer) >= 500:
                        db.bulk_save_objects(buffer)
                        db.commit()
                        buffer.clear()
                        
                    if scraped_count % log_interval == 0:
                        pct = min(100.0, (scraped_count / target_rows) * 10.0)
                        job.progress = pct
                        db.commit()
                        add_log_func(f"[Scraper] Collected {scraped_count} / {target_rows} rows...")
                        
        except asyncio.TimeoutError:
            add_log_func("WebSocket timeout. Reconnecting...")
            retry_count += 1
            await asyncio.sleep(2)
        except websockets.exceptions.ConnectionClosed:
            add_log_func("WebSocket connection closed. Reconnecting...")
            retry_count += 1
            await asyncio.sleep(2)
        except Exception as e:
            add_log_func(f"WebSocket error: {e}. Reconnecting...")
            retry_count += 1
            await asyncio.sleep(2)
            
    if buffer:
        db.bulk_save_objects(buffer)
        db.commit()
        
    add_log_func(f"Scraping completed. Total rows: {len(data)}")
    
    df = pd.DataFrame(data)
    if not df.empty:
        df.set_index("timestamp", inplace=True)
        
        # Calculate advanced features
        try:
            df_feats, _ = calculate_l2_advanced_features(df.reset_index())
            df_feats['timestamp'] = df.index
            df_feats.set_index('timestamp', inplace=True)
            for col in df_feats.columns:
                if col not in df.columns:
                    df[col] = df_feats[col]
        except Exception as e:
            add_log_func(f"Failed to calc advanced features: {e}")
            
        df = df.drop(columns=['bids', 'asks'], errors='ignore')
        
        timeframe = job.timeframe
        resample_l2 = job.config.get("resample_l2", True)
        if resample_l2:
            tf_map = {"1s": "1s", "5s": "5s", "1m": "1min", "5m": "5min"}
            pd_tf = tf_map.get(timeframe, "1min")
            add_log_func(f"Resampling {len(df)} ticks into {timeframe} candles...")
            
            agg_dict = {col: "mean" for col in df.columns if col not in ["Close"]}
            agg_dict["Close"] = "last"
            
            df = df.resample(pd_tf).agg(agg_dict).dropna()
            
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
            
            is_deep_training = config.get("is_deep_training", False)
            target_rows = config.get("target_rows", 0)

            if is_deep_training and target_rows > 0:
                add_log(f"Starting Deep Training Data Collector. Target: {target_rows} rows from Live Binance WebSocket...")
                df = _run_live_scraper(job.symbol, target_rows, db, job, add_log)
                if df.empty:
                    raise Exception("Deep Training failed. Scraper returned empty dataset.")
            else:
                add_log(f"Fetching High-Frequency L2 OrderBook data for {job.symbol} (Last {lookback_hours} hours)...")
                df = fetch_l2_data(job.symbol, db, lookback_hours, timeframe_to_pass)
                if resample_l2:
                    add_log(f"Fetched L2 data and resampled to {job.timeframe} timeframe.")
                else:
                    add_log(f"Fetched {len(df)} ticks of raw High-Frequency L2 data.")
            
            job.progress = 15.0
            
            # Use L2 specific features chosen by user, default to basics
            features = config.get("l2_features", ["obi", "spread", "microprice"])
            available_feats = [f for f in features if f in df.columns]
            if not available_feats:
                available_feats = ["Close"]
            features = available_feats
            add_log(f"Using {len(features)} L2 features for training.")
            
            prediction_target = config.get("prediction_target", "classification")
            if prediction_target == "classification":
                df['Target'] = (df['Close'].shift(-1) > df['Close']).astype(int)
            else:
                df['Target'] = df['Close'].shift(-1)
                
            df.dropna(inplace=True)
            if len(df) < 10:
                raise Exception(f"Not enough L2 data to train a model. Found {len(df)} rows after processing. Please lower timeframe or collect more data.")
                
        else:
            ohlcv_period = config.get("ohlcv_period")
            exchange_name = config.get("exchange", "binance")
            add_log(f"Fetching historical OHLCV data for {job.symbol} from {exchange_name.upper()}...")
            df = fetch_data(job.symbol, job.timeframe, period=ohlcv_period, exchange_name=exchange_name)
            add_log(f"Fetched {len(df)} rows of market data.")
            job.progress = 15.0
            
            # 2. Modular Feature Engineering
            indicators = config.get("indicators", ["RSI", "MACD"])
            add_log(f"Calculating technical indicators: {', '.join(indicators)}")
            
            INDICATOR_REGISTRY = {
                # Momentum
                "RSI": lambda d: d.ta.rsi(append=True),
                "Stoch": lambda d: d.ta.stoch(append=True),
                "ROC": lambda d: d.ta.roc(append=True),
                "CCI": lambda d: d.ta.cci(append=True),
                "WillR": lambda d: d.ta.willr(append=True),
                "MFI": lambda d: d.ta.mfi(append=True),
                
                # Trend
                "MACD": lambda d: d.ta.macd(append=True),
                "EMA": lambda d: d.ta.ema(append=True),
                "SMA": lambda d: d.ta.sma(append=True),
                "ADX": lambda d: d.ta.adx(append=True),
                "Supertrend": lambda d: d.ta.supertrend(append=True),
                "Parabolic SAR": lambda d: d.ta.psar(append=True),
                
                # Volatility
                "BBANDS": lambda d: d.ta.bbands(append=True),
                "ATR": lambda d: d.ta.atr(append=True),
                "Keltner Channel": lambda d: d.ta.kc(append=True),
                "Donchian Channel": lambda d: d.ta.donchian(append=True),
                
                # Volume
                "OBV": lambda d: d.ta.obv(append=True),
                "VWAP": lambda d: d.ta.vwap(append=True),
                "CMF": lambda d: d.ta.cmf(append=True),
                "ADOSC": lambda d: d.ta.adosc(append=True),
                
                # Institutional & Price Action
                "SMC FVG": lambda d: add_smc_fvg(d),
                "ICT Killzones": lambda d: add_ict_killzones(d),
                "Wick Rejection": lambda d: add_wick_rejection(d),
                "Market Structure": lambda d: add_swing_structure(d),
                "Order Blocks": lambda d: add_order_blocks(d)
            }
            
            successful_indicators = []
            for ind in indicators:
                if ind == "VWAP_SD":
                    try:
                        vwap_feats = calculate_vwap_sd_features(df, anchor='Daily')
                        df['VWAP_Z_Score'] = vwap_feats['VWAP_Z_Score']
                        successful_indicators.append(ind)
                    except Exception as e:
                        add_log(f"⚠️ Skipped indicator '{ind}': {str(e)}")
                elif ind in INDICATOR_REGISTRY:
                    try:
                        INDICATOR_REGISTRY[ind](df)
                        successful_indicators.append(ind)
                    except Exception as e:
                        add_log(f"⚠️ Skipped indicator '{ind}': {str(e)}")
                else:
                    add_log(f"⚠️ Unknown indicator requested: '{ind}'")
                    
            add_log(f"Successfully calculated {len(successful_indicators)} features.")
                
            prediction_target = config.get("prediction_target", "classification")
            if prediction_target == "classification":
                df['Target'] = (df['Close'].shift(-1) > df['Close']).astype(int)
            else:
                df['Target'] = df['Close'].shift(-1)
                
            df.dropna(inplace=True)
            
            features = [col for col in df.columns if col not in ['Target', 'Open', 'High', 'Low', 'Close', 'Volume', 'Adj Close']]
            if not features:
                features = ['Close']
                
            if len(df) < 10:
                raise Exception(f"Not enough market data to train a model. Found {len(df)} rows. Please increase the dataset period or lookback time.")
        
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
        
        import json
        import time
        final_accuracy = None
        final_f1 = None
        final_latency = None

        def process_metrics(metrics_str, is_classification):
            nonlocal final_accuracy, final_f1
            add_log(metrics_str)
            try:
                metrics_dict = json.loads(metrics_str.replace("[METRICS] ", ""))
                if is_classification:
                    final_accuracy = metrics_dict.get("Accuracy")
                    final_f1 = metrics_dict.get("F1_Score")
                else:
                    final_accuracy = metrics_dict.get("R2_Score") # Use R2 for accuracy display
            except Exception:
                pass

        # 4. Train Model
        if job.algorithm == "Random Forest":
            add_log(f"Training Random Forest ({prediction_target.capitalize()})...")
            if prediction_target == "classification":
                from sklearn.ensemble import RandomForestClassifier
                model = RandomForestClassifier(n_estimators=epochs, max_depth=max_depth, random_state=42)
                model.fit(X_train, y_train.ravel())
                start_time = time.time()
                y_pred = model.predict(X_test)
                end_time = time.time()
                final_latency = max(1.0, (end_time - start_time) / max(1, len(X_test)) * 1000)
                process_metrics(calculate_classification_metrics(y_test.ravel(), y_pred), True)
            else:
                from sklearn.ensemble import RandomForestRegressor
                model = RandomForestRegressor(n_estimators=epochs, max_depth=max_depth, random_state=42)
                model.fit(X_train, y_train.ravel())
                start_time = time.time()
                y_pred = model.predict(X_test)
                end_time = time.time()
                final_latency = max(1.0, (end_time - start_time) / max(1, len(X_test)) * 1000)
                process_metrics(calculate_regression_metrics(y_test.ravel(), y_pred), False)
                
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
                start_time = time.time()
                y_pred = model.predict(X_test)
                end_time = time.time()
                final_latency = max(1.0, (end_time - start_time) / max(1, len(X_test)) * 1000)
                process_metrics(calculate_classification_metrics(y_test.ravel(), y_pred), True)
            else:
                from xgboost import XGBRegressor
                model = XGBRegressor(n_estimators=epochs, learning_rate=learning_rate, max_depth=max_depth, random_state=42)
                model.fit(X_train, y_train.ravel(), eval_set=[(X_test, y_test.ravel())], verbose=False)
                start_time = time.time()
                y_pred = model.predict(X_test)
                end_time = time.time()
                final_latency = max(1.0, (end_time - start_time) / max(1, len(X_test)) * 1000)
                process_metrics(calculate_regression_metrics(y_test.ravel(), y_pred), False)
                
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
                start_time = time.time()
                preds = model(X_test_t).numpy()
                end_time = time.time()
                final_latency = max(1.0, (end_time - start_time) / max(1, len(X_test)) * 1000)
                if prediction_target == "classification":
                    preds_class = (1 / (1 + np.exp(-preds)) > 0.5).astype(int)
                    process_metrics(calculate_classification_metrics(y_test, preds_class), True)
                else:
                    process_metrics(calculate_regression_metrics(y_test, preds), False)
                    
            add_log("PyTorch LSTM training complete.")
            
        elif job.algorithm == "LightGBM":
            add_log(f"Training LightGBM ({prediction_target.capitalize()})...")
            import lightgbm as lgb
            if prediction_target == "classification":
                model = lgb.LGBMClassifier(n_estimators=epochs, learning_rate=learning_rate, max_depth=max_depth, random_state=42)
                model.fit(X_train, y_train.ravel(), eval_set=[(X_test, y_test.ravel())])
                start_time = time.time()
                y_pred = model.predict(X_test)
                end_time = time.time()
                final_latency = max(1.0, (end_time - start_time) / max(1, len(X_test)) * 1000)
                process_metrics(calculate_classification_metrics(y_test.ravel(), y_pred), True)
            else:
                model = lgb.LGBMRegressor(n_estimators=epochs, learning_rate=learning_rate, max_depth=max_depth, random_state=42)
                model.fit(X_train, y_train.ravel(), eval_set=[(X_test, y_test.ravel())])
                start_time = time.time()
                y_pred = model.predict(X_test)
                end_time = time.time()
                final_latency = max(1.0, (end_time - start_time) / max(1, len(X_test)) * 1000)
                process_metrics(calculate_regression_metrics(y_test.ravel(), y_pred), False)
                
            job.progress = 80.0
            joblib.dump(model, model_path)
            
            fi_log = extract_feature_importance(model, features)
            if fi_log: add_log(fi_log)
            add_log("LightGBM training complete.")

        elif job.algorithm == "CatBoost":
            add_log(f"Training CatBoost ({prediction_target.capitalize()})...")
            import catboost as cb
            if prediction_target == "classification":
                model = cb.CatBoostClassifier(iterations=epochs, learning_rate=learning_rate, depth=max_depth, random_seed=42, verbose=False)
                model.fit(X_train, y_train.ravel(), eval_set=(X_test, y_test.ravel()))
                start_time = time.time()
                y_pred = model.predict(X_test)
                end_time = time.time()
                final_latency = max(1.0, (end_time - start_time) / max(1, len(X_test)) * 1000)
                process_metrics(calculate_classification_metrics(y_test.ravel(), y_pred), True)
            else:
                model = cb.CatBoostRegressor(iterations=epochs, learning_rate=learning_rate, depth=max_depth, random_seed=42, verbose=False)
                model.fit(X_train, y_train.ravel(), eval_set=(X_test, y_test.ravel()))
                start_time = time.time()
                y_pred = model.predict(X_test)
                end_time = time.time()
                final_latency = max(1.0, (end_time - start_time) / max(1, len(X_test)) * 1000)
                process_metrics(calculate_regression_metrics(y_test.ravel(), y_pred), False)
                
            job.progress = 80.0
            joblib.dump(model, model_path)
            
            fi_log = extract_feature_importance(model, features)
            if fi_log: add_log(fi_log)
            add_log("CatBoost training complete.")

        elif job.algorithm == "GRU":
            add_log("Initializing PyTorch GRU network...")
            import torch
            import torch.nn as nn
            import numpy as np
            
            class SimpleGRU(nn.Module):
                def __init__(self, input_size, hidden_size, num_layers, output_size):
                    super(SimpleGRU, self).__init__()
                    self.hidden_size = hidden_size
                    self.num_layers = num_layers
                    self.gru = nn.GRU(input_size, hidden_size, num_layers, batch_first=True)
                    self.fc = nn.Linear(hidden_size, output_size)
                    
                def forward(self, x):
                    h0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size).to(x.device)
                    out, _ = self.gru(x, h0)
                    out = self.fc(out[:, -1, :])
                    return out
                    
            X_train_t = torch.FloatTensor(X_train).unsqueeze(1)
            y_train_t = torch.FloatTensor(y_train)
            
            model = SimpleGRU(input_size=X_train.shape[1], hidden_size=64, num_layers=2, output_size=1)
            
            if prediction_target == "classification":
                criterion = nn.BCEWithLogitsLoss()
            else:
                criterion = nn.MSELoss()
                
            optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)
            
            add_log(f"Starting GRU training for {epochs} epochs...")
            for epoch in range(epochs):
                outputs = model(X_train_t)
                optimizer.zero_grad()
                loss = criterion(outputs.squeeze(-1), y_train_t.view(-1))
                loss.backward()
                optimizer.step()
                
            model_filename = model_filename.replace(".pkl", ".pt")
            model_path = model_path.replace(".pkl", ".pt")
            torch.save(model.state_dict(), model_path)
            
            model.eval()
            with torch.no_grad():
                X_test_t = torch.FloatTensor(X_test).unsqueeze(1)
                start_time = time.time()
                preds = model(X_test_t).numpy()
                end_time = time.time()
                final_latency = max(1.0, (end_time - start_time) / max(1, len(X_test)) * 1000)
                if prediction_target == "classification":
                    preds_class = (1 / (1 + np.exp(-preds)) > 0.5).astype(int)
                    process_metrics(calculate_classification_metrics(y_test, preds_class), True)
                else:
                    process_metrics(calculate_regression_metrics(y_test, preds), False)
            add_log("PyTorch GRU training complete.")

        elif job.algorithm == "1D-CNN":
            add_log("Initializing PyTorch 1D-CNN network...")
            import torch
            import torch.nn as nn
            import numpy as np
            
            class CNN1D(nn.Module):
                def __init__(self, input_size, output_size):
                    super(CNN1D, self).__init__()
                    self.conv1 = nn.Conv1d(in_channels=1, out_channels=16, kernel_size=3, padding=1)
                    self.relu = nn.ReLU()
                    self.pool = nn.MaxPool1d(kernel_size=2)
                    pool_out_size = input_size // 2
                    self.fc1 = nn.Linear(16 * pool_out_size, 32)
                    self.fc2 = nn.Linear(32, output_size)
                    
                def forward(self, x):
                    x = x.unsqueeze(1)
                    out = self.conv1(x)
                    out = self.relu(out)
                    out = self.pool(out)
                    out = out.view(out.size(0), -1)
                    out = self.relu(self.fc1(out))
                    out = self.fc2(out)
                    return out
                    
            X_train_t = torch.FloatTensor(X_train)
            y_train_t = torch.FloatTensor(y_train)
            
            model = CNN1D(input_size=X_train.shape[1], output_size=1)
            
            if prediction_target == "classification":
                criterion = nn.BCEWithLogitsLoss()
            else:
                criterion = nn.MSELoss()
                
            optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)
            
            for epoch in range(epochs):
                outputs = model(X_train_t)
                optimizer.zero_grad()
                loss = criterion(outputs.squeeze(-1), y_train_t.view(-1))
                loss.backward()
                optimizer.step()
                
            model_filename = model_filename.replace(".pkl", ".pt")
            model_path = model_path.replace(".pkl", ".pt")
            torch.save(model.state_dict(), model_path)
            
            model.eval()
            with torch.no_grad():
                X_test_t = torch.FloatTensor(X_test)
                start_time = time.time()
                preds = model(X_test_t).numpy()
                end_time = time.time()
                final_latency = max(1.0, (end_time - start_time) / max(1, len(X_test)) * 1000)
                if prediction_target == "classification":
                    preds_class = (1 / (1 + np.exp(-preds)) > 0.5).astype(int)
                    process_metrics(calculate_classification_metrics(y_test, preds_class), True)
                else:
                    process_metrics(calculate_regression_metrics(y_test, preds), False)
            add_log("PyTorch 1D-CNN training complete.")

        elif job.algorithm == "DeepLOB":
            add_log("Initializing PyTorch DeepLOB architecture...")
            import torch
            import torch.nn as nn
            import numpy as np
            
            class DeepLOB(nn.Module):
                def __init__(self, input_size, output_size):
                    super(DeepLOB, self).__init__()
                    self.conv1 = nn.Conv1d(1, 16, kernel_size=2, padding=1)
                    self.relu = nn.ReLU()
                    self.lstm = nn.LSTM(16, 32, 1, batch_first=True)
                    self.fc = nn.Linear(32, output_size)
                    
                def forward(self, x):
                    x = x.unsqueeze(1)
                    x = self.relu(self.conv1(x))
                    x = x.transpose(1, 2)
                    out, _ = self.lstm(x)
                    out = self.fc(out[:, -1, :])
                    return out

            X_train_t = torch.FloatTensor(X_train)
            y_train_t = torch.FloatTensor(y_train)
            model = DeepLOB(input_size=X_train.shape[1], output_size=1)
            
            if prediction_target == "classification":
                criterion = nn.BCEWithLogitsLoss()
            else:
                criterion = nn.MSELoss()
                
            optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)
            
            for epoch in range(epochs):
                outputs = model(X_train_t)
                optimizer.zero_grad()
                loss = criterion(outputs.squeeze(-1), y_train_t.view(-1))
                loss.backward()
                optimizer.step()
                
            model_filename = model_filename.replace(".pkl", ".pt")
            model_path = model_path.replace(".pkl", ".pt")
            torch.save(model.state_dict(), model_path)
            
            model.eval()
            with torch.no_grad():
                X_test_t = torch.FloatTensor(X_test)
                start_time = time.time()
                preds = model(X_test_t).numpy()
                end_time = time.time()
                final_latency = max(1.0, (end_time - start_time) / max(1, len(X_test)) * 1000)
                if prediction_target == "classification":
                    preds_class = (1 / (1 + np.exp(-preds)) > 0.5).astype(int)
                    process_metrics(calculate_classification_metrics(y_test, preds_class), True)
                else:
                    process_metrics(calculate_regression_metrics(y_test, preds), False)
            add_log("PyTorch DeepLOB training complete.")

        elif job.algorithm == "Transformer":
            add_log("🚀 Routing to Advanced ML Engine: Transformer...")
            try:
                model, model_path = AdvancedMLEngine.train_transformer(job, df, features, db, add_log)
                final_latency = 5.0 # Placeholder
                add_log("✅ Advanced Transformer Training complete.")
            except Exception as e:
                add_log(f"❌ Advanced Transformer Error: {e}")
                raise e

        elif job.algorithm == "PPO-RL":
            add_log("🚀 Routing to Advanced ML Engine: PPO-RL...")
            try:
                model, model_path = AdvancedMLEngine.train_ppo_rl(job, df, features, db, add_log)
                final_latency = 10.0 # Placeholder
                add_log("✅ Advanced RL Training complete.")
            except Exception as e:
                add_log(f"❌ Advanced RL Error: {e}")
                raise e

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
                status=models.ModelStatus.READY,
                accuracy=final_accuracy,
                f1_score=final_f1,
                latency=final_latency
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
                status=models.ModelStatus.READY,
                accuracy=final_accuracy,
                f1_score=final_f1,
                latency=final_latency
            )
            db.add(db_version)
            db.flush()
            
            # Update model with active_version_id
            db_model.active_version_id = version_id
            
        job.output_model_id = registry_id
        
        # Save features metadata for the predictor
        metadata_path = model_path.replace(".pkl", ".json").replace(".pt", ".json")
        with open(metadata_path, "w") as f:
            json.dump({"features": features}, f)
            
        job.progress = 100.0
        job.status = models.TrainingStatus.COMPLETED
        job.completed_at = func.now()
        add_log("Training job completed successfully! Model is now in Registry.")
        
        db.commit()

    except Exception as e:
        job.status = models.TrainingStatus.FAILED
        add_log(f"ERROR: {e}")
        import traceback
        add_log(traceback.format_exc())
    finally:
        db.commit()
