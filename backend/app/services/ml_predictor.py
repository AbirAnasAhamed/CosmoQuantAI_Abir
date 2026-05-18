"""
ml_predictor.py
─────────────────────────────────────────────────────────────
Live Prediction Service for ML Registry Models.

Supports ALL model types:
  - sklearn (Random Forest, XGBoost, LightGBM, CatBoost)
  - PyTorch  (LSTM, GRU, 1D-CNN, DeepLOB, Transformer)
  - PPO-RL   (not applicable — returns HOLD)

Data sources (inferred from metadata.json):
  - ohlcv         : Fetches live OHLCV from CCXT + recalculates indicators
  - l2_orderbook  : Fetches last L2 snapshot from DB
  - default       : Falls back to OHLCV

Flow:
  1. Load metadata.json  → features list, dataset_type, indicators
  2. Fetch live data      → correct source
  3. Calculate indicators → match training
  4. Scale data          → load .scaler file (joblib)
  5. Run inference       → model.predict()
  6. Return signal dict
─────────────────────────────────────────────────────────────
"""

import os
import json
import numpy as np
import pandas as pd
import joblib
import traceback
from typing import Optional
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session


# ─── Constants ───────────────────────────────────────────────────────────────

DEEP_LEARNING_ALGOS = {"LSTM", "GRU", "1D-CNN", "DeepLOB", "Transformer", "TCN", "TabNet", "Auto-Encoder"}
SKLEARN_ALGOS       = {"Random Forest", "XGBoost", "LightGBM", "CatBoost", "Custom Ensemble"}


# ─── Public Entry Point ───────────────────────────────────────────────────────

