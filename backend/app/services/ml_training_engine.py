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
from app.services.ml_utils import extract_feature_importance, calculate_classification_metrics, calculate_regression_metrics, generate_real_explainability
from app.services.auto_feature_selector import calculate_l2_advanced_features
from app.services.advanced_ml.engine import AdvancedMLEngine # ✅ Import New Engine
from app.services.helpers.vwap_calculator import calculate_vwap_sd_features
from app.services.helpers.institutional_features import add_smc_fvg, add_ict_killzones, add_wick_rejection, add_swing_structure, add_order_blocks
# ✅ NEW: Modular ML Pipeline Services
from app.services.ml_walk_forward_cv import run_walk_forward_cv
from app.services.ml_backtest_runner import run_post_training_backtest

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
    # Most common CCXT timeframes
    tf_map = {
        "1s": "1s", "1m": "1m", "3m": "3m", "5m": "5m", 
        "15m": "15m", "30m": "30m", "1h": "1h", "2h": "2h", 
        "4h": "4h", "6h": "6h", "8h": "8h", "12h": "12h", 
        "1d": "1d", "3d": "3d", "1w": "1w", "1M": "1M"
    }
    # If timeframe is not in map, just pass it to CCXT directly (e.g. 5s if supported)
    # But if CCXT fails, we catch it below.
    tf = tf_map.get(timeframe, timeframe)
    
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

class TrainingCancelledException(BaseException):
    """Raised when user cancels training. Inherits BaseException to bypass except Exception handlers."""
    pass

def _run_live_scraper(symbol: str, target_rows: int, db: Session, job: models.ModelTrainingJob, add_log_func) -> pd.DataFrame:
    """Run the async scraper synchronously inside the celery task."""
    try:
        return asyncio.run(_async_live_scraper(symbol, target_rows, db, job, add_log_func))
    except TrainingCancelledException:
        raise  # Let it propagate to train_model_task
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
    
    from app.services.websocket_manager import manager
    
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
                    
                    # Broadcast live tick to the frontend Visualizer
                    try:
                        payload = {
                            "type": "live_tick",
                            "symbol": symbol,
                            "timestamp": ts.isoformat(),
                            "Close": microprice,
                            "obi": obi,
                            "spread": spread
                        }
                        await manager.broadcast(json.dumps(payload), channel_id="training_visualizer")
                    except Exception as e:
                        pass
                    
                    if len(buffer) >= 500:
                        db.bulk_save_objects(buffer)
                        db.commit()
                        buffer.clear()
                        
                    # 🛑 Cancel check — runs every 50 rows (lightweight, avoids DB spam)
                    if scraped_count % 50 == 0:
                        db.refresh(job)
                        if job.status == models.TrainingStatus.FAILED and job.error_message and "cancelled" in job.error_message.lower():
                            add_log_func("🛑 Scraper stopped by user cancellation.")
                            raise TrainingCancelledException("Training cancelled by user during live scraping.")
                        
                    if scraped_count % log_interval == 0:
                        pct = min(100.0, (scraped_count / target_rows) * 100.0)
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

def _run_live_trade_scraper(symbol: str, target_rows: int, db: Session, job: models.ModelTrainingJob, add_log_func) -> pd.DataFrame:
    try:
        return asyncio.run(_async_live_trade_scraper(symbol, target_rows, db, job, add_log_func))
    except TrainingCancelledException:
        raise
    except Exception as e:
        add_log_func(f"Trade Scraper crashed: {e}")
        return pd.DataFrame()

