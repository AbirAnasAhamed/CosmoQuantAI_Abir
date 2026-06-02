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

def predict(model_id: str, symbol_override: Optional[str], db: Session, sequence_length: Optional[int] = None) -> dict:
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
    # Priority order:
    #   1. version.metadata_path from DB (set by our fixed upload pipeline)
    #   2. metadata.json in the same directory as the model file
    #   3. Old naming convention: <model_name>.json (legacy)
    #   4. Hardcoded fallback (no metadata at all)
    metadata = None

    # Priority 1: DB-stored path (most reliable)
    if version.metadata_path and os.path.exists(version.metadata_path):
        try:
            with open(version.metadata_path, "r") as f:
                metadata = json.load(f)
            print(f"[ml_predictor] Loaded metadata from DB path: {version.metadata_path}")
        except Exception as e:
            print(f"[ml_predictor] Failed to read DB metadata_path: {e}")

    # Priority 2: metadata.json in the same folder as the weight file
    if metadata is None:
        meta_in_dir = os.path.join(os.path.dirname(model_path), "metadata.json")
        if os.path.exists(meta_in_dir):
            try:
                with open(meta_in_dir, "r") as f:
                    metadata = json.load(f)
                print(f"[ml_predictor] Loaded metadata from directory: {meta_in_dir}")
            except Exception as e:
                print(f"[ml_predictor] Failed to read directory metadata.json: {e}")

    # Priority 3: Legacy naming (model_name.json beside the weight file)
    if metadata is None:
        legacy_path = model_path.replace(".pkl", ".json").replace(".pt", ".json").replace(".zip", ".json")
        if os.path.exists(legacy_path):
            try:
                with open(legacy_path, "r") as f:
                    metadata = json.load(f)
                print(f"[ml_predictor] Loaded metadata from legacy path: {legacy_path}")
            except Exception as e:
                print(f"[ml_predictor] Failed to read legacy metadata: {e}")

    # Priority 4: Hardcoded fallback — use model's known symbol from DB if available
    if metadata is None:
        fallback_symbol = symbol_override or "BTC/USDT"
        print(f"[ml_predictor] No metadata found for model {model_id}. Using fallback symbol: {fallback_symbol}")
        metadata = {
            "features": ["Open", "High", "Low", "Close", "Volume"],
            "dataset_type": "ohlcv",
            "indicators": [],
            "timeframe": "1h",
            "symbol": fallback_symbol,
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
        df = _fetch_live_l2_data(symbol, db, sequence_length=sequence_length)
        if df is None or df.empty:
            raise RuntimeError(f"Live L2 data is currently unavailable for {symbol}. Cannot generate a valid prediction for an L2-trained model.")
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

    # ── 6. Prepare Feature Row / Sequence ────────────────────────────────────
    available_features = [f for f in features if f in df.columns]
    if not available_features:
        raise ValueError(f"None of the training features found in live data. Expected: {features[:5]}")

    df[available_features] = df[available_features].ffill().fillna(0)

    current_price = float(df['Close'].iloc[-1]) if 'Close' in df.columns else float(df['close'].iloc[-1])

    seq_len = sequence_length if sequence_length and sequence_length > 1 else 1
    # Extract last `seq_len` rows
    sequence_data = df[available_features].tail(seq_len).values.astype(float)

    # Pad missing features (columns) with 0
    if len(available_features) < len(features):
        padded_seq = np.zeros((sequence_data.shape[0], len(features)))
        for i, feat in enumerate(features):
            if feat in available_features:
                col_idx = available_features.index(feat)
                padded_seq[:, i] = sequence_data[:, col_idx]
        sequence_data = padded_seq

    # If rows are fewer than requested seq_len, pad by repeating the first available row
    if sequence_data.shape[0] < seq_len:
        padding_needed = seq_len - sequence_data.shape[0]
        padding = np.repeat(sequence_data[0:1], padding_needed, axis=0)
        sequence_data = np.vstack([padding, sequence_data])

    # ── 5. Run Inference ─────────────────────────────────────────────────────
    try:
        X = sequence_data  # Shape: (seq_len, features)
        
        # Scale
        if scaler_x is not None:
            X = scaler_x.transform(X)

        # Extract anomaly threshold for Auto-Encoder
        anomaly_threshold = None
        if version.explainability and isinstance(version.explainability, dict):
            anomaly_threshold = version.explainability.get("anomaly_threshold")

        signal_str, confidence = _run_inference(model_path, algorithm, X, prediction_target, features, anomaly_threshold, current_price)
        
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

        ohlcv = exchange.fetch_ohlcv(symbol, tf, limit=1000)
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


def _fetch_live_l2_data(symbol: str, db: Session, sequence_length: Optional[int] = None) -> Optional[pd.DataFrame]:
    """
    Fetch Live L2 Data. If sequence_length > 1, prioritize fetching from DB to build sequence,
    then append the latest API call for exact real-time ending.
    """
    from app.services.auto_feature_selector import calculate_l2_advanced_features
    import ccxt
    
    seq_len = sequence_length if sequence_length and sequence_length > 1 else 1

    df_db = None
    if seq_len > 1:
        print(f"[ml_predictor] Fetching recent {seq_len} snapshots from DB for {symbol}...")
        try:
            from app.models.orderbook_snapshot import OrderBookSnapshot
            since = datetime.now(timezone.utc) - timedelta(hours=6)
            clean_symbol = symbol.upper().split(":")[0].replace("/", "")
            slash_symbol = symbol.upper().split(":")[0]

            snapshots = db.query(OrderBookSnapshot).filter(
                OrderBookSnapshot.symbol.in_([clean_symbol, slash_symbol]),
                OrderBookSnapshot.timestamp >= since
            ).order_by(OrderBookSnapshot.timestamp.desc()).limit(seq_len).all()
            
            if snapshots:
                data = []
                for s in reversed(snapshots): # asc order
                    obi, spread, microprice = s.obi, s.spread, s.microprice
                    if obi is None or microprice is None:
                        obi, spread, microprice = _compute_micro_features_from_raw(s.bids, s.asks)
                    if microprice is None or microprice == 0: continue
                    data.append({
                        "timestamp": s.timestamp,
                        "Close": microprice,
                        "obi": obi,
                        "spread": spread,
                        "microprice": microprice,
                    })
                if data:
                    df_db = pd.DataFrame(data)
                    df_db.set_index("timestamp", inplace=True)
        except Exception as e:
            print(f"[ml_predictor] DB L2 fetch failed: {e}")

    print(f"[ml_predictor] Fetching LIVE L2 Orderbook directly from Binance API for {symbol}...")
    try:
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
            except Exception:
                pass
            if df_db is not None and not df_db.empty:
                df = pd.concat([df_db, df]).drop_duplicates()
                df.sort_index(inplace=True)
            return df
    except Exception as api_err:
        print(f"[ml_predictor] Live API L2 fetch failed: {api_err}. Falling back to DB historical snapshots.")
        if df_db is not None and not df_db.empty:
            try:
                df_feats, _ = calculate_l2_advanced_features(df_db.reset_index())
                df_feats['timestamp'] = df_db.index
                df_feats.set_index('timestamp', inplace=True)
                for col in df_feats.columns:
                    if col not in df_db.columns:
                        df_db[col] = df_feats[col]
            except Exception:
                pass
            return df_db

    # ── Fallback to DB (If seq_len == 1 but API failed) ──────────────────────
    try:
        from app.models.orderbook_snapshot import OrderBookSnapshot
        since = datetime.now(timezone.utc) - timedelta(hours=6)
        clean_symbol = symbol.upper().split(":")[0].replace("/", "")   # BTCUSDT
        slash_symbol = symbol.upper().split(":")[0]                     # BTC/USDT

        snapshots = db.query(OrderBookSnapshot).filter(
            OrderBookSnapshot.symbol == clean_symbol,
            OrderBookSnapshot.timestamp >= since
        ).order_by(OrderBookSnapshot.timestamp.asc()).all()

        if not snapshots:
            snapshots = db.query(OrderBookSnapshot).filter(
                OrderBookSnapshot.symbol == slash_symbol,
                OrderBookSnapshot.timestamp >= since
            ).order_by(OrderBookSnapshot.timestamp.asc()).all()

        if not snapshots:
            since_wide = datetime.now(timezone.utc) - timedelta(hours=24)
            snapshots = db.query(OrderBookSnapshot).filter(
                OrderBookSnapshot.symbol.in_([clean_symbol, slash_symbol]),
                OrderBookSnapshot.timestamp >= since_wide
            ).order_by(OrderBookSnapshot.timestamp.asc()).all()

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


def _run_inference(model_path: str, algorithm: str, X: np.ndarray, prediction_target: str, features: list = None, anomaly_threshold: float = None, current_price: float = 0.0):
    """
    Load model and run inference. Returns (signal_str, confidence).
    signal_str : "BUY", "SELL", or "HOLD"
    confidence : 0.0 – 1.0
    """
    if algorithm in DEEP_LEARNING_ALGOS:
        return _infer_torch(model_path, algorithm, X, prediction_target, anomaly_threshold)
    elif algorithm in SKLEARN_ALGOS:
        return _infer_sklearn(model_path, X, prediction_target, features)
    elif algorithm in ["PPO-RL", "SAC-RL", "A2C-RL", "DDPG-RL", "DQN-RL", "TD3-RL", "QR-DQN", "CQL", "GAIL", "Decision-Transformer", "Liquid-NN"]:
        return _infer_rl(model_path, algorithm, X, features=features, current_price=current_price)
    else:
        # Unknown — try sklearn first, then torch, then RL
        try:
            return _infer_sklearn(model_path, X, prediction_target, features)
        except Exception:
            try:
                pt_path = model_path.replace(".pkl", ".pt")
                return _infer_torch(pt_path, algorithm, X, prediction_target, anomaly_threshold)
            except Exception:
                return _infer_rl(model_path, algorithm, X, features=features, current_price=current_price)


def _infer_rl(model_path: str, algorithm: str, X: np.ndarray, features: list = None, current_price: float = 0.0):
    """Inference for Stable-Baselines3 Reinforcement Learning agents."""
    try:
        from stable_baselines3 import PPO, SAC, A2C, DDPG, DQN, TD3
        import numpy as np
        model_class = None
        if "PPO" in algorithm: model_class = PPO
        elif "SAC" in algorithm: model_class = SAC
        elif "A2C" in algorithm: model_class = A2C
        elif "DDPG" in algorithm: model_class = DDPG
        elif "DQN" in algorithm: model_class = DQN
        elif "TD3" in algorithm: model_class = TD3
        else:
            # Fallback to PPO loading mechanism if algo uses same architecture
            model_class = PPO
            
        if not model_class:
            return "HOLD", 0.5

        model = model_class.load(model_path)
        
        if features and 'Close' not in features:
            obs = np.append(X[-1:], [[current_price]], axis=1) # RL only needs last row unless state_dim is multiplied
        else:
            obs = X[-1:] # Take the last row for RL by default
            
        obs = obs.astype(np.float32)
        action, _ = model.predict(obs, deterministic=True)
        
        # Action is usually a 1D array or scalar
        action_val = action[0] if isinstance(action, (np.ndarray, list)) and len(action) > 0 else action

        # Map to Signal
        is_continuous = algorithm in ["SAC-RL", "DDPG-RL", "TD3-RL"]
        
        if is_continuous:
            action_val = float(action_val)
            if action_val < -0.33:
                return "SELL", min(0.99, abs(action_val))
            elif action_val > 0.33:
                return "BUY", min(0.99, abs(action_val))
            else:
                return "HOLD", 0.5
        else:
            action_val = int(action_val)
            if action_val == 1:
                return "BUY", 0.8
            elif action_val == 2:
                return "SELL", 0.8
            else:
                return "HOLD", 0.5
                
    except Exception as e:
        print(f"[ml_predictor] RL Inference error: {e}")
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

    # Sklearn expects 2D array, we extract the last row if sequence was requested
    # because standard sklearn doesn't support 3D sequences.
    X_input = X_input[-1:] if isinstance(X_input, (np.ndarray, pd.DataFrame)) else X_input

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
        
        # If batch_first=True, expected shape is (batch, seq, feature)
        # Our X is currently (seq, feature), so unsqueeze(0) gives (1, seq, feature)
        if len(X.shape) == 2:
            X_t = torch.FloatTensor(X).unsqueeze(0)
        else:
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
        if len(X.shape) == 2:
            X_t = torch.FloatTensor(X).unsqueeze(0)
        else:
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
        if len(X.shape) == 2:
            X_t = torch.FloatTensor(X[-1:]).unsqueeze(0) # CNN trained on unsqueeze(1) (batch, 1, feat) fallback
        else:
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
        if len(X.shape) == 2:
            X_t = torch.FloatTensor(X[-1:]) # DeepLOB trained expecting (batch, feat)
        else:
            X_t = torch.FloatTensor(X)

    elif algorithm == "TCN":
        model = TCNModel(input_size=input_size, num_channels=[32, 64, 128], output_size=1)
        if len(X.shape) == 2:
            X_t = torch.FloatTensor(X).unsqueeze(0)
        else:
            X_t = torch.FloatTensor(X).unsqueeze(1)

    elif algorithm == "TabNet":
        model = TabNetEncoder(input_dim=input_size, output_dim=1)
        X_t = torch.FloatTensor(X[-1:])

    elif algorithm == "Auto-Encoder":
        model = AutoEncoder(input_dim=input_size, hidden_dim=32)
        X_t = torch.FloatTensor(X[-1:])

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
        X_t = torch.FloatTensor(X[-1:])

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