def predict(model_id: str, symbol_override: Optional[str], db: Session) -> dict:
    """
    Generate a live prediction signal for the given model.
    
    Returns:
        {
          "signal":     "BUY" | "SELL" | "HOLD",
          "confidence": 0.73,
          "price":      67250.0,
          "symbol":     "BTC/USDT",
          "algorithm":  "Random Forest",
          "timestamp":  "2026-05-14T12:00:00Z"
        }
    """
    from app import models as db_models
    import time

    start_time = time.time()

    # ── 1. Load model from Registry ─────────────────────────────────────────
    db_model = db.query(db_models.CustomMLModel).filter(db_models.CustomMLModel.id == model_id).first()
    if not db_model:
        raise ValueError(f"Model '{model_id}' not found in Registry.")

    if not db_model.active_version_id:
        raise ValueError(f"Model '{model_id}' has no active version.")

    version = db.query(db_models.ModelVersion).filter(db_models.ModelVersion.id == db_model.active_version_id).first()
    if not version:
        raise ValueError("Active version record not found.")

    if version.status != db_models.ModelStatus.READY:
        raise ValueError("Model is not in READY state.")

    model_path = version.file_path
    if not model_path or not os.path.exists(model_path):
        raise FileNotFoundError(f"Model file not found: {model_path}")

    algorithm = db_model.model_type

    # ── 2. Load metadata (features, dataset_type, indicators, symbol) ────────
    metadata_path = model_path.replace(".pkl", ".json").replace(".pt", ".json").replace(".zip", ".json")
    
    if os.path.exists(metadata_path):
        with open(metadata_path, "r") as f:
            metadata = json.load(f)
    else:
        # Provide fallback metadata for manually uploaded models
        metadata = {
            "features": ["Open", "High", "Low", "Close", "Volume"],
            "dataset_type": "ohlcv",
            "indicators": [],
            "timeframe": "1h",
            "symbol": symbol_override or "BTC/USDT",
            "prediction_target": "classification"
        }

    features     = metadata.get("features", [])
    dataset_type = metadata.get("dataset_type", "ohlcv")
    indicators   = metadata.get("indicators", [])
    timeframe    = metadata.get("timeframe", "1h")
    symbol       = symbol_override or metadata.get("symbol", "BTC/USDT")
    prediction_target = metadata.get("prediction_target", "classification")
    plp_features = metadata.get("plp_features", [])

    if not features:
        raise ValueError("No features found in model metadata.")

    # ── 3. Load Scaler ───────────────────────────────────────────────────────
    scaler_path = model_path.replace(".pkl", ".scaler").replace(".pt", ".scaler").replace(".zip", ".scaler")
    scaler_x = None
    if os.path.exists(scaler_path):
        scaler_x = joblib.load(scaler_path)
    else:
        # Fallback: try to load from metadata path dir
        scaler_path_fallback = os.path.join(os.path.dirname(model_path), "model.scaler")
        if os.path.exists(scaler_path_fallback):
            scaler_x = joblib.load(scaler_path_fallback)
            
    # Handle explicit 'none' string saved by our new pipeline
    if isinstance(scaler_x, str) and scaler_x == "none":
        scaler_x = None

    # ── 4. Fetch Live Data ───────────────────────────────────────────────────
    if dataset_type in ("l2_orderbook", "hybrid_deep", "hybrid"):
        df = _fetch_live_l2_data(symbol, db)
        # Fallback: if L2 snapshots are unavailable/all-null, use OHLCV so
        # predict never returns a hard 500.
        if df is None or df.empty:
            print(f"[ml_predictor] L2 data unavailable for {symbol}; falling back to OHLCV.")
            df = _fetch_live_ohlcv(symbol, timeframe)
            # When an L2-trained model gets OHLCV data, inject proxy L2 features
            # so the model can still produce a prediction (missing cols are padded
            # with 0 anyway, but we need at least one matching feature to proceed).
            if df is not None and not df.empty:
                if 'microprice' not in df.columns:
                    df['microprice'] = df['Close']
                if 'obi' not in df.columns:
                    df['obi'] = 0.0
                if 'spread' not in df.columns:
                    # Estimate spread as 0.1% of price (typical for liquid futures)
                    df['spread'] = df['Close'] * 0.001
    else:
        df = _fetch_live_ohlcv(symbol, timeframe)

    if df is None or df.empty:
        raise RuntimeError(f"Could not fetch live data for {symbol}.")

    # ── 5. Calculate Indicators & PLP ────────────────────────────────────────
    if dataset_type not in ("l2_orderbook", "hybrid_deep"):
        df = _calculate_indicators(df, indicators)
        
    if plp_features:
        try:
            from app.services.predatory_liquidity_pipeline import calculate_plp_features
            plp_df = calculate_plp_features(df, plp_features)
            for col in plp_df.columns:
                if col not in df.columns:
                    df[col] = plp_df[col]
        except Exception as e:
            print(f"[ml_predictor] Failed to calculate PLP features: {e}")

    # ── 5.5 Fetch Recent Trades for Hybrid/Trade features ─────────────────────
    trade_features = {'cvd', 'buy_volume', 'sell_volume', 'trade_count', 'aggressor_ratio', 'large_trade_flag', 'vwap_deviation', 'trade_imbalance_ratio', 'tick_speed', 'price_impact', 'rolling_cvd_5', 'rolling_cvd_20'}
    missing_trade_feats = [f for f in features if f in trade_features and f not in df.columns]
    
    if missing_trade_feats:
        try:
            import ccxt
            exchange = ccxt.binance({'enableRateLimit': True})
            trades = exchange.fetch_trades(symbol, limit=1000)
            if trades:
                t_data = []
                for t in trades:
                    t_data.append({
                        'timestamp': pd.to_datetime(t['timestamp'], unit='ms'),
                        'price': float(t['price']),
                        'qty': float(t['amount']),
                        'is_buyer_maker': t['side'] == 'sell'
                    })
                df_trades = pd.DataFrame(t_data)
                df_trades.set_index('timestamp', inplace=True)
                
                from app.services.hybrid_deep_pipeline import calculate_trade_tick_features
                df_trades = calculate_trade_tick_features(df_trades, missing_trade_feats)
                
                # Take the last row of the engineered trade features and append to our main df
                last_trade_row = df_trades.iloc[-1]
                for col in missing_trade_feats:
                    if col in df_trades.columns:
                        df[col] = last_trade_row[col]
        except Exception as e:
            print(f"[ml_predictor] Failed to fetch live trades: {e}")

    # ── 6. Prepare Feature Row ───────────────────────────────────────────────
    # Take the last available row for prediction
    available_features = [f for f in features if f in df.columns]
    if not available_features:
        raise ValueError(f"None of the training features found in live data. Expected: {features[:5]}")

    # Use last complete row
    df.dropna(subset=available_features, inplace=True)
    if df.empty:
        raise RuntimeError("All rows dropped after dropna on features.")

    last_row = df[available_features].iloc[-1:].values.astype(float)
    current_price = float(df['Close'].iloc[-1]) if 'Close' in df.columns else float(df['close'].iloc[-1])

    # Pad missing features with 0 (maintain same column order as training)
    if len(available_features) < len(features):
        full_row = np.zeros((1, len(features)))
        for i, feat in enumerate(features):
            if feat in available_features:
                col_idx = available_features.index(feat)
                full_row[0, i] = last_row[0, col_idx]
        last_row = full_row

    # ── 5. Run Inference ─────────────────────────────────────────────────────
    try:
        # FIX: Use `last_row` instead of `df[features]` to avoid KeyError for missing/padded columns
        X = last_row
        
        # Scale
        if scaler_x is not None:
            X = scaler_x.transform(X)

        # Extract anomaly threshold for Auto-Encoder
        anomaly_threshold = None
        if version.explainability and isinstance(version.explainability, dict):
            anomaly_threshold = version.explainability.get("anomaly_threshold")

        signal_str, confidence = _run_inference(model_path, algorithm, X, prediction_target, features, anomaly_threshold)
        
        # Post-process Auto-Encoder signal with momentum heuristic
        if algorithm == "Auto-Encoder" and signal_str == "Market can sudden crash":
            try:
                if 'Close' in df.columns:
                    returns = df['Close'].pct_change().dropna().tail(10)
                    if returns.sum() > 0:
                        signal_str = "CRASH RISK"  # Anomaly during uptrend -> Crash
                    else:
                        signal_str = "PUMP RISK"   # Anomaly during downtrend -> Pump
            except Exception:
                signal_str = "ANOMALY"
        elif algorithm == "Auto-Encoder":
            signal_str = "NORMAL"
            
    except Exception as e:
        print(f"[ml_predictor] Inference error: {e}")
        signal_str, confidence = "HOLD", 0.0

    latency = time.time() - start_time
    try:
        from app.metrics import ML_PREDICTION_COUNT, ML_INFERENCE_LATENCY
        ML_PREDICTION_COUNT.labels(model_name=algorithm, symbol=symbol, signal=signal_str).inc()
        ML_INFERENCE_LATENCY.labels(model_name=algorithm).observe(latency)
    except Exception as e:
        print(f"[ml_predictor] Metrics error: {e}")

    # Save to PredictionLog for Drift Monitoring
    try:
        from app.models.prediction_log import PredictionLog
        log_entry = PredictionLog(
            model_id=model_id,
            symbol=symbol,
            timeframe=timeframe,
            predicted_signal=signal_str,
            confidence=round(confidence, 4),
            predicted_price=current_price,
            timestamp=datetime.utcnow(),
            metadata_json={"dataset_type": dataset_type, "features_used": len(available_features)}
        )
        db.add(log_entry)
        db.commit()
    except Exception as e:
        print(f"[ml_predictor] Failed to save prediction log: {e}")
        db.rollback()

    return {
        "signal":     signal_str,
        "confidence": round(confidence, 4),
        "price":      current_price,
        "symbol":     symbol,
        "algorithm":  algorithm,
        "timestamp":  datetime.utcnow().isoformat() + "Z",
        "features_used": len(available_features),
        "dataset_type":  dataset_type
    }