async def _async_live_trade_scraper(symbol: str, target_rows: int, db: Session, job: models.ModelTrainingJob, add_log_func) -> pd.DataFrame:
    clean_symbol = symbol.upper().split(":")[0].replace("/", "")
    ws_url = f"wss://stream.binance.com:9443/ws/{clean_symbol.lower()}@trade"
    data = []
    scraped_count = 0
    
    log_interval = max(50, target_rows // 50)  # Log at least 50 times total, minimum every 50 trades
    retry_count = 0
    max_retries = 5
    
    while scraped_count < target_rows and retry_count < max_retries:
        try:
            async with websockets.connect(ws_url, ping_interval=30, ping_timeout=10) as ws:
                add_log_func(f"Trade WebSocket connected. Scraping started...")
                retry_count = 0
                
                while scraped_count < target_rows:
                    msg = await asyncio.wait_for(ws.recv(), timeout=15)
                    msg_data = json.loads(msg)
                    
                    if msg_data.get('e') != 'trade':
                        continue
                        
                    ts = msg_data.get('T')
                    price = float(msg_data.get('p', 0))
                    amount = float(msg_data.get('q', 0))
                    is_buyer_maker = msg_data.get('m', False)
                    side = 'sell' if is_buyer_maker else 'buy'
                    
                    data.append({
                        'timestamp': ts,
                        'price': price,
                        'amount': amount,
                        'side': side
                    })
                    scraped_count += 1
                    
                    if scraped_count % 50 == 0:
                        db.refresh(job)
                        if job.status == models.TrainingStatus.FAILED and job.error_message and "cancelled" in job.error_message.lower():
                            add_log_func("🛑 Scraper stopped by user cancellation.")
                            raise TrainingCancelledException("Training cancelled by user during live scraping.")
                            
                    if scraped_count % log_interval == 0:
                        pct_scraped = min(100.0, (scraped_count / target_rows) * 100.0)
                        job.progress = pct_scraped
                        db.commit()
                        add_log_func(f"[Trade Scraper] ⬇️  {scraped_count:,} / {target_rows:,} trades collected ({pct_scraped:.1f}%)...")
                        
        except asyncio.TimeoutError:
            add_log_func("WebSocket timeout. Reconnecting...")
            retry_count += 1
            await asyncio.sleep(2)
        except websockets.exceptions.ConnectionClosed:
            add_log_func("WebSocket connection closed. Reconnecting...")
            retry_count += 1
            await asyncio.sleep(2)
        except TrainingCancelledException:
            raise
        except Exception as e:
            add_log_func(f"WebSocket error: {e}. Reconnecting...")
            retry_count += 1
            await asyncio.sleep(2)
            
    add_log_func(f"Trade Scraping completed. Total rows: {len(data)}")
    df = pd.DataFrame(data)
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

    def check_cancelled():
        db.refresh(job)
        if job.status == models.TrainingStatus.FAILED and job.error_message and "cancelled" in job.error_message.lower():
            raise Exception("Training cancelled by user.")

    import threading
    import time
    
    stop_heartbeat = threading.Event()
    def heartbeat_worker():
        start_time = time.time()
        while not stop_heartbeat.is_set():
            elapsed = int(time.time() - start_time)
            prog = getattr(job, 'progress', 0.0)
            print(f"[CELERY-HEARTBEAT] ⏳ Job {job_id} is running... Elapsed: {elapsed}s | Progress: {prog:.1f}%")
            stop_heartbeat.wait(10)
            
    heartbeat_thread = threading.Thread(target=heartbeat_worker, daemon=True)
    heartbeat_thread.start()

    try:
        check_cancelled()
        job.status = models.TrainingStatus.RUNNING
        job.progress = 5.0
        add_log(f"Starting training job for {job.symbol} using {job.algorithm}")
        
        config = job.config or {}
        dataset_type = config.get("dataset_type", "ohlcv")
        
        # ── Update Prometheus Metrics ──
        try:
            from app.metrics import TRAINING_JOB_COUNT
            TRAINING_JOB_COUNT.labels(algorithm=job.algorithm, dataset_type=dataset_type).inc()
        except Exception as e:
            add_log(f"⚠️ Failed to update metrics: {e}")

        lookback_hours = config.get("data_lookback_hours", 6)

        # ── Fine-Tune Detection ─────────────────────────────────────────────
        _prev_path = config.get("previous_model_path")
        _target_model_id = config.get("target_model_id")
        
        source_algo = None
        
        if _target_model_id and not _prev_path:
            target_model = db.query(models.CustomMLModel).filter(models.CustomMLModel.id == _target_model_id).first()
            if target_model:
                source_algo = target_model.model_type
                if target_model.active_version_id:
                    version = db.query(models.ModelVersion).filter(models.ModelVersion.id == target_model.active_version_id).first()
                    if version:
                        _prev_path = version.file_path

        # Attempt to find source algorithm from path if not found yet
        if _prev_path and not source_algo:
            import re
            match = re.search(r'(train_\d+)', str(_prev_path))
            if match:
                prev_job_id = match.group(1)
                prev_job = db.query(models.ModelTrainingJob).filter(models.ModelTrainingJob.id == prev_job_id).first()
                if prev_job:
                    source_algo = prev_job.algorithm

        is_fine_tune = (
            bool(config.get("fine_tune", False)) and
            _prev_path is not None and
            os.path.exists(str(_prev_path))
        )
        ft_label = f"🔄 Fine-Tune from: {_prev_path}" if is_fine_tune else "🆕 Fresh Training (no prior checkpoint)"
        add_log(ft_label)
        
        is_cross_algorithm_transfer = config.get("is_cross_algorithm_transfer", False)
        if is_cross_algorithm_transfer and _prev_path and os.path.exists(_prev_path):
            if source_algo:
                config["source_algorithm"] = source_algo
                add_log(f"🔍 Detected source algorithm: {source_algo} for cross-algorithm transfer.")
                
            from app.services.ml_transfer_learning import CrossAlgorithmTransfer
            add_log(f"🔄 Cross-Algorithm Transfer Activated: Extracting knowledge to target: {job.algorithm}")
            success, config, temp_mapped_path = CrossAlgorithmTransfer.initialize(_prev_path, job.algorithm, config)
            if success:
                add_log("✅ Institutional Grade Knowledge Transfer setup successful!")
                _prev_path = temp_mapped_path
                # Keep is_fine_tune = False for non-RL, so it doesn't crash loading incompatible weights directly.
                # For RL, we pass it down, and the engine handles it.
                if job.algorithm not in ["PPO-RL", "SAC-RL"]:
                    is_fine_tune = False
            else:
                add_log("⚠️ Transfer failed or unsupported pair. Falling back to fresh training.")
                is_fine_tune = False
        
        if dataset_type == "hybrid_deep":
            # ── NEW: Dual WebSocket L2 + aggTrade pipeline ──────────────────
            from app.services.hybrid_deep_pipeline import build_hybrid_deep_dataset
            df, features = build_hybrid_deep_dataset(job, db, config, add_log)
            job.progress = 100.0

        elif dataset_type == "hybrid":
            from app.services.hybrid_pipeline import build_hybrid_dataset
            df, features = build_hybrid_dataset(job, db, config, add_log)
            job.progress = 100.0
            
        elif dataset_type == "l2_orderbook":
            resample_l2 = config.get("resample_l2", True)
            timeframe_to_pass = job.timeframe if resample_l2 else None
            
            is_deep_training = config.get("is_deep_training", False)
            target_rows = config.get("target_rows", 0)

            if is_deep_training and target_rows > 0:
                min_required_rows = 1000
                if target_rows < min_required_rows:
                    add_log(f"⚠️ Target rows ({target_rows}) is too low for PLP/Rolling features. Auto-increasing to {min_required_rows}.")
                    target_rows = min_required_rows
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
            
            job.progress = 100.0
            
            # Use L2 specific features chosen by user, default to basics
            features = config.get("l2_features", ["obi", "spread", "microprice"])
            available_feats = [f for f in features if f in df.columns]
            if not available_feats:
                available_feats = ["Close"]
            features = available_feats
            add_log(f"Using {len(features)} L2 features for training.")
            
            prediction_target = config.get("prediction_target", "classification")
            if prediction_target == "classification":
                future_max = df['Close'].rolling(window=5).max().shift(-5)
                df['Target'] = (future_max > df['Close']).astype(int)
            else:
                df['Target'] = df['Close'].shift(-5)
                
            # ── Predatory Liquidity Pipeline (PLP) Features ──────────────────────
            sel_plp = config.get("plp_features", [])
            if sel_plp:
                add_log(f"[L2] Calculating {len(sel_plp)} Predatory Liquidity Pipeline (PLP) features...")
                try:
                    from app.services.predatory_liquidity_pipeline import calculate_plp_features
                    plp_df = calculate_plp_features(df, sel_plp)
                    for col in plp_df.columns:
                        if col not in df.columns:
                            df[col] = plp_df[col]
                    # Append only the PLP cols that were actually generated
                    plp_added = [c for c in sel_plp if c in df.columns and c not in features]
                    features.extend(plp_added)
                    add_log(f"[L2] PLP features engineered: {len(plp_added)} added → total features now {len(features)}.")
                except Exception as e:
                    add_log(f"[L2] ⚠️ PLP feature generation failed (non-fatal): {e}")

            from app.services.ml_utils import apply_data_cleaning
            df = apply_data_cleaning(df, config, add_log)
            if len(df) < 10:
                raise Exception(f"Not enough L2 data to train a model. Found {len(df)} rows after processing. Please lower timeframe or collect more data.")

                
        elif dataset_type == "historical_trades":
            from app.services.trade_data_processor import process_historical_trades
            trade_file = config.get("trade_file")
            bar_type = config.get("bar_type", "time")
            bar_size = config.get("bar_size", "1m")
            volume_threshold = float(config.get("volume_threshold", 10.0))
            is_deep_training = config.get("is_deep_training", False)
            target_rows = config.get("target_rows", 0)
            
            # ── Timeframe fallback ladder for Time Bars ──────────────────────
            # Ordered from smallest to largest (retry goes down this list)
            TIME_BAR_FALLBACK = ['1s', '5s', '1m', '5m', '15m', '1h', '4h', '1d']
            MIN_BARS_REQUIRED = 50  # Minimum bars needed for meaningful ML training

            if is_deep_training and target_rows > 0:
                min_required_rows = 1000
                if target_rows < min_required_rows:
                    add_log(f"⚠️ Target rows ({target_rows}) is too low to form enough bars. Auto-increasing to {min_required_rows}.")
                    target_rows = min_required_rows
                add_log(f"Starting Deep Training for Trades. Target: {target_rows} rows from Live Binance WebSocket...")
                df_raw = _run_live_trade_scraper(job.symbol, target_rows, db, job, add_log)
                if df_raw.empty:
                    raise Exception("Deep Training failed. Trade Scraper returned empty dataset.")
                
                df = process_historical_trades(
                    df_raw=df_raw, 
                    bar_type=bar_type, 
                    bar_size=bar_size, 
                    volume_threshold=volume_threshold, 
                    add_log_func=add_log
                )

                # ── Smart Bar Validation: Auto-retry with smaller timeframe ──
                if bar_type == "time" and len(df) < MIN_BARS_REQUIRED:
                    add_log(f"⚠️  Only {len(df)} bar(s) generated with '{bar_size}' timeframe from {target_rows} ticks.")
                    add_log(f"   High-frequency pairs (e.g. BTC/USDT) trade ~300–500 ticks/sec.")
                    add_log(f"   Trying smaller timeframes automatically...")

                    current_idx = TIME_BAR_FALLBACK.index(bar_size) if bar_size in TIME_BAR_FALLBACK else 2
                    # Try every timeframe smaller than the chosen one
                    for fallback_tf in TIME_BAR_FALLBACK[:current_idx]:
                        add_log(f"   🔄 Retrying with bar_size='{fallback_tf}'...")
                        df_retry = process_historical_trades(
                            df_raw=df_raw,
                            bar_type="time",
                            bar_size=fallback_tf,
                            volume_threshold=volume_threshold,
                            add_log_func=lambda msg: None  # silent retry
                        )
                        if len(df_retry) >= MIN_BARS_REQUIRED:
                            add_log(f"   ✅ Auto-fixed! Generated {len(df_retry)} bars using '{fallback_tf}' timeframe.")
                            df = df_retry
                            bar_size = fallback_tf  # update for logging
                            break
                    else:
                        # Still not enough — try volume bars as last resort
                        add_log(f"   🔄 Time bars insufficient. Trying Volume Bars (threshold: auto)...")
                        auto_vol_threshold = max(0.1, (df_raw['amount'].sum() / MIN_BARS_REQUIRED))
                        df_vol = process_historical_trades(
                            df_raw=df_raw,
                            bar_type="volume",
                            volume_threshold=auto_vol_threshold,
                            add_log_func=lambda msg: None
                        )
                        if len(df_vol) >= MIN_BARS_REQUIRED:
                            add_log(f"   ✅ Auto-fixed! Generated {len(df_vol)} Volume Bars (threshold={auto_vol_threshold:.4f}).")
                            df = df_vol
                        else:
                            # Give up with a helpful message
                            needed_for_1m = MIN_BARS_REQUIRED * 60 * 400  # ~50 bars × 60s × 400 trades/s
                            raise Exception(
                                f"Too few bars generated ({len(df)}) from {target_rows} ticks with '{bar_size}' timeframe. "
                                f"For '{bar_size}' Time Bars on BTC/USDT, you need at least ~{needed_for_1m:,} ticks. "
                                f"💡 Fix options: (1) Increase Target Rows significantly, "
                                f"(2) Switch to '1s' Bar Timeframe, or (3) Use Volume Bars."
                            )

            else:
                if not trade_file:
                    raise Exception("No Trade CSV file selected for Historical Trades training.")
                    
                file_path = os.path.join("app/data_feeds", trade_file)
                add_log(f"Loading Historical Trades from {file_path}")
                
                df = process_historical_trades(
                    file_path=file_path, 
                    bar_type=bar_type, 
                    bar_size=bar_size, 
                    volume_threshold=volume_threshold, 
                    add_log_func=add_log
                )

                # ── Smart Bar Validation for CSV mode too ──────────────────
                if bar_type == "time" and len(df) < MIN_BARS_REQUIRED:
                    add_log(f"⚠️  Only {len(df)} bar(s) from CSV with '{bar_size}' timeframe. Trying smaller timeframes...")
                    current_idx = TIME_BAR_FALLBACK.index(bar_size) if bar_size in TIME_BAR_FALLBACK else 2
                    for fallback_tf in TIME_BAR_FALLBACK[:current_idx]:
                        df_retry = process_historical_trades(
                            file_path=file_path,
                            bar_type="time",
                            bar_size=fallback_tf,
                            volume_threshold=volume_threshold,
                            add_log_func=lambda msg: None
                        )
                        if len(df_retry) >= MIN_BARS_REQUIRED:
                            add_log(f"   ✅ Auto-fixed! Generated {len(df_retry)} bars using '{fallback_tf}' timeframe.")
                            df = df_retry
                            break
                
            job.progress = 100.0
            
            # Modular Feature Engineering for Trades
            indicators = config.get("indicators", ["RSI", "MACD"])
            add_log(f"Calculating technical indicators for trade bars: {', '.join(indicators)}")
            
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
                "Order Blocks": lambda d: add_order_blocks(d),
                
                # --- Multi-Parameter (Dynamic) Variants ---
                # Momentum Multi
                "RSI Multi": lambda d: [d.ta.rsi(length=l, append=True) for l in [7, 14, 21]],
                "Stoch Multi": lambda d: [d.ta.stoch(k=k, d=3, append=True) for k in [9, 14, 21]],
                "ROC Multi": lambda d: [d.ta.roc(length=l, append=True) for l in [10, 20, 50]],
                "CCI Multi": lambda d: [d.ta.cci(length=l, append=True) for l in [14, 20, 40]],
                "WillR Multi": lambda d: [d.ta.willr(length=l, append=True) for l in [14, 28, 50]],
                "MFI Multi": lambda d: [d.ta.mfi(length=l, append=True) for l in [14, 21, 50]],
                
                # Trend Multi
                "MACD Multi": lambda d: [d.ta.macd(fast=f, slow=s, signal=sig, append=True) for f, s, sig in [(12,26,9), (8,21,5), (5,13,3)]],
                "EMA Multi": lambda d: [d.ta.ema(length=l, append=True) for l in [9, 21, 50, 200]],
                "SMA Multi": lambda d: [d.ta.sma(length=l, append=True) for l in [10, 20, 50, 200]],
                "ADX Multi": lambda d: [d.ta.adx(length=l, append=True) for l in [14, 28]],
                "Supertrend Multi": lambda d: [d.ta.supertrend(length=l, multiplier=m, append=True) for l, m in [(7,3), (10,3), (14,2)]],
                "Parabolic SAR Multi": lambda d: [d.ta.psar(af0=af, af=af, max_af=0.2, append=True) for af in [0.02, 0.04]],
                
                # Volatility Multi
                "BBANDS Multi": lambda d: [d.ta.bbands(length=l, append=True) for l in [20, 50]],
                "ATR Multi": lambda d: [d.ta.atr(length=l, append=True) for l in [7, 14, 21]],
                "Keltner Channel Multi": lambda d: [d.ta.kc(length=l, append=True) for l in [20, 50]],
                "Donchian Channel Multi": lambda d: [d.ta.donchian(length=l, append=True) for l in [20, 50]],
                
                # Volume Multi
                "CMF Multi": lambda d: [d.ta.cmf(length=l, append=True) for l in [20, 50]],
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
                future_max = df['Close'].rolling(window=5).max().shift(-5)
                df['Target'] = (future_max > df['Close']).astype(int)
            else:
                df['Target'] = df['Close'].shift(-5)
                
            from app.services.ml_utils import apply_data_cleaning
            df = apply_data_cleaning(df, config, add_log)
            if len(df) < 10:
                raise Exception(
                    f"Not enough data to train after processing Trades. Found {len(df)} rows after dropna. "
                    f"Auto-retry also failed to produce enough bars. "
                    f"💡 Suggestions: (1) Use '1s' Bar Timeframe with Live Scraping, "
                    f"(2) Increase Target Rows to 50,000+, or (3) Switch to Volume Bars."
                )
                
            trade_features_config = config.get("trade_features", ["cvd", "buy_volume", "sell_volume", "trade_count"])
            available_trade_feats = [f for f in trade_features_config if f in df.columns]
            
            indicator_cols = [col for col in df.columns if col not in ['Target', 'Open', 'High', 'Low', 'Close', 'Volume', 'cvd', 'buy_volume', 'sell_volume', 'trade_count', 'datetime', 'timestamp']]
            features = list(dict.fromkeys(available_trade_feats + indicator_cols))

            
            if not features:
                features = ['Close']
            

        else:
            ohlcv_period = config.get("ohlcv_period")
            exchange_name = config.get("exchange", "binance")
            add_log(f"Fetching historical OHLCV data for {job.symbol} from {exchange_name.upper()}...")
            df = fetch_data(job.symbol, job.timeframe, period=ohlcv_period, exchange_name=exchange_name)
            add_log(f"Fetched {len(df)} rows of market data.")
            job.progress = 100.0
            
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
                "Order Blocks": lambda d: add_order_blocks(d),
                
                # --- Multi-Parameter (Dynamic) Variants ---
                # Momentum Multi
                "RSI Multi": lambda d: [d.ta.rsi(length=l, append=True) for l in [7, 14, 21]],
                "Stoch Multi": lambda d: [d.ta.stoch(k=k, d=3, append=True) for k in [9, 14, 21]],
                "ROC Multi": lambda d: [d.ta.roc(length=l, append=True) for l in [10, 20, 50]],
                "CCI Multi": lambda d: [d.ta.cci(length=l, append=True) for l in [14, 20, 40]],
                "WillR Multi": lambda d: [d.ta.willr(length=l, append=True) for l in [14, 28, 50]],
                "MFI Multi": lambda d: [d.ta.mfi(length=l, append=True) for l in [14, 21, 50]],
                
                # Trend Multi
                "MACD Multi": lambda d: [d.ta.macd(fast=f, slow=s, signal=sig, append=True) for f, s, sig in [(12,26,9), (8,21,5), (5,13,3)]],
                "EMA Multi": lambda d: [d.ta.ema(length=l, append=True) for l in [9, 21, 50, 200]],
                "SMA Multi": lambda d: [d.ta.sma(length=l, append=True) for l in [10, 20, 50, 200]],
                "ADX Multi": lambda d: [d.ta.adx(length=l, append=True) for l in [14, 28]],
                "Supertrend Multi": lambda d: [d.ta.supertrend(length=l, multiplier=m, append=True) for l, m in [(7,3), (10,3), (14,2)]],
                "Parabolic SAR Multi": lambda d: [d.ta.psar(af0=af, af=af, max_af=0.2, append=True) for af in [0.02, 0.04]],
                
                # Volatility Multi
                "BBANDS Multi": lambda d: [d.ta.bbands(length=l, append=True) for l in [20, 50]],
                "ATR Multi": lambda d: [d.ta.atr(length=l, append=True) for l in [7, 14, 21]],
                "Keltner Channel Multi": lambda d: [d.ta.kc(length=l, append=True) for l in [20, 50]],
                "Donchian Channel Multi": lambda d: [d.ta.donchian(length=l, append=True) for l in [20, 50]],
                
                # Volume Multi
                "CMF Multi": lambda d: [d.ta.cmf(length=l, append=True) for l in [20, 50]],
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
                future_max = df['Close'].rolling(window=5).max().shift(-5)
                df['Target'] = (future_max > df['Close']).astype(int)
            else:
                df['Target'] = df['Close'].shift(-5)
                
            from app.services.ml_utils import apply_data_cleaning
            df = apply_data_cleaning(df, config, add_log)
            
            features = [col for col in df.columns if col not in ['Target', 'Open', 'High', 'Low', 'Close', 'Volume', 'Adj Close']]
            if not features:
                features = ['Close']
                
            if len(df) < 10:
                raise Exception(f"Not enough market data to train a model. Found {len(df)} rows. Please increase the dataset period or lookback time.")
        
        # ── Append Alternative Data ──
        alt_features = config.get("alt_features", [])
        if alt_features:
            add_log(f"Fetching Alternative Data Features: {', '.join(alt_features)}")
            from app.services.alternative_data_fetcher import AlternativeDataFetcher
            import asyncio
            fetcher = AlternativeDataFetcher()
            try:
                # Need to use new event loop if inside a celery worker thread
                try:
                    loop = asyncio.get_event_loop()
                    if loop.is_closed():
                        raise RuntimeError
                except RuntimeError:
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    
                alt_df = loop.run_until_complete(fetcher.build_alternative_features(df.index, job.symbol, alt_features))
                for f in alt_features:
                    if f in alt_df.columns:
                        df[f] = alt_df[f].values
                        if f not in features:
                            features.append(f)
                add_log("Successfully merged alternative data.")
            except Exception as e:
                add_log(f"⚠️ Failed to fetch alternative data: {str(e)}")
            finally:
                try:
                    loop.run_until_complete(fetcher.close())
                except: pass
                
        check_cancelled()
        
        # 3. Prepare Data
        job.progress = 0.0
        db.commit()
        add_log("Data download complete. Main training starting from 0%...")
        add_log("Preparing and scaling data...")
        from sklearn.preprocessing import MinMaxScaler, StandardScaler, RobustScaler
        import pandas as pd
        import numpy as np
        
        # FIX: Ensure no NaNs or Infs exist from alternative data
        df.replace([np.inf, -np.inf], np.nan, inplace=True)
        df.dropna(inplace=True)
        
        prediction_target = config.get("prediction_target", "classification")
        if prediction_target == "classification" and df['Target'].nunique() == 1:
            add_log("⚠️ Target variable has only one class (no variance). Artificially adding an opposite label to prevent model crash.")
            opposite_label = 1 if df['Target'].iloc[0] == 0 else 0
            df.iloc[0, df.columns.get_loc('Target')] = opposite_label
            df.iloc[-1, df.columns.get_loc('Target')] = opposite_label
        
        X = df[features].values
        y = df['Target'].values
        
        scaling_method = config.get("scaling_method", "none")
        if scaling_method == "standard":
            add_log("Using StandardScaler for feature scaling.")
            scaler_x = StandardScaler()
        elif scaling_method == "robust":
            add_log("Using RobustScaler for feature scaling.")
            scaler_x = RobustScaler()
        elif scaling_method == "minmax":
            add_log("Using MinMaxScaler for feature scaling.")
            scaler_x = MinMaxScaler()
        else:
            add_log("No feature scaling applied (None).")
            scaler_x = None

        scaler_y = MinMaxScaler() if scaling_method != "none" else None
        
        if scaler_x is not None:
            X_scaled = scaler_x.fit_transform(X)
        else:
            X_scaled = X
        
        prediction_target_early = config.get("prediction_target", "classification")
        if prediction_target_early == "classification":
            # FIX: Classification labels must NOT be scaled.
            y_scaled = y.reshape(-1, 1).astype(int)
            scaler_y = None  # no y scaler needed for classification
        else:
            if scaler_y is not None:
                y_scaled = scaler_y.fit_transform(y.reshape(-1, 1))
            else:
                y_scaled = y.reshape(-1, 1)
        
        # FIX: Create a scaled DataFrame for Advanced ML Engine
        df_scaled = df.copy()
        df_scaled[features] = X_scaled
        df_scaled['Target'] = y_scaled.ravel()
        
        split = int(len(X) * 0.8)
        X_train, X_test = X_scaled[:split], X_scaled[split:]
        y_train, y_test = y_scaled[:split], y_scaled[split:]
        
        # FIX: Ensure y_train has at least 3 samples of each class for Stacking CV (cv=3)
        if prediction_target_early == "classification":
            y_train_flat = y_train.ravel()
            unique_classes, class_counts = np.unique(y_train_flat, return_counts=True)
            min_count = class_counts.min() if len(class_counts) > 1 else 0
            if len(unique_classes) < 2 or min_count < 3:
                add_log(f"⚠️ y_train has extreme class imbalance. Forcing min 3 samples per class for cross-validation.")
                for cls_val in [0, 1]:
                    cls_idx = np.where(y_train_flat == cls_val)[0]
                    if len(cls_idx) < 3:
                        needed = 3 - len(cls_idx)
                        opp_cls = 1 if cls_val == 0 else 0
                        opp_idx = np.where(y_train_flat == opp_cls)[0]
                        # Change the first 'needed' samples of the opposite class
                        for i in range(min(needed, len(opp_idx))):
                            y_train_flat[opp_idx[i]] = cls_val
                # y_train is a view or copy? Best to re-assign just in case
                y_train = y_train_flat.reshape(-1, 1)
        
        # FIX: Wrap X in DataFrame to preserve feature names.
        # This eliminates the SHAP / sklearn "X does not have valid feature names" warning spam.
        X_train_df = pd.DataFrame(X_train, columns=features)
        X_test_df  = pd.DataFrame(X_test,  columns=features)
        
        # --- PHASE 5: DVC Dataset Freezing ---
        dataset_path = None
        try:
            dataset_dir = os.path.join("uploads", "datasets")
            os.makedirs(dataset_dir, exist_ok=True)
            dvc_filename = f"dataset_{job.id}.csv"
            dataset_path = os.path.join(dataset_dir, dvc_filename)
            df_scaled.to_csv(dataset_path, index=False)
            add_log(f"💾 DVC Snapshot saved to {dataset_path}")
        except Exception as e:
            add_log(f"⚠️ Failed to save DVC Snapshot: {e}")
            dataset_path = None
        # -------------------------------------
        
        job.progress = 10.0

        # ── Walk-Forward Cross-Validation (ALL model types) ──────────────────
        # Runs BEFORE training. Results stored in cv_result for later save.
        cv_result = {}
        try:
            cv_result = run_walk_forward_cv(
                algorithm=job.algorithm,
                X_train=X_train,
                y_train=y_train,
                features=features,
                prediction_target=prediction_target_early,
                epochs=int(config.get("epochs", 10)),
                learning_rate=float(config.get("learning_rate", 0.1)),
                max_depth=int(config.get("max_depth", 6)),
                add_log=add_log
            )
        except Exception as _cv_ex:
            add_log(f"⚠️ Walk-Forward CV failed (non-critical): {_cv_ex}")
        
        model_filename = f"model_{job.id}.pkl"
        model_dir = os.path.join("uploads", "models", f"job_{job.id}")
        os.makedirs(model_dir, exist_ok=True)
        model_path = os.path.join(model_dir, model_filename)
        
        epochs = int(config.get("epochs", 10))
        learning_rate = float(config.get("learning_rate", 0.1))
        max_depth = int(config.get("max_depth", 6))
        prediction_target = config.get("prediction_target", "classification")
        is_classification_target = (prediction_target == "classification")

        use_automl = config.get("use_automl", False)
        if use_automl and job.algorithm in ["Random Forest", "XGBoost", "LightGBM", "CatBoost"]:
            from app.services.ml_automl import run_optuna_study
            n_trials = config.get("automl_trials", 20)
            best_params = run_optuna_study(
                algorithm=job.algorithm,
                X_train=X_train_df,
                y_train=y_train.ravel(),
                X_val=X_test_df,
                y_val=y_test.ravel(),
                is_classification=is_classification_target,
                n_trials=n_trials,
                add_log=add_log
            )
            # Update default hyperparams with the best found
            if best_params:
                epochs = best_params.get('n_estimators', best_params.get('iterations', epochs))
                max_depth = best_params.get('max_depth', best_params.get('depth', max_depth))
                learning_rate = best_params.get('learning_rate', learning_rate)
        
        import json
        import time
        final_accuracy = None
        final_f1 = None
        final_latency = None
        final_explainability = None

        def process_metrics(metrics_str, is_classification):
            nonlocal final_accuracy, final_f1
            add_log(metrics_str)
            try:
                metrics_dict = json.loads(metrics_str.replace("[METRICS] ", ""))
                if is_classification:
                    final_accuracy = metrics_dict.get("Accuracy", 0.0)
                    final_f1 = metrics_dict.get("F1_Score", 0.0)
                else:
                    final_accuracy = metrics_dict.get("R2_Score", 0.0) # Use R2 for accuracy display
                    final_f1 = metrics_dict.get("MSE", metrics_dict.get("RMSE", 0.0))
            except Exception:
                pass

        # 4. Train Model
        check_cancelled()
        is_ensemble = config.get("is_ensemble", False)
        ensemble_fi_list = None
        
        if is_ensemble:
            add_log(f"Building Custom Ensemble ({config.get('ensemble_method', 'voting')})...")
            ensemble_method = config.get("ensemble_method", "voting")
            base_model_names = config.get("base_models", ["Random Forest", "XGBoost"])
            meta_model_name = config.get("meta_model", "Logistic Regression")
            voting_strategy = config.get("voting_strategy", "soft")
            auto_optimize_weights = config.get("auto_optimize_weights", False)
            feature_subspacing = config.get("feature_subspacing", False)
            
            estimators = []
            
            # Helper to get base estimator
            def get_estimator(name, is_clf):
                if name == "Random Forest":
                    from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
                    return RandomForestClassifier(n_estimators=epochs, max_depth=max_depth, random_state=42, class_weight='balanced') if is_clf else RandomForestRegressor(n_estimators=epochs, max_depth=max_depth, random_state=42)
                elif name == "XGBoost":
                    from xgboost import XGBClassifier, XGBRegressor
                    num_pos = max(y_train.sum(), 1.0)
                    num_neg = max(len(y_train) - num_pos, 0.0)
                    spw = num_neg / num_pos
                    return XGBClassifier(n_estimators=epochs, learning_rate=learning_rate, max_depth=max_depth, random_state=42, scale_pos_weight=spw) if is_clf else XGBRegressor(n_estimators=epochs, learning_rate=learning_rate, max_depth=max_depth, random_state=42)
                elif name == "LightGBM":
                    import lightgbm as lgb
                    return lgb.LGBMClassifier(n_estimators=epochs, learning_rate=learning_rate, max_depth=max_depth, random_state=42, verbose=-1, class_weight='balanced') if is_clf else lgb.LGBMRegressor(n_estimators=epochs, learning_rate=learning_rate, max_depth=max_depth, random_state=42, verbose=-1)
                elif name == "CatBoost":
                    from catboost import CatBoostClassifier, CatBoostRegressor
                    return CatBoostClassifier(iterations=epochs, learning_rate=learning_rate, depth=max_depth, random_state=42, verbose=False, auto_class_weights='Balanced') if is_clf else CatBoostRegressor(iterations=epochs, learning_rate=learning_rate, depth=max_depth, random_state=42, verbose=False)
                elif name in ["LSTM", "Transformer", "Neural Network (MLP)"]:
                    add_log(f"Mapping {name} to Scikit-Learn MLP for Ensemble compatibility.")
                    from sklearn.neural_network import MLPClassifier, MLPRegressor
                    return MLPClassifier(hidden_layer_sizes=(64, 32), max_iter=epochs, random_state=42) if is_clf else MLPRegressor(hidden_layer_sizes=(64, 32), max_iter=epochs, random_state=42)
                else:
                    # fallback
                    from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
                    return RandomForestClassifier(n_estimators=epochs, random_state=42, class_weight='balanced') if is_clf else RandomForestRegressor(n_estimators=epochs, random_state=42)
            
            is_classification_target = (prediction_target == "classification")
            
            import random
            from sklearn.pipeline import make_pipeline
            from sklearn.compose import ColumnTransformer
            
            for idx, m_name in enumerate(base_model_names):
                est = get_estimator(m_name, is_classification_target)
                
                if feature_subspacing:
                    # Randomly select ~75% of features for each base model to reduce correlation
                    num_features = max(1, int(len(features) * 0.75))
                    subset_features = random.sample(features, num_features)
                    # ColumnTransformer passes only the selected features to the estimator
                    col_trans = ColumnTransformer(
                        [('pass', 'passthrough', subset_features)],
                        remainder='drop'
                    )
                    est = make_pipeline(col_trans, est)
                
                estimators.append((f"{m_name.replace(' ', '_').lower()}_{idx}", est))
                
            if not estimators:
                raise Exception("No valid base models selected for ensemble.")
                
            if ensemble_method == "voting":
                if is_classification_target:
                    from sklearn.ensemble import VotingClassifier
                    model = VotingClassifier(estimators=estimators, voting=voting_strategy)
                else:
                    from sklearn.ensemble import VotingRegressor
                    model = VotingRegressor(estimators=estimators)
            else: # stacking
                # Setup meta model
                if is_classification_target:
                    from sklearn.ensemble import StackingClassifier
                    from sklearn.linear_model import LogisticRegression
                    meta_clf = get_estimator(meta_model_name, True) if meta_model_name != "Logistic Regression" else LogisticRegression(random_state=42, max_iter=1000)
                    model = StackingClassifier(estimators=estimators, final_estimator=meta_clf, cv=3)
                else:
                    from sklearn.ensemble import StackingRegressor
                    from sklearn.linear_model import LinearRegression
                    meta_reg = get_estimator(meta_model_name, False) if meta_model_name != "Logistic Regression" else LinearRegression()
                    model = StackingRegressor(estimators=estimators, final_estimator=meta_reg, cv=3)

            add_log(f"Training {ensemble_method.capitalize()} Ensemble with {len(estimators)} base models...")
            start_time = time.time()
            model.fit(X_train_df, y_train.ravel())
            
            # --- Auto Optimize Weights ---
            if ensemble_method == "voting" and auto_optimize_weights and voting_strategy == "soft":
                add_log("Auto-optimizing ensemble weights based on individual base model performance...")
                acc_scores = []
                # model.estimators_ contains the fitted estimators
                for est in model.estimators_:
                    try:
                        if is_classification_target:
                            acc = np.mean(est.predict(X_test_df) == y_test.ravel())
                        else:
                            from sklearn.metrics import r2_score
                            acc = r2_score(y_test.ravel(), est.predict(X_test_df))
                        acc_scores.append(max(0.01, acc)) # avoid 0 or negative weights
                    except Exception:
                        acc_scores.append(1.0)
                
                # Softmax or Normalize
                total_acc = sum(acc_scores)
                weights = [acc / total_acc for acc in acc_scores]
                model.weights = weights
                add_log(f"Optimized Weights: {[round(w, 3) for w in weights]}")

            # --- Correlation Matrix ---
            add_log("Generating Model Prediction Correlation Matrix...")
            try:
                preds_dict = {}
                fitted_estimators = model.estimators_ if hasattr(model, 'estimators_') else []
                for name, est in zip([e[0] for e in estimators], fitted_estimators):
                    try:
                        preds_dict[name] = est.predict(X_test_df)
                    except Exception:
                        pass
                
                if preds_dict and len(preds_dict) > 1:
                    import pandas as pd
                    preds_df = pd.DataFrame(preds_dict)
                    corr_matrix = preds_df.corr().to_dict()
                    add_log("[CORRELATION] " + json.dumps(corr_matrix))
            except Exception as e:
                add_log(f"Failed to generate correlation matrix: {e}")

            end_time = time.time()
            final_latency = max(1.0, (end_time - start_time) / max(1, len(X_test)) * 1000)
            
            y_pred = model.predict(X_test_df)
            if is_classification_target:
                process_metrics(calculate_classification_metrics(y_test.ravel(), y_pred), True)
            else:
                process_metrics(calculate_regression_metrics(y_test.ravel(), y_pred), False)
                
            job.progress = 80.0
            joblib.dump(model, model_path)
            
            # Simple feature importance fallback for voting ensemble
            if ensemble_method == "voting":
                try:
                    # Approximate feature importances if estimators have it. 
                    # If Pipeline is used (feature subspacing), we need to extract from step.
                    importances_list = []
                    for est in model.estimators_:
                        actual_est = est
                        if hasattr(est, 'steps'):
                            actual_est = est.steps[-1][1] 
                        if hasattr(actual_est, "feature_importances_"):
                            importances_list.append(actual_est.feature_importances_)
                    
                    if importances_list:
                        importances = np.mean(importances_list, axis=0)
                        # mock extract_feature_importance output
                        # Note: with subspacing, feature length might mismatch, so this is a rough fallback
                        fi_dict = {f: float(imp) for f, imp in zip(features[:len(importances)], importances)}
                        sorted_fi = sorted(fi_dict.items(), key=lambda x: x[1], reverse=True)[:10]
                        fi_log = "[FEATURE_IMPORTANCE] " + json.dumps({k: v for k, v in sorted_fi})
                        add_log(fi_log)
                        ensemble_fi_list = [{"name": str(k), "value": float(v)} for k, v in sorted_fi]
                except Exception as e:
                    pass
            
            add_log(f"Ensemble training complete.")
            
        elif job.algorithm == "Random Forest":
            add_log(f"Training Random Forest ({prediction_target.capitalize()})...")
            if prediction_target == "classification":
                from sklearn.ensemble import RandomForestClassifier
                if is_fine_tune:
                    if os.path.exists(_prev_path):
                        try:
                            model = joblib.load(_prev_path)
                            if hasattr(model, 'n_features_in_') and model.n_features_in_ != X_train.shape[1]:
                                raise ValueError(f"Feature mismatch: old model expected {model.n_features_in_}, new data has {X_train.shape[1]}")
                            model.warm_start = True
                            model.n_estimators += epochs
                            add_log(f"✅ Fine-Tuning RF Classifier: adding {epochs} trees → total {model.n_estimators}")
                        except Exception as _ft_e:
                            add_log(f"⚠️ Fine-tune load failed ({_ft_e}), falling back to fresh.")
                            model = RandomForestClassifier(n_estimators=epochs, max_depth=max_depth, random_state=42, class_weight='balanced')
                else:
                    model = RandomForestClassifier(n_estimators=epochs, max_depth=max_depth, random_state=42, class_weight='balanced')
                try:
                    model.fit(X_train_df, y_train.ravel())
                except ValueError as e:
                    if is_fine_tune and "feature" in str(e).lower():
                        add_log(f"⚠️ Fine-tune fit failed: {e}. Falling back to fresh training.")
                        model = RandomForestClassifier(n_estimators=epochs, max_depth=max_depth, random_state=42, class_weight='balanced')
                        model.fit(X_train_df, y_train.ravel())
                    else:
                        raise e
                start_time = time.time()
                y_pred = model.predict(X_test_df)
                end_time = time.time()
                final_latency = max(1.0, (end_time - start_time) / max(1, len(X_test)) * 1000)
                process_metrics(calculate_classification_metrics(y_test.ravel(), y_pred), True)
            else:
                from sklearn.ensemble import RandomForestRegressor
                if is_fine_tune:
                    try:
                        model = joblib.load(_prev_path)
                        if hasattr(model, 'n_features_in_') and model.n_features_in_ != X_train.shape[1]:
                            raise ValueError(f"Feature mismatch: old model expected {model.n_features_in_}, new data has {X_train.shape[1]}")
                        model.warm_start = True
                        model.n_estimators += epochs
                        add_log(f"✅ Fine-Tuning RF Regressor: adding {epochs} trees → total {model.n_estimators}")
                    except Exception as _ft_e:
                        add_log(f"⚠️ Fine-tune load failed ({_ft_e}), falling back to fresh.")
                        model = RandomForestRegressor(n_estimators=epochs, max_depth=max_depth, random_state=42)
                else:
                    model = RandomForestRegressor(n_estimators=epochs, max_depth=max_depth, random_state=42)
                try:
                    model.fit(X_train_df, y_train.ravel())
                except ValueError as e:
                    if is_fine_tune and "feature" in str(e).lower():
                        add_log(f"⚠️ Fine-tune fit failed: {e}. Falling back to fresh training.")
                        model = RandomForestRegressor(n_estimators=epochs, max_depth=max_depth, random_state=42)
                        model.fit(X_train_df, y_train.ravel())
                    else:
                        raise e
                start_time = time.time()
                y_pred = model.predict(X_test_df)
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
            _xgb_init = None
            if is_fine_tune:
                try:
                    _prev_xgb = joblib.load(_prev_path)
                    if hasattr(_prev_xgb, 'n_features_in_') and _prev_xgb.n_features_in_ != X_train.shape[1]:
                        raise ValueError(f"Feature mismatch: old expected {_prev_xgb.n_features_in_}, new has {X_train.shape[1]}")
                    _xgb_init = _prev_xgb.get_booster()
                    add_log(f"✅ Fine-Tuning XGBoost: continuing from previous booster")
                except Exception as _ft_e:
                    add_log(f"⚠️ XGBoost fine-tune load failed ({_ft_e}), training fresh.")
            if prediction_target == "classification":
                from xgboost import XGBClassifier
                num_pos = max(y_train.sum(), 1.0)
                num_neg = max(len(y_train) - num_pos, 0.0)
                spw = num_neg / num_pos
                model = XGBClassifier(n_estimators=epochs, learning_rate=learning_rate, max_depth=max_depth, random_state=42, scale_pos_weight=spw)
                try:
                    model.fit(X_train_df, y_train.ravel(), eval_set=[(X_test_df, y_test.ravel())], verbose=False, xgb_model=_xgb_init)
                except ValueError as e:
                    if is_fine_tune and "feature" in str(e).lower():
                        add_log(f"⚠️ XGBoost fine-tune fit failed: {e}. Falling back to fresh training.")
                        model = XGBClassifier(n_estimators=epochs, learning_rate=learning_rate, max_depth=max_depth, random_state=42, scale_pos_weight=spw)
                        model.fit(X_train_df, y_train.ravel(), eval_set=[(X_test_df, y_test.ravel())], verbose=False)
                    else:
                        raise e
                start_time = time.time()
                y_pred = model.predict(X_test_df)
                end_time = time.time()
                final_latency = max(1.0, (end_time - start_time) / max(1, len(X_test)) * 1000)
                process_metrics(calculate_classification_metrics(y_test.ravel(), y_pred), True)
            else:
                from xgboost import XGBRegressor
                model = XGBRegressor(n_estimators=epochs, learning_rate=learning_rate, max_depth=max_depth, random_state=42)
                try:
                    model.fit(X_train_df, y_train.ravel(), eval_set=[(X_test_df, y_test.ravel())], verbose=False, xgb_model=_xgb_init)
                except ValueError as e:
                    if is_fine_tune and "feature" in str(e).lower():
                        add_log(f"⚠️ XGBoost fine-tune fit failed: {e}. Falling back to fresh training.")
                        model = XGBRegressor(n_estimators=epochs, learning_rate=learning_rate, max_depth=max_depth, random_state=42)
                        model.fit(X_train_df, y_train.ravel(), eval_set=[(X_test_df, y_test.ravel())], verbose=False)
                    else:
                        raise e
                start_time = time.time()
                y_pred = model.predict(X_test_df)
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
            
            # ── Fine-Tune: load previous weights ───────────────────────────
            _ft_lr = learning_rate
            if is_fine_tune:
                _pt_path = _prev_path.replace('.pkl', '.pt') if _prev_path.endswith('.pkl') else _prev_path
                if os.path.exists(_pt_path):
                    try:
                        model.load_state_dict(torch.load(_pt_path, map_location='cpu'))
                        _ft_lr = learning_rate * 0.1
                        add_log(f"✅ Fine-Tuning LSTM from {_pt_path} (LR: {_ft_lr:.6f})")
                    except Exception as _ft_e:
                        add_log(f"⚠️ LSTM weight load failed ({_ft_e}), training fresh.")
                else:
                    add_log("⚠️ No .pt checkpoint found, training LSTM fresh.")
            
            if prediction_target == "classification":
                num_pos = max(y_train_t.sum().item(), 1.0)
                num_neg = max(len(y_train_t) - y_train_t.sum().item(), 0.0)
                pos_weight = torch.tensor([num_neg / num_pos], dtype=torch.float32)
                criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
            else:
                criterion = nn.MSELoss()
                
            optimizer = torch.optim.Adam(model.parameters(), lr=_ft_lr)
            
            add_log(f"Starting LSTM training for {epochs} epochs...")
            for epoch in range(epochs):
                outputs = model(X_train_t)
                optimizer.zero_grad()
                # FIX: ensure y and outputs have matching shapes (N,1) for BCEWithLogitsLoss
                loss = criterion(outputs, y_train_t.view(-1, 1))
                loss.backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
                optimizer.step()
                
                pct = 10.0 + (70.0 * (epoch+1)/epochs)
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
            _lgb_init = None
            if is_fine_tune:
                try:
                    _lgb_init = joblib.load(_prev_path)
                    add_log(f"✅ Fine-Tuning LightGBM: continuing from previous model")
                except Exception as _ft_e:
                    add_log(f"⚠️ LightGBM fine-tune load failed ({_ft_e}), training fresh.")
            if prediction_target == "classification":
                model = lgb.LGBMClassifier(n_estimators=epochs, learning_rate=learning_rate, max_depth=max_depth, random_state=42, verbose=-1, class_weight='balanced')
                # FIX: Use DataFrame (X_train_df) so feature names are preserved -> eliminates warning spam
                model.fit(X_train_df, y_train.ravel(), eval_set=[(X_test_df, y_test.ravel())], init_model=_lgb_init)
                start_time = time.time()
                y_pred = model.predict(X_test_df)
                end_time = time.time()
                final_latency = max(1.0, (end_time - start_time) / max(1, len(X_test)) * 1000)
                process_metrics(calculate_classification_metrics(y_test.ravel(), y_pred), True)
            else:
                model = lgb.LGBMRegressor(n_estimators=epochs, learning_rate=learning_rate, max_depth=max_depth, random_state=42, verbose=-1)
                model.fit(X_train_df, y_train.ravel(), eval_set=[(X_test_df, y_test.ravel())], init_model=_lgb_init)
                start_time = time.time()
                y_pred = model.predict(X_test_df)
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
            _cb_init = None
            if is_fine_tune:
                try:
                    _cb_init = joblib.load(_prev_path)
                    add_log(f"✅ Fine-Tuning CatBoost: initialising from previous model")
                except Exception as _ft_e:
                    add_log(f"⚠️ CatBoost fine-tune load failed ({_ft_e}), training fresh.")
            if prediction_target == "classification":
                model = cb.CatBoostClassifier(iterations=epochs, learning_rate=learning_rate, depth=max_depth, random_seed=42, verbose=False, auto_class_weights='Balanced')
                model.fit(X_train_df, y_train.ravel(), eval_set=(X_test_df, y_test.ravel()), init_model=_cb_init)
                start_time = time.time()
                y_pred = model.predict(X_test_df)
                end_time = time.time()
                final_latency = max(1.0, (end_time - start_time) / max(1, len(X_test)) * 1000)
                process_metrics(calculate_classification_metrics(y_test.ravel(), y_pred), True)
            else:
                model = cb.CatBoostRegressor(iterations=epochs, learning_rate=learning_rate, depth=max_depth, random_seed=42, verbose=False)
                model.fit(X_train_df, y_train.ravel(), eval_set=(X_test_df, y_test.ravel()), init_model=_cb_init)
                start_time = time.time()
                y_pred = model.predict(X_test_df)
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
            
            # ── Fine-Tune: load previous weights ───────────────────────────
            _ft_lr = learning_rate
            if is_fine_tune:
                _pt_path = _prev_path.replace('.pkl', '.pt') if _prev_path.endswith('.pkl') else _prev_path
                if os.path.exists(_pt_path):
                    try:
                        model.load_state_dict(torch.load(_pt_path, map_location='cpu'))
                        _ft_lr = learning_rate * 0.1
                        add_log(f"✅ Fine-Tuning GRU from {_pt_path} (LR: {_ft_lr:.6f})")
                    except Exception as _ft_e:
                        add_log(f"⚠️ GRU weight load failed ({_ft_e}), training fresh.")
                else:
                    add_log("⚠️ No .pt checkpoint found, training GRU fresh.")
            
            if prediction_target == "classification":
                num_pos = max(y_train_t.sum().item(), 1.0)
                num_neg = max(len(y_train_t) - y_train_t.sum().item(), 0.0)
                pos_weight = torch.tensor([num_neg / num_pos], dtype=torch.float32)
                criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
            else:
                criterion = nn.MSELoss()
                
            optimizer = torch.optim.Adam(model.parameters(), lr=_ft_lr)
            
            add_log(f"Starting GRU training for {epochs} epochs...")
            for epoch in range(epochs):
                outputs = model(X_train_t)
                optimizer.zero_grad()
                # FIX: ensure y and outputs have matching shapes (N,1) for BCEWithLogitsLoss
                loss = criterion(outputs.squeeze(-1), y_train_t.view(-1))
                loss.backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
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
            
            # ── Fine-Tune: load previous weights ───────────────────────────
            _ft_lr = learning_rate
            if is_fine_tune:
                _pt_path = _prev_path.replace('.pkl', '.pt') if _prev_path.endswith('.pkl') else _prev_path
                if os.path.exists(_pt_path):
                    try:
                        model.load_state_dict(torch.load(_pt_path, map_location='cpu'))
                        _ft_lr = learning_rate * 0.1
                        add_log(f"✅ Fine-Tuning 1D-CNN from {_pt_path} (LR: {_ft_lr:.6f})")
                    except Exception as _ft_e:
                        add_log(f"⚠️ 1D-CNN weight load failed ({_ft_e}), training fresh.")
                else:
                    add_log("⚠️ No .pt checkpoint found, training 1D-CNN fresh.")
            
            if prediction_target == "classification":
                num_pos = max(y_train_t.sum().item(), 1.0)
                num_neg = max(len(y_train_t) - y_train_t.sum().item(), 0.0)
                pos_weight = torch.tensor([num_neg / num_pos], dtype=torch.float32)
                criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
            else:
                criterion = nn.MSELoss()
                
            optimizer = torch.optim.Adam(model.parameters(), lr=_ft_lr)
            
            for epoch in range(epochs):
                outputs = model(X_train_t)
                optimizer.zero_grad()
                loss = criterion(outputs.squeeze(-1), y_train_t.view(-1))
                loss.backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
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
            
            # ── Fine-Tune: load previous weights ───────────────────────────
            _ft_lr = learning_rate
            if is_fine_tune:
                _pt_path = _prev_path.replace('.pkl', '.pt') if _prev_path.endswith('.pkl') else _prev_path
                if os.path.exists(_pt_path):
                    try:
                        model.load_state_dict(torch.load(_pt_path, map_location='cpu'))
                        _ft_lr = learning_rate * 0.1
                        add_log(f"✅ Fine-Tuning DeepLOB from {_pt_path} (LR: {_ft_lr:.6f})")
                    except Exception as _ft_e:
                        add_log(f"⚠️ DeepLOB weight load failed ({_ft_e}), training fresh.")
                else:
                    add_log("⚠️ No .pt checkpoint found, training DeepLOB fresh.")
            
            if prediction_target == "classification":
                num_pos = max(y_train_t.sum().item(), 1.0)
                num_neg = max(len(y_train_t) - y_train_t.sum().item(), 0.0)
                pos_weight = torch.tensor([num_neg / num_pos], dtype=torch.float32)
                criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
            else:
                criterion = nn.MSELoss()
                
            optimizer = torch.optim.Adam(model.parameters(), lr=_ft_lr)
            
            for epoch in range(epochs):
                outputs = model(X_train_t)
                optimizer.zero_grad()
                # FIX: ensure y and outputs have matching shapes (N,1) for BCEWithLogitsLoss
                loss = criterion(outputs.squeeze(-1), y_train_t.view(-1))
                loss.backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
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
                model, model_path, metrics = AdvancedMLEngine.train_transformer(
                    job, df_scaled, features, db, add_log,
                    previous_model_path=_prev_path if is_fine_tune else None
                )
                final_latency = 5.0
                final_accuracy = metrics.get("accuracy", metrics.get("mse"))
                final_f1 = metrics.get("f1_score", metrics.get("rmse"))
                add_log("✅ Advanced Transformer Training complete.")
            except Exception as e:
                add_log(f"❌ Advanced Transformer Error: {e}")
                raise e

        elif job.algorithm == "TCN":
            add_log("🚀 Routing to Advanced ML Engine: TCN...")
            try:
                model, model_path, metrics = AdvancedMLEngine.train_tcn(
                    job, df_scaled, features, db, add_log,
                    previous_model_path=_prev_path if is_fine_tune else None
                )
                final_latency = 3.0
                final_accuracy = metrics.get("accuracy", metrics.get("mse", 0))
                final_f1 = metrics.get("f1_score", metrics.get("rmse", 0))
                add_log("✅ Advanced TCN Training complete.")
            except Exception as e:
                add_log(f"❌ Advanced TCN Error: {e}")
                raise e

        elif job.algorithm == "TabNet":
            add_log("🚀 Routing to Advanced ML Engine: TabNet...")
            try:
                model, model_path, metrics = AdvancedMLEngine.train_tabnet(
                    job, df_scaled, features, db, add_log,
                    previous_model_path=_prev_path if is_fine_tune else None
                )
                final_latency = 4.0
                final_accuracy = metrics.get("accuracy", metrics.get("mse", 0))
                final_f1 = metrics.get("f1_score", metrics.get("rmse", 0))
                add_log("✅ Advanced TabNet Training complete.")
            except Exception as e:
                add_log(f"❌ Advanced TabNet Error: {e}")
                raise e

        elif job.algorithm == "Auto-Encoder":
            add_log("🚀 Routing to Advanced ML Engine: Auto-Encoder (Anomaly Detection)...")
            try:
                model, model_path, metrics = AdvancedMLEngine.train_autoencoder(
                    job, df_scaled, features, db, add_log,
                    previous_model_path=_prev_path if is_fine_tune else None
                )
                final_latency = 2.0
                final_accuracy = metrics.get("accuracy", 1.0)
                final_f1 = metrics.get("anomaly_threshold", 0)  # Store threshold here temporarily
                final_explainability = {"anomaly_threshold": final_f1, "mse": metrics.get("mse")}
                add_log("✅ Advanced Auto-Encoder Training complete.")
            except Exception as e:
                add_log(f"❌ Advanced Auto-Encoder Error: {e}")
                raise e

        elif job.algorithm in ["PPO-RL", "SAC-RL"]:
            add_log(f"🚀 Routing to Advanced ML Engine: {job.algorithm}...")
            try:
                model, model_path, metrics = AdvancedMLEngine.train_rl(
                    job, df, features, db, add_log,
                    previous_model_path=_prev_path if is_fine_tune else None
                )
                final_latency = 10.0
                final_accuracy = metrics.get("win_rate", 0) / 100.0  # Normalize to 0-1
                final_f1 = metrics.get("sharpe_ratio", 0)  # Using Sharpe for F1/Score field
                final_explainability = metrics
                add_log(f"✅ Advanced {job.algorithm} Training complete.")
            except Exception as e:
                add_log(f"❌ Advanced {job.algorithm} Error: {e}")
                raise e

        elif job.algorithm in ["A2C-RL", "DDPG-RL", "DQN-RL", "TD3-RL", "QR-DQN", "CQL", "GAIL", "Decision-Transformer", "Liquid-NN"]:
            add_log(f"🚀 Routing to Extended RL Engine: {job.algorithm}...")
            try:
                from app.services.advanced_ml.extended_rl_engine import ExtendedRLEngine
                model, model_path, metrics = ExtendedRLEngine.train_extended_rl(
                    job, df, features, db, add_log,
                    previous_model_path=_prev_path if is_fine_tune else None
                )
                final_latency = 10.0
                final_accuracy = metrics.get("win_rate", 0) / 100.0
                final_f1 = metrics.get("sharpe_ratio", 0)
                final_explainability = metrics
                add_log(f"✅ Extended {job.algorithm} Training complete.")
            except Exception as e:
                add_log(f"❌ Extended {job.algorithm} Error: {e}")
                raise e

        else:
            raise ValueError(f"Unsupported algorithm: {job.algorithm}")
            
        # Generate Explainability Data
        try:
            if job.algorithm in ["Random Forest", "XGBoost", "LightGBM", "CatBoost"]:
                add_log("Generating Real Explainability Metrics (SHAP, Feature Importance, etc.)...")
                is_cls = (prediction_target == "classification")
                final_explainability = generate_real_explainability(model, X_test, y_test.ravel(), y_pred, features, is_classification=is_cls)
                if is_ensemble and ensemble_fi_list is not None:
                    final_explainability["featureImportance"] = ensemble_fi_list
            
            elif job.algorithm in ["LSTM", "GRU", "1D-CNN", "DeepLOB"]:
                add_log("Generating Basic Explainability Metrics for Deep Learning model...")
                import torch
                is_cls = (prediction_target == "classification")
                dl_explain = {}
                
                # 1. Confusion Matrix
                try:
                    if is_cls:
                        from sklearn.metrics import confusion_matrix
                        y_true_int = np.round(y_test.ravel()).astype(int)
                        y_pred_int = np.round(preds_class.ravel()).astype(int) if is_cls else None
                        if y_pred_int is not None:
                            cm = confusion_matrix(y_true_int, y_pred_int)
                            dl_explain["confusionMatrix"] = {
                                "classes": ["Hold/Down", "Up"] if cm.shape[0] == 2 else ["Class 0", "Class 1"],
                                "matrix": cm.tolist()
                            }
                except Exception as _e:
                    add_log(f"[DL Explain] Confusion matrix failed: {_e}")
                
                # 2. Actual vs Predicted time series
                try:
                    subset_len = min(50, len(y_test.ravel()))
                    y_t = y_test.ravel()
                    y_p = preds_class.ravel() if is_cls else preds.ravel()
                    ts_data = []
                    for i in range(subset_len):
                        ts_data.append({
                            "time": f"T-{subset_len-i}",
                            "actual": float(y_t[len(y_t)-subset_len+i]),
                            "predicted": float(y_p[len(y_p)-subset_len+i])
                        })
                    dl_explain["timeSeriesData"] = ts_data
                except Exception as _e:
                    add_log(f"[DL Explain] Time series data failed: {_e}")
                
                # 3. Permutation Feature Importance (works for any black-box model)
                try:
                    model.eval()
                    baseline_preds = preds_class.ravel() if is_cls else preds.ravel()
                    from sklearn.metrics import accuracy_score, mean_squared_error
                    if is_cls:
                        baseline_score = accuracy_score(y_test.ravel().astype(int), baseline_preds.astype(int))
                    else:
                        baseline_score = -mean_squared_error(y_test.ravel(), baseline_preds)
                    
                    perm_importances = []
                    for feat_idx, feat_name in enumerate(features):
                        X_permuted = X_test.copy()
                        np.random.shuffle(X_permuted[:, feat_idx])
                        with torch.no_grad():
                            if job.algorithm in ["LSTM", "GRU", "TCN"]:
                                X_perm_t = torch.FloatTensor(X_permuted).unsqueeze(1)
                            else:
                                X_perm_t = torch.FloatTensor(X_permuted)
                            perm_out = model(X_perm_t).numpy()
                        
                        if is_cls:
                            perm_preds = (1 / (1 + np.exp(-perm_out)) > 0.5).astype(int).ravel()
                            perm_score = accuracy_score(y_test.ravel().astype(int), perm_preds)
                        else:
                            perm_preds = perm_out.ravel()
                            perm_score = -mean_squared_error(y_test.ravel(), perm_preds)
                        
                        importance = max(0.0, baseline_score - perm_score)
                        perm_importances.append({"name": feat_name, "value": float(importance)})
                    
                    # Normalize
                    total_imp = sum(p["value"] for p in perm_importances)
                    if total_imp > 0:
                        for p in perm_importances:
                            p["value"] = p["value"] / total_imp
                    perm_importances.sort(key=lambda x: x["value"], reverse=True)
                    dl_explain["featureImportance"] = perm_importances
                except Exception as _e:
                    add_log(f"[DL Explain] Permutation importance failed: {_e}")
                
                final_explainability = dl_explain
                add_log("Deep Learning explainability generated successfully.")

        except Exception as e:
            add_log(f"⚠️ Failed to generate explainability data: {e}")
            
        # 5. Register in ML Registry
        add_log("Registering newly trained model in ML Registry...")
        timestamp = int(time.time() * 1000)
        version_id = f"v1.0-{timestamp}"
        
        target_model_id = config.get("target_model_id")
        is_auto_retrain = config.get("is_auto_retrain", False)
        retrain_interval_hours = config.get("retrain_interval_hours", 6)
        
        is_cross_algo = config.get("is_cross_algorithm_transfer", False)
        source_algo = config.get("source_algorithm")
        
        if is_cross_algo and source_algo:
            final_model_type = f"{source_algo} --> {job.algorithm}"
        else:
            final_model_type = "Ensemble" if is_ensemble else job.algorithm
            
        final_auto_name = f"{job.symbol} Ensemble Auto" if is_ensemble else f"{job.symbol} {job.algorithm} Auto"

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
                latency=final_latency,
                explainability=final_explainability,
                dataset_path=dataset_path
            )
            db.add(db_version)
            db.flush()
            
            db_model.active_version_id = version_id
            # Also update model type in case it's a cross-algo transfer
            db_model.model_type = final_model_type
            registry_id = target_model_id
        else:
            # We are creating a new model from scratch
            custom_model_name = config.get("model_name", "").strip()
            registry_id = f"model_{timestamp}"

            db_model = models.CustomMLModel(
                id=registry_id,
                name=custom_model_name if custom_model_name else final_auto_name,
                model_type=final_model_type,
                user_id=job.user_id,
                active_version_id=None,
                is_auto_retrain=1 if is_auto_retrain else 0,
                retrain_interval_hours=retrain_interval_hours,
                data_lookback_hours=lookback_hours
            )
            db.add(db_model)
            db.flush()
            
            # Add version pointing to model
            # ── Fix 1: Save Scaler ────────────────────────────────────────────────
            scaler_save_path = os.path.join(model_dir, f"scaler_{job.id}.pkl")
            try:
                if scaler_x is not None:
                    joblib.dump(scaler_x, scaler_save_path)
                    add_log(f"✅ Scaler saved to: {scaler_save_path}")
                else:
                    # Save a placeholder string to indicate 'none' scaling
                    joblib.dump("none", scaler_save_path)
                    add_log(f"✅ Scaler config saved (none) to: {scaler_save_path}")
            except Exception as _sc_ex:
                add_log(f"⚠️ Scaler save failed (non-critical): {_sc_ex}")
            db_version = models.ModelVersion(
                id=version_id,
                model_id=registry_id,
                version=1.0,
                description=f"Auto-trained using {job.algorithm} on {job.symbol} {job.timeframe}",
                file_path=model_path,
                status=models.ModelStatus.READY,
                accuracy=final_accuracy,
                f1_score=final_f1,
                latency=final_latency,
                explainability=final_explainability,
                dataset_path=dataset_path
            )
            db.add(db_version)
            db.flush()
            
            # Update model with active_version_id
            db_model.active_version_id = version_id
            
        job.output_model_id = registry_id

        # ── Fix 1: Save Scaler ────────────────────────────────────────────────
        try:
            scaler_save_path = model_path.replace('.pkl', '.scaler').replace('.pt', '.scaler').replace('.zip', '.scaler')
            joblib.dump(scaler_x, scaler_save_path)
            add_log(f"✅ Scaler saved to: {scaler_save_path}")
        except Exception as _sc_ex:
            add_log(f"⚠️ Scaler save failed (non-critical): {_sc_ex}")
            scaler_save_path = None

        # ── Fix 1 + 2: Save enriched metadata ────────────────────────────────
        metadata_path = model_path.replace(".pkl", ".json").replace(".pt", ".json").replace(".zip", ".json")
        
        trade_feats = config.get("trade_features", [])
        if config.get("dataset_type") == "hybrid_deep":
            trade_feats = config.get("hybrid_deep_trade_features", trade_feats)

        metadata_payload = {
            "features":         features,
            "dataset_type":     config.get("dataset_type", "ohlcv"),
            "indicators":       config.get("indicators", []),
            "l2_features":      config.get("l2_features", []),
            "trade_features":   trade_feats,
            "timeframe":        job.timeframe,
            "symbol":           job.symbol,
            "prediction_target":prediction_target,
            "algorithm":        job.algorithm,
            "epochs":           config.get("epochs", 100),
            "scaler_path":      scaler_save_path,
            "cv_result":        cv_result,
            "plp_features":     config.get("plp_features", []),
            "accuracy":         final_accuracy if prediction_target == "classification" else None,
            "f1_score":         final_f1 if prediction_target == "classification" else None,
            "r2_score":         final_accuracy if prediction_target != "classification" else None,
            "mse":              final_f1 if prediction_target != "classification" else None,
            "rmse":             final_f1 if prediction_target != "classification" else None,
            "latency":          final_latency
        }
        with open(metadata_path, "w") as f:
            json.dump(metadata_payload, f)

        # ── Fix 2: Attach CV scores to explainability ─────────────────────────
        if cv_result and final_explainability is not None:
            if isinstance(final_explainability, dict):
                final_explainability["cv_scores"] = cv_result
        elif cv_result and final_explainability is None:
            final_explainability = {"cv_scores": cv_result}

        # Update explainability in the version record now that cv_result is ready
        if cv_result:
            db_version.explainability = dict(final_explainability) if isinstance(final_explainability, dict) else final_explainability
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(db_version, "explainability")
            db.flush()

        # ── Fix 3: Post-Training Backtest ─────────────────────────────────────
        try:
            if job.algorithm not in ["PPO-RL", "SAC-RL", "A2C-RL"]:
                bt_initial_balance = float(config.get("backtest_initial_balance", 10000.0))
                bt_commission      = float(config.get("backtest_commission", 0.001))
                bt_stop_loss       = float(config.get("backtest_stop_loss", 2.0))
                bt_take_profit     = float(config.get("backtest_take_profit", 4.0))

                backtest_result = run_post_training_backtest(
                    model=model,
                    algorithm=job.algorithm,
                    X_test=X_test,
                    df=df,
                    features=features,
                    prediction_target=prediction_target,
                    initial_balance=bt_initial_balance,
                    commission=bt_commission,
                    stop_loss=bt_stop_loss,
                    take_profit=bt_take_profit,
                    add_log=add_log
                )

                if backtest_result:
                    # Merge backtest result into explainability
                    current_explain = db_version.explainability or {}
                    current_explain["backtest_result"] = backtest_result
                    db_version.explainability = dict(current_explain)
                    from sqlalchemy.orm.attributes import flag_modified
                    flag_modified(db_version, "explainability")
                    db.flush()
            else:
                add_log("[Post-Backtest] RL agent metrics were already calculated during training. Skipping static backtest.")

        except Exception as _bt_ex:
            add_log(f"⚠️ Post-training backtest failed (non-critical): {_bt_ex}")

        # ── Fix 4: Re-save metadata with explainability data included ─────────
        try:
            metadata_payload["explainability"] = db_version.explainability
            with open(metadata_path, "w") as f:
                json.dump(metadata_payload, f)
        except Exception as e:
            add_log(f"⚠️ Failed to update metadata.json with explainability: {e}")

        job.progress = 100.0
        job.status = models.TrainingStatus.COMPLETED
        job.completed_at = func.now()
        add_log("Training job completed successfully! Model is now in Registry.")
        
        db.commit()

        # 6. Send Telegram Success Notification
        try:
            from app.services.notification import NotificationService
            import asyncio
            
            # Prepare config string (exclude large/internal items)
            ignored_keys = ["file_path", "previous_model_path", "features", "l2_features", "indicators", "target_model_id"]
            if job.algorithm != "PPO-RL":
                ignored_keys.extend(["initial_balance", "trading_fees", "commission", "slippage", "sequence_length"])
            
            if config.get("dataset_type") == "l2_orderbook":
                ignored_keys.append("exchange")  # Exchange is default binance for L2 WS
                
            if config.get("is_deep_training") and config.get("target_rows", 0) > 0:
                ignored_keys.append("data_lookback_hours")
            
            config_lines = []
            for k, v in config.items():
                if k in ignored_keys: continue
                if k == "model_name" and not v: continue  # Skip empty model name
                config_lines.append(f"• {k}: {v}")
                
            config_str = "\n".join(config_lines[:10]) + ("\n• ..." if len(config_lines) > 10 else "")
            
            # Prepare metrics string
            if job.algorithm == "PPO-RL":
                metrics_str = f"• রিটার্ন (Return): {final_explainability.get('total_return_pct', 0):.2f}%\n• উইন রেট (Win Rate): {final_explainability.get('win_rate', 0):.2f}%\n• মোট ট্রেড (Trades): {final_explainability.get('trades_count', 0)}"
            else:
                _acc = final_accuracy if final_accuracy is not None else 0.0
                _f1 = final_f1 if final_f1 is not None else 0.0
                _lat = final_latency if final_latency is not None else 0.0
                metrics_str = f"• Accuracy/R2: {_acc*100:.2f}%\n• Score (F1/MSE): {_f1:.4f}\n• Latency: {_lat:.1f}ms"
                
            # Prepare logs summary
            logs_array = job.logs or []
            log_summary = "\n".join(logs_array[-5:]) if logs_array else "No logs available."
            
            import html
            msg = (
                f"🤖 <b>মডেল ট্রেনিং সম্পন্ন হয়েছে!</b>\n"
                f"━━━━━━━━━━━━━━━━━━\n"
                f"📦 <b>পেয়ার/সিম্বল:</b> {job.symbol} ({job.timeframe})\n"
                f"🧠 <b>অ্যালগরিদম:</b> {job.algorithm}\n"
                f"━━━━━━━━━━━━━━━━━━\n"
                f"⚙️ <b>কনফিগারেশন:</b>\n{html.escape(config_str)}\n"
                f"━━━━━━━━━━━━━━━━━━\n"
                f"📊 <b>মডেলের পারফরম্যান্স:</b>\n{html.escape(metrics_str)}\n"
                f"━━━━━━━━━━━━━━━━━━\n"
                f"📝 <b>লাইভ কনসোল আউটপুট:</b>\n<pre>\n{html.escape(log_summary)}\n</pre>"
            )
            
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(
                NotificationService.send_message(db, job.user_id, msg, parse_mode="HTML")
            )
            loop.close()
        except Exception as notif_ex:
            print(f"Telegram success notification failed: {notif_ex}")

    except TrainingCancelledException:
        # Job is already marked FAILED by the cancel API — stop cleanly and notify user.
        print(f"[train_model_task] Job {job_id} was cancelled by user. Stopping cleanly.")
        add_log("🛑 Training process has been stopped by user.")
        
        # Send Telegram Cancellation Notification
        try:
            from app.services.notification import NotificationService
            import asyncio
            
            rows_scraped = 0
            for log_entry in (job.logs or []):
                if "[Scraper] Collected" in log_entry:
                    try:
                        rows_scraped = int(log_entry.split("Collected ")[1].split(" /")[0])
                    except Exception:
                        pass
            
            msg = (
                f"🛑 <b>ট্রেনিং বন্ধ করা হয়েছে!</b>\n"
                f"━━━━━━━━━━━━━━━━━━\n"
                f"📦 <b>পেয়ার/সিম্বল:</b> {job.symbol} ({job.timeframe})\n"
                f"🧠 <b>অ্যালগরিদম:</b> {job.algorithm}\n"
                f"📊 <b>সংগ্রহিত ডেটা:</b> {rows_scraped} rows\n"
                f"━━━━━━━━━━━━━━━━━━\n"
                f"ℹ️ ব্যবহারকারী ম্যানুয়ালি ট্রেনিং বাতিল করেছেন।"
            )
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(
                NotificationService.send_message(db, job.user_id, msg, parse_mode="HTML")
            )
            loop.close()
        except Exception as notif_ex:
            print(f"Telegram cancel notification failed: {notif_ex}")


    except Exception as e:
        if "cancelled" in str(e).lower() and "user" in str(e).lower():
            print(f"[train_model_task] Job {job_id} was cancelled by user. Stopping cleanly.")
            add_log("🛑 Training process has been stopped by user.")
            try:
                from app.services.notification import NotificationService
                import asyncio
                rows_scraped = 0
                for log_entry in (job.logs or []):
                    if "[Scraper] Collected" in log_entry:
                        try:
                            rows_scraped = int(log_entry.split("Collected ")[1].split(" /")[0])
                        except Exception:
                            pass
                msg = (
                    f"🛑 <b>ট্রেনিং বন্ধ করা হয়েছে!</b>\n"
                    f"━━━━━━━━━━━━━━━━━━\n"
                    f"📦 <b>পেয়ার/সিম্বল:</b> {job.symbol} ({job.timeframe})\n"
                    f"🧠 <b>অ্যালগরিদম:</b> {job.algorithm}\n"
                    f"📊 <b>সংগ্রহিত ডেটা:</b> {rows_scraped} rows\n"
                    f"━━━━━━━━━━━━━━━━━━\n"
                    f"ℹ️ ব্যবহারকারী ম্যানুয়ালি ট্রেনিং বাতিল করেছেন।"
                )
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                loop.run_until_complete(
                    NotificationService.send_message(db, job.user_id, msg, parse_mode="HTML")
                )
                loop.close()
            except Exception as notif_ex:
                print(f"Telegram cancel notification failed: {notif_ex}")
            job.status = models.TrainingStatus.FAILED
            db.commit()
            return

        job.status = models.TrainingStatus.FAILED
        add_log(f"ERROR: {e}")
        import traceback
        add_log(traceback.format_exc())
        
        # 7. Send Telegram Failure Notification
        try:
            from app.services.notification import NotificationService
            import asyncio
            import html
            
            logs_array = job.logs or []
            log_summary = "\n".join(logs_array[-5:]) if logs_array else "No logs available."
            
            msg = (
                f"❌ <b>মডেল ট্রেনিং ব্যর্থ হয়েছে!</b>\n"
                f"━━━━━━━━━━━━━━━━━━\n"
                f"📦 <b>পেয়ার/সিম্বল:</b> {job.symbol} ({job.timeframe})\n"
                f"🧠 <b>অ্যালগরিদম:</b> {job.algorithm}\n"
                f"⚠️ <b>এরর (Error):</b> {html.escape(str(e))[:200]}\n"
                f"━━━━━━━━━━━━━━━━━━\n"
                f"📝 <b>লাইভ কনসোল আউটপুট:</b>\n<pre>\n{html.escape(log_summary)}\n</pre>"
            )
            
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(
                NotificationService.send_message(db, job.user_id, msg, parse_mode="HTML")
            )
            loop.close()
        except Exception as notif_ex:
            print(f"Telegram failure notification failed: {notif_ex}")
            
    finally:
        stop_heartbeat.set()
        db.commit()