# ─── Internal Helpers ─────────────────────────────────────────────────────────

def _fetch_live_ohlcv(symbol: str, timeframe: str) -> Optional[pd.DataFrame]:
    """Fetch the last 100 candles via CCXT.
    Automatically uses binanceusdm for futures symbols (containing ':').
    """
    try:
        import ccxt
        tf_map = {
            "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
            "1h": "1h", "4h": "4h", "1d": "1d"
        }
        tf = tf_map.get(timeframe, "1h")

        # Futures symbols contain ':' (e.g. DOGE/USDT:USDT)
        if ":" in symbol:
            exchange = ccxt.binanceusdm({'enableRateLimit': True})
        else:
            exchange = ccxt.binance({'enableRateLimit': True})

        ohlcv = exchange.fetch_ohlcv(symbol, tf, limit=100)
        if not ohlcv:
            return None
        df = pd.DataFrame(ohlcv, columns=['timestamp', 'Open', 'High', 'Low', 'Close', 'Volume'])
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
        df.set_index('timestamp', inplace=True)
        return df
    except Exception as e:
        print(f"[ml_predictor] OHLCV fetch failed: {e}")
        return None


def _compute_micro_features_from_raw(bids, asks):
    """
    Compute obi, spread, microprice from raw bids/asks.
    Supports two formats:
      - Binance WebSocket: [[price_str, qty_str], ...]
      - Heatmap service:   [{'price': float, 'volume': float}, ...]
    Returns (obi, spread, microprice) or (None, None, None) on failure.
    """
    try:
        def _parse_level(level):
            if isinstance(level, dict):
                return float(level.get('price', 0) or 0), float(level.get('volume', level.get('qty', 0)) or 0)
            return float(level[0]), float(level[1])

        parsed_bids = [_parse_level(b) for b in (bids or [])[:10]]
        parsed_asks = [_parse_level(a) for a in (asks or [])[:10]]

        # Filter out zero-price levels (bad data from heatmap bucketing at 0)
        parsed_bids = [(p, q) for p, q in parsed_bids if p > 0]
        parsed_asks = [(p, q) for p, q in parsed_asks if p > 0]

        if not parsed_bids or not parsed_asks:
            return None, None, None

        best_bid = parsed_bids[0][0]
        best_ask = parsed_asks[0][0]
        spread   = best_ask - best_bid

        bid_vol = sum(q for _, q in parsed_bids)
        ask_vol = sum(q for _, q in parsed_asks)
        total   = bid_vol + ask_vol

        if total <= 0:
            return None, None, None

        obi        = (bid_vol - ask_vol) / total
        microprice = (best_bid * ask_vol + best_ask * bid_vol) / total
        return obi, spread, microprice
    except Exception:
        return None, None, None


def _fetch_live_l2_data(symbol: str, db: Session) -> Optional[pd.DataFrame]:
    """
    Fetch last L2 snapshots from the database.

    Fixes:
      1. Use timezone-aware datetime to match DB timestamp columns.
      2. Try both symbol formats (BTCUSDT + BTC/USDT) and widen time window.
      3. Recompute obi/spread/microprice from raw bids/asks when the
         snapshot was saved by orderbook_snapshot_service (which stores
         these as None with only raw bids/asks in dict format).
      4. Return None (→ OHLCV fallback) if all rows end up null.
    """
    try:
        from app.models.orderbook_snapshot import OrderBookSnapshot
        from app.services.auto_feature_selector import calculate_l2_advanced_features

        # ── timezone-aware 'since' ───────────────────────────────────────
        since = datetime.now(timezone.utc) - timedelta(hours=6)

        # ── try both symbol formats ─────────────────────────────────────
        clean_symbol = symbol.upper().split(":")[0].replace("/", "")   # BTCUSDT / DOGEUSDT
        slash_symbol = symbol.upper().split(":")[0]                     # BTC/USDT / DOGE/USDT

        snapshots = db.query(OrderBookSnapshot).filter(
            OrderBookSnapshot.symbol == clean_symbol,
            OrderBookSnapshot.timestamp >= since
        ).order_by(OrderBookSnapshot.timestamp.asc()).all()

        if not snapshots:
            snapshots = db.query(OrderBookSnapshot).filter(
                OrderBookSnapshot.symbol == slash_symbol,
                OrderBookSnapshot.timestamp >= since
            ).order_by(OrderBookSnapshot.timestamp.asc()).all()

        # Widen to 24h if still empty
        if not snapshots:
            since_wide = datetime.now(timezone.utc) - timedelta(hours=24)
            snapshots = db.query(OrderBookSnapshot).filter(
                OrderBookSnapshot.symbol.in_([clean_symbol, slash_symbol]),
                OrderBookSnapshot.timestamp >= since_wide
            ).order_by(OrderBookSnapshot.timestamp.asc()).all()
            if snapshots:
                print(f"[ml_predictor] Used 24h fallback window for {symbol} ({len(snapshots)} rows)")

        if not snapshots:
            print(f"[ml_predictor] No L2 snapshots for {symbol} in DB. Fetching live from Binance API...")
            try:
                import ccxt
                if ":" in symbol:
                    exchange = ccxt.binanceusdm({'enableRateLimit': True})
                else:
                    exchange = ccxt.binance({'enableRateLimit': True})
                
                ob = exchange.fetch_order_book(symbol, limit=20)
                obi, spread, microprice = _compute_micro_features_from_raw(ob.get('bids', []), ob.get('asks', []))
                
                if microprice is not None and microprice > 0:
                    df = pd.DataFrame([{
                        "timestamp": pd.to_datetime(exchange.milliseconds(), unit='ms', utc=True),
                        "Close": microprice,
                        "obi": obi,
                        "spread": spread,
                        "microprice": microprice,
                    }])
                    df.set_index("timestamp", inplace=True)
                    try:
                        df_feats, _ = calculate_l2_advanced_features(df.reset_index())
                        df_feats['timestamp'] = df.index
                        df_feats.set_index('timestamp', inplace=True)
                        for col in df_feats.columns:
                            if col not in df.columns:
                                df[col] = df_feats[col]
                    except Exception as e:
                        pass
                    return df
            except Exception as api_err:
                print(f"[ml_predictor] Live API L2 fetch failed: {api_err}. Falling back to OHLCV.")
            return None

        # ── Build DataFrame; recompute features from bids/asks when NULL ───
        data = []
        for s in snapshots:
            obi, spread, microprice = s.obi, s.spread, s.microprice

            # If core metrics are NULL (snapshot saved by orderbook_snapshot_service
            # which only stores raw bids/asks), recompute them on-the-fly.
            if obi is None or microprice is None:
                obi, spread, microprice = _compute_micro_features_from_raw(s.bids, s.asks)

            if microprice is None or microprice == 0:
                continue   # Skip unparseable rows

            data.append({
                "timestamp":  s.timestamp,
                "Close":      microprice,
                "obi":        obi,
                "spread":     spread,
                "microprice": microprice,
            })

        if not data:
            print(f"[ml_predictor] All {len(snapshots)} snapshots for {symbol} had null/zero microprice. Falling back to OHLCV.")
            return None

        df = pd.DataFrame(data)
        df.set_index("timestamp", inplace=True)

        # Cast to float (rows may have been stored as objects)
        for col in ["Close", "obi", "spread", "microprice"]:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")

        # Add advanced features
        try:
            df_feats, _ = calculate_l2_advanced_features(df.reset_index())
            df_feats['timestamp'] = df.index
            df_feats.set_index('timestamp', inplace=True)
            for col in df_feats.columns:
                if col not in df.columns:
                    df[col] = df_feats[col]
        except Exception:
            pass

        return df
    except Exception as e:
        print(f"[ml_predictor] L2 data fetch failed: {e}")
        return None


def _calculate_indicators(df: pd.DataFrame, indicators: list) -> pd.DataFrame:
    """Calculate the same technical indicators as used during training."""
    import pandas_ta as ta

    # pandas_ta requires lowercase column names for some methods
    from app.services.helpers.vwap_calculator import calculate_vwap_sd_features
    from app.services.helpers.institutional_features import add_smc_fvg, add_ict_killzones, add_wick_rejection, add_swing_structure, add_order_blocks

    INDICATOR_MAP = {
        "RSI":            lambda d: d.ta.rsi(append=True),
        "Stoch":          lambda d: d.ta.stoch(append=True),
        "ROC":            lambda d: d.ta.roc(append=True),
        "CCI":            lambda d: d.ta.cci(append=True),
        "WillR":          lambda d: d.ta.willr(append=True),
        "MFI":            lambda d: d.ta.mfi(append=True),
        "MACD":           lambda d: d.ta.macd(append=True),
        "EMA":            lambda d: d.ta.ema(append=True),
        "SMA":            lambda d: d.ta.sma(append=True),
        "ADX":            lambda d: d.ta.adx(append=True),
        "Supertrend":     lambda d: d.ta.supertrend(append=True),
        "Parabolic SAR":  lambda d: d.ta.psar(append=True),
        "BBANDS":         lambda d: d.ta.bbands(append=True),
        "ATR":            lambda d: d.ta.atr(append=True),
        "Keltner Channel":lambda d: d.ta.kc(append=True),
        "Donchian Channel":lambda d: d.ta.donchian(append=True),
        "OBV":            lambda d: d.ta.obv(append=True),
        "VWAP":           lambda d: d.ta.vwap(append=True),
        "CMF":            lambda d: d.ta.cmf(append=True),
        "ADOSC":          lambda d: d.ta.adosc(append=True),
        "SMC FVG":        lambda d: add_smc_fvg(d),
        "ICT Killzones":  lambda d: add_ict_killzones(d),
        "Wick Rejection": lambda d: add_wick_rejection(d),
        "Market Structure":lambda d: add_swing_structure(d),
        "Order Blocks":   lambda d: add_order_blocks(d),
    }

    for ind in indicators:
        try:
            if ind == "VWAP_SD":
                vwap_feats = calculate_vwap_sd_features(df, anchor='Daily')
                df['VWAP_Z_Score'] = vwap_feats['VWAP_Z_Score']
            elif ind in INDICATOR_MAP:
                INDICATOR_MAP[ind](df)
        except Exception:
            pass

    return df


def _run_inference(model_path: str, algorithm: str, X: np.ndarray, prediction_target: str, features: list = None, anomaly_threshold: float = None):
    """
    Load model and run inference. Returns (signal_str, confidence).
    signal_str : "BUY", "SELL", or "HOLD"
    confidence : 0.0 – 1.0
    """
    if algorithm in DEEP_LEARNING_ALGOS:
        return _infer_torch(model_path, algorithm, X, prediction_target, anomaly_threshold)
    elif algorithm in SKLEARN_ALGOS:
        return _infer_sklearn(model_path, X, prediction_target, features)
    elif algorithm in ["PPO-RL", "SAC-RL"]:
        return "HOLD", 0.5
    else:
        # Unknown — try sklearn first, then torch
        try:
            return _infer_sklearn(model_path, X, prediction_target, features)
        except Exception:
            try:
                pt_path = model_path.replace(".pkl", ".pt")
                return _infer_torch(pt_path, algorithm, X, prediction_target, anomaly_threshold)
            except Exception:
                return "HOLD", 0.5


def _infer_sklearn(model_path: str, X: np.ndarray, prediction_target: str, features: list = None):
    """Inference for sklearn-compatible models."""
    model = joblib.load(model_path)

    # ── Wrap X in DataFrame with feature names to suppress sklearn warning ─────
    # sklearn warns when model was fitted with feature names but gets a numpy array
    if features is not None:
        try:
            X_input = pd.DataFrame(X, columns=features[:X.shape[1]])
        except Exception:
            X_input = X  # Fallback to numpy if column count mismatch
    else:
        X_input = X

    if prediction_target == "classification":
        if hasattr(model, 'predict_proba'):
            proba = model.predict_proba(X_input)[0]
            label = int(np.argmax(proba))
            confidence = float(proba[label])
        else:
            label = int(model.predict(X_input)[0])
            confidence = 0.6

        signal_str = "BUY" if label == 1 else "SELL"
    else:
        pred = float(model.predict(X_input)[0])
        signal_str = "BUY" if pred > 0 else "SELL"
        confidence = min(0.95, abs(pred))

    return signal_str, confidence


def _infer_torch(model_path: str, algorithm: str, X: np.ndarray, prediction_target: str, anomaly_threshold: float = None):
    """Inference for PyTorch models. Reconstructs same tiny architecture as training."""
    import torch
    import torch.nn as nn
    from app.services.advanced_ml.architectures import TCNModel, TabNetEncoder, AutoEncoder

    pt_path = model_path if model_path.endswith(".pt") else model_path.replace(".pkl", ".pt")
    if not os.path.exists(pt_path):
        raise FileNotFoundError(f"PyTorch checkpoint not found: {pt_path}")

    input_size = X.shape[1]

    # ── Rebuild Architecture ──────────────────────────────────────────────────
    if algorithm == "LSTM":
        class SimpleLSTM(nn.Module):
            def __init__(self, input_size):
                super().__init__()
                self.lstm = nn.LSTM(input_size, 64, 2, batch_first=True)
                self.fc   = nn.Linear(64, 1)
            def forward(self, x):
                out, _ = self.lstm(x)
                return self.fc(out[:, -1, :])
        model = SimpleLSTM(input_size)
        X_t = torch.FloatTensor(X).unsqueeze(1)

    elif algorithm == "GRU":
        class SimpleGRU(nn.Module):
            def __init__(self, input_size):
                super().__init__()
                self.gru = nn.GRU(input_size, 64, 2, batch_first=True)
                self.fc  = nn.Linear(64, 1)
            def forward(self, x):
                out, _ = self.gru(x)
                return self.fc(out[:, -1, :])
        model = SimpleGRU(input_size)
        X_t = torch.FloatTensor(X).unsqueeze(1)

    elif algorithm in ("1D-CNN",):
        class CNN1D(nn.Module):
            def __init__(self, input_size):
                super().__init__()
                self.conv1 = nn.Conv1d(1, 16, 3, padding=1)
                self.relu  = nn.ReLU()
                self.pool  = nn.MaxPool1d(2)
                self.fc1   = nn.Linear(16 * (input_size // 2), 32)
                self.fc2   = nn.Linear(32, 1)
            def forward(self, x):
                x = x.unsqueeze(1)
                out = self.pool(self.relu(self.conv1(x)))
                out = out.view(out.size(0), -1)
                return self.fc2(self.relu(self.fc1(out)))
        model = CNN1D(input_size)
        X_t = torch.FloatTensor(X)

    elif algorithm == "DeepLOB":
        class DeepLOB(nn.Module):
            def __init__(self, input_size):
                super().__init__()
                self.conv1 = nn.Conv1d(1, 16, 2, padding=1)
                self.relu  = nn.ReLU()
                self.lstm  = nn.LSTM(16, 32, 1, batch_first=True)
                self.fc    = nn.Linear(32, 1)
            def forward(self, x):
                x = x.unsqueeze(1)
                x = self.relu(self.conv1(x))
                x = x.transpose(1, 2)
                out, _ = self.lstm(x)
                return self.fc(out[:, -1, :])
        model = DeepLOB(input_size)
        X_t = torch.FloatTensor(X)

    elif algorithm == "TCN":
        model = TCNModel(input_size=input_size, num_channels=[32, 64, 128], output_size=1)
        X_t = torch.FloatTensor(X).unsqueeze(1)

    elif algorithm == "TabNet":
        model = TabNetEncoder(input_dim=input_size, output_dim=1)
        X_t = torch.FloatTensor(X)

    elif algorithm == "Auto-Encoder":
        model = AutoEncoder(input_dim=input_size, hidden_dim=32)
        X_t = torch.FloatTensor(X)

    else:
        # Transformer or unknown — simple MLP fallback
        class MLPFallback(nn.Module):
            def __init__(self, input_size):
                super().__init__()
                self.net = nn.Sequential(
                    nn.Linear(input_size, 64), nn.ReLU(),
                    nn.Linear(64, 32), nn.ReLU(),
                    nn.Linear(32, 1)
                )
            def forward(self, x):
                return self.net(x)
        model = MLPFallback(input_size)
        X_t = torch.FloatTensor(X)

    # Load weights (strict=False to handle minor arch differences)
    state = torch.load(pt_path, map_location='cpu')
    model.load_state_dict(state, strict=False)
    model.eval()

    with torch.no_grad():
        if algorithm == "Auto-Encoder":
            reconstructed = model(X_t)
            raw = torch.mean((reconstructed - X_t) ** 2, dim=1).numpy().flatten()[0]
        else:
            raw = model(X_t).numpy().flatten()[0]

    if algorithm == "Auto-Encoder":
        # Check against threshold
        if anomaly_threshold is not None and raw > anomaly_threshold:
            signal_str = "Market can sudden crash"
            confidence = min(0.99, float(raw / (anomaly_threshold + 1e-9))) # Scale confidence
        else:
            signal_str = "Market can pump heavily"
            confidence = 0.5  # Normal market has neutral confidence in this context
    else:
        if prediction_target == "classification":
            prob = float(1 / (1 + np.exp(-raw)))
            signal_str = "BUY" if prob >= 0.5 else "SELL"
            confidence = prob if prob >= 0.5 else 1 - prob
        else:
            signal_str = "BUY" if raw > 0 else "SELL"
            confidence = min(0.95, abs(float(raw)))

    return signal_str, confidence
