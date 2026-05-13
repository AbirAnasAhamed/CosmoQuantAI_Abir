"""
Hybrid Deep Pipeline: Dual WebSocket L2 Orderbook + Live Trade (aggTrade)
=========================================================================
Collects two Binance real-time streams in parallel:
  - Stream 1: @depth20@100ms  → L2 Orderbook Snapshots
  - Stream 2: @aggTrade       → Aggregated Trade Ticks (per executed trade)

Merge strategy: Trade-tick granularity.
  Each aggTrade row gets the most recent L2 snapshot forward-filled onto it
  via pandas.merge_asof(direction='backward').

This module is fully self-contained and does NOT modify any existing pipeline.
"""

import asyncio
import json
import logging
import websockets
import pandas as pd
import numpy as np
from datetime import datetime
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 1: Trade Tick Feature Engineering
# ══════════════════════════════════════════════════════════════════════════════

def calculate_trade_tick_features(df: pd.DataFrame, selected_features: list) -> pd.DataFrame:
    """
    Calculates up to 12 advanced trade tick features from aggTrade data.

    Input df must contain: price (float), qty (float), is_buyer_maker (bool).
    L2 columns (obi, spread, microprice, etc.) may also be present from merge.

    Only calculates features that are in `selected_features` (fully modular).
    Intermediate columns are cleaned up before returning.
    """
    if df.empty:
        return df

    df = df.copy()
    df['price'] = pd.to_numeric(df['price'], errors='coerce').fillna(0.0)
    df['qty']   = pd.to_numeric(df['qty'],   errors='coerce').fillna(0.0)

    # Direction: aggTrade `is_buyer_maker=True` means the buyer was the market maker
    # → the aggressor was a seller → direction = -1
    df['_dir'] = df['is_buyer_maker'].apply(lambda x: -1 if x else 1)
    df['_sv']  = df['qty'] * df['_dir']

    # ── Feature 1: CVD (Real, from aggTrade) ─────────────────────────────────
    if 'cvd' in selected_features:
        df['cvd'] = df['_sv'].cumsum()

    # ── Feature 2: Buy Volume ─────────────────────────────────────────────────
    if 'buy_volume' in selected_features:
        df['buy_volume'] = df['qty'].where(df['_dir'] == 1, 0.0)

    # ── Feature 3: Sell Volume ────────────────────────────────────────────────
    if 'sell_volume' in selected_features:
        df['sell_volume'] = df['qty'].where(df['_dir'] == -1, 0.0)

    # ── Feature 4: Trade Count ────────────────────────────────────────────────
    if 'trade_count' in selected_features:
        df['trade_count'] = 1  # rolling sum applied externally during training

    # ── Feature 5: Aggressor Ratio (rolling 10-tick buy rate) ─────────────────
    if 'aggressor_ratio' in selected_features:
        df['aggressor_ratio'] = (df['_dir'] == 1).astype(float) \
            .rolling(window=10, min_periods=1).mean()

    # ── Feature 6: Large Trade Flag (dynamic 2σ threshold) ────────────────────
    if 'large_trade_flag' in selected_features:
        qty_mean = df['qty'].mean()
        qty_std  = df['qty'].std()
        threshold = qty_mean + 2 * qty_std if qty_std > 0 else qty_mean * 3
        df['large_trade_flag'] = (df['qty'] > threshold).astype(float)

    # ── Feature 7: VWAP Deviation ─────────────────────────────────────────────
    if 'vwap_deviation' in selected_features:
        cum_pv   = (df['price'] * df['qty']).cumsum()
        cum_v    = df['qty'].cumsum()
        vwap     = cum_pv / (cum_v + 1e-9)
        df['vwap_deviation'] = (df['price'] - vwap) / (vwap + 1e-9)

    # ── Feature 8: Trade Imbalance Ratio (rolling 20-tick) ────────────────────
    if 'trade_imbalance_ratio' in selected_features:
        roll_buy  = df['qty'].where(df['_dir'] == 1, 0.0) \
            .rolling(window=20, min_periods=1).sum()
        roll_sell = df['qty'].where(df['_dir'] == -1, 0.0) \
            .rolling(window=20, min_periods=1).sum()
        total = roll_buy + roll_sell
        df['trade_imbalance_ratio'] = (roll_buy - roll_sell) / (total + 1e-9)

    # ── Feature 9: Tick Speed (milliseconds between consecutive trades) ────────
    if 'tick_speed' in selected_features:
        df['tick_speed'] = (
            df.index.to_series().diff().dt.total_seconds().fillna(0) * 1000
        )

    # ── Feature 10: Price Impact per Unit Volume ──────────────────────────────
    if 'price_impact' in selected_features:
        price_change = df['price'].diff().abs().fillna(0)
        df['price_impact'] = price_change / (df['qty'] + 1e-9)

    # ── Feature 11: Rolling CVD (5 ticks) ─────────────────────────────────────
    if 'rolling_cvd_5' in selected_features:
        df['rolling_cvd_5'] = df['_sv'].rolling(window=5, min_periods=1).sum()

    # ── Feature 12: Rolling CVD (20 ticks) ────────────────────────────────────
    if 'rolling_cvd_20' in selected_features:
        df['rolling_cvd_20'] = df['_sv'].rolling(window=20, min_periods=1).sum()

    # Cleanup intermediate columns
    df.drop(columns=['_dir', '_sv'], inplace=True, errors='ignore')
    df.replace([np.inf, -np.inf], np.nan, inplace=True)
    df.fillna(0, inplace=True)

    return df


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 2: Timestamp-based As-Of Merge
# ══════════════════════════════════════════════════════════════════════════════

def merge_tick_with_l2(df_trades: pd.DataFrame, df_l2: pd.DataFrame) -> pd.DataFrame:
    """
    Merges trade ticks with L2 snapshots using a backward as-of merge.

    For each aggTrade timestamp, the most recent L2 snapshot (up to 500ms ago)
    is forward-filled onto that row.

    Args:
        df_trades: DataFrame indexed by timestamp — trade tick columns
        df_l2:     DataFrame indexed by timestamp — L2 feature columns

    Returns:
        Merged DataFrame at trade-tick granularity (one row per aggTrade)
    """
    if df_trades.empty:
        raise ValueError("[HybridDeep] Trade DataFrame is empty.")
    if df_l2.empty:
        raise ValueError("[HybridDeep] L2 DataFrame is empty.")

    # Normalise indices to tz-naive datetime64[ns]
    def _norm_index(df):
        df = df.copy()
        df.index = pd.to_datetime(df.index).tz_localize(None).astype('datetime64[ns]')
        return df.sort_index()

    df_trades = _norm_index(df_trades)
    df_l2     = _norm_index(df_l2)

    # Remove L2 columns that would conflict with trade columns
    conflict_cols = [c for c in ['price', 'qty', 'amount', 'is_buyer_maker']
                     if c in df_l2.columns]
    df_l2 = df_l2.drop(columns=conflict_cols, errors='ignore')

    # Reset index to column for merge_asof
    trades_r = df_trades.reset_index().rename(columns={df_trades.index.name or 'index': 'timestamp'})
    l2_r     = df_l2.reset_index().rename(columns={df_l2.index.name or 'index': 'timestamp'})

    trades_r['timestamp'] = pd.to_datetime(trades_r['timestamp']).astype('datetime64[ns]')
    l2_r['timestamp']     = pd.to_datetime(l2_r['timestamp']).astype('datetime64[ns]')

    # As-of merge: each trade tick ← nearest past L2 snapshot (max 500ms gap)
    merged = pd.merge_asof(
        trades_r.sort_values('timestamp'),
        l2_r.sort_values('timestamp'),
        on='timestamp',
        direction='backward',
        tolerance=pd.Timedelta('500ms')
    )

    merged.set_index('timestamp', inplace=True)
    return merged


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 3: Dual WebSocket Scraper
# ══════════════════════════════════════════════════════════════════════════════

async def _async_hybrid_deep_scraper(
    symbol: str,
    target_rows: int,
    db: Session,
    job,
    add_log_func
) -> tuple:
    """
    Runs two Binance WebSocket streams in parallel until target_rows trade
    ticks are collected.

    Stream 1: @depth20@100ms  → l2_buffer
    Stream 2: @aggTrade       → trade_buffer

    Returns: (df_trades, df_l2)
    """
    from app import models as _models
    from app.services.ml_training_engine import TrainingCancelledException

    clean = symbol.upper().split(":")[0].replace("/", "").lower()
    l2_url    = f"wss://stream.binance.com:9443/ws/{clean}@depth20@100ms"
    trade_url = f"wss://stream.binance.com:9443/ws/{clean}@aggTrade"

    l2_buffer    = []
    trade_buffer = []
    trade_count  = 0
    stop_event   = asyncio.Event()
    log_interval = max(100, target_rows // 20)

    try:
        from app.services.websocket_manager import manager as _ws_manager
    except Exception:
        _ws_manager = None

    # ── L2 Stream ─────────────────────────────────────────────────────────────
    async def _l2_stream():
        retry = 0
        while not stop_event.is_set() and retry < 5:
            try:
                async with websockets.connect(
                    l2_url, ping_interval=20, ping_timeout=30
                ) as ws:
                    retry = 0
                    while not stop_event.is_set():
                        raw  = await asyncio.wait_for(ws.recv(), timeout=15)
                        data = json.loads(raw)
                        bids = data.get('bids', [])
                        asks = data.get('asks', [])
                        if not bids or not asks:
                            continue

                        best_bid = float(bids[0][0])
                        best_ask = float(asks[0][0])
                        bid_vol  = sum(float(b[1]) for b in bids[:10])
                        ask_vol  = sum(float(a[1]) for a in asks[:10])
                        total_v  = bid_vol + ask_vol

                        obi        = (bid_vol - ask_vol) / total_v if total_v > 0 else 0.0
                        spread     = (best_ask - best_bid) / best_bid if best_bid > 0 else 0.0
                        microprice = (bid_vol * best_ask + ask_vol * best_bid) / total_v \
                                     if total_v > 0 else (best_bid + best_ask) / 2

                        l2_buffer.append({
                            'timestamp':  datetime.utcnow(),
                            'obi':        obi,
                            'spread':     spread,
                            'microprice': microprice,
                            'bids':       bids[:20],
                            'asks':       asks[:20],
                        })
            except asyncio.CancelledError:
                break
            except Exception:
                if not stop_event.is_set():
                    retry += 1
                    await asyncio.sleep(2)

    # ── Trade Stream ──────────────────────────────────────────────────────────
    async def _trade_stream():
        nonlocal trade_count
        retry = 0
        while not stop_event.is_set() and retry < 5:
            try:
                async with websockets.connect(
                    trade_url, ping_interval=20, ping_timeout=30
                ) as ws:
                    retry = 0
                    while not stop_event.is_set() and trade_count < target_rows:
                        raw  = await asyncio.wait_for(ws.recv(), timeout=15)
                        data = json.loads(raw)
                        if data.get('e') != 'aggTrade':
                            continue

                        ts    = datetime.utcfromtimestamp(data['T'] / 1000.0)
                        price = float(data['p'])
                        qty   = float(data['q'])
                        is_bm = bool(data['m'])

                        trade_buffer.append({
                            'timestamp':       ts,
                            'price':           price,
                            'qty':             qty,
                            'is_buyer_maker':  is_bm,
                        })
                        trade_count += 1

                        # Live tick broadcast to frontend visualizer
                        if _ws_manager:
                            try:
                                await _ws_manager.broadcast(
                                    json.dumps({
                                        "type":      "hybrid_deep_tick",
                                        "symbol":    symbol,
                                        "timestamp": ts.isoformat(),
                                        "price":     price,
                                        "qty":       qty,
                                        "side":      "sell" if is_bm else "buy",
                                    }),
                                    channel_id="training_visualizer"
                                )
                            except Exception:
                                pass

                        # Cancellation check every 50 trades
                        if trade_count % 50 == 0:
                            db.refresh(job)
                            if (job.status == _models.TrainingStatus.FAILED and
                                    job.error_message and
                                    "cancelled" in job.error_message.lower()):
                                add_log_func("🛑 HybridDeep stopped by cancellation.")
                                stop_event.set()
                                raise TrainingCancelledException(
                                    "Cancelled during hybrid deep scraping."
                                )

                        # Progress log
                        if trade_count % log_interval == 0:
                            pct = min(10.0, (trade_count / target_rows) * 10.0)
                            job.progress = pct
                            db.commit()
                            add_log_func(
                                f"[HybridDeep] Trades: {trade_count}/{target_rows} | "
                                f"L2 snapshots: {len(l2_buffer)}"
                            )

                    stop_event.set()  # Signal L2 stream to stop too
                    break

            except TrainingCancelledException:
                raise
            except asyncio.CancelledError:
                stop_event.set()
                break
            except Exception:
                if not stop_event.is_set():
                    retry += 1
                    await asyncio.sleep(2)

    # ── Run Both in Parallel ──────────────────────────────────────────────────
    add_log_func(f"[HybridDeep] Dual WebSocket connecting for {symbol}...")
    add_log_func(f"[HybridDeep]  ├─ Stream 1: L2 Orderbook (depth20@100ms)")
    add_log_func(f"[HybridDeep]  └─ Stream 2: Aggregated Trades (aggTrade)")

    try:
        await asyncio.gather(_l2_stream(), _trade_stream())
    except Exception as e:
        from app.services.ml_training_engine import TrainingCancelledException as _TCE
        if isinstance(e, _TCE):
            raise
        add_log_func(f"[HybridDeep] Stream gather error: {e}")

    add_log_func(
        f"[HybridDeep] Collection complete: "
        f"{len(trade_buffer)} trades | {len(l2_buffer)} L2 snapshots"
    )

    # Build DataFrames
    df_trades = pd.DataFrame(trade_buffer)
    df_l2     = pd.DataFrame(l2_buffer)

    if not df_trades.empty:
        df_trades['timestamp'] = pd.to_datetime(df_trades['timestamp'])
        df_trades.set_index('timestamp', inplace=True)

    if not df_l2.empty:
        df_l2['timestamp'] = pd.to_datetime(df_l2['timestamp'])
        df_l2.set_index('timestamp', inplace=True)

    return df_trades, df_l2


def _run_hybrid_deep_scraper(symbol, target_rows, db, job, add_log_func):
    """Synchronous wrapper — runs the async dual-WS scraper inside Celery."""
    from app.services.ml_training_engine import TrainingCancelledException
    try:
        return asyncio.run(
            _async_hybrid_deep_scraper(symbol, target_rows, db, job, add_log_func)
        )
    except TrainingCancelledException:
        raise
    except Exception as e:
        add_log_func(f"[HybridDeep] Scraper crashed: {e}")
        return pd.DataFrame(), pd.DataFrame()


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 4: Main Pipeline Entry Point
# ══════════════════════════════════════════════════════════════════════════════

# Known feature sets for modular filtering
_KNOWN_L2_FEATURES = {
    'Effective_Spread', 'Spread_ROC', 'Mid_Price_Acceleration', 'Spread_Asymmetry',
    'WAP_Top_5', 'WAP_Top_10', 'Multi_Level_Imbalance_Top5', 'Multi_Level_Imbalance_Top10',
    'Depth_Ratio', 'Ask_Wall_Distance', 'Bid_Wall_Distance', 'Order_Book_Skewness',
    'Level_1_Imbalance', 'Imbalance_Momentum', 'Order_Flow_Imbalance', 'OFI_Acceleration',
    'CVD_Proxy', 'CVD_Acceleration', 'Realized_Micro_Volatility', 'Tick_Test_Roll',
    'obi', 'spread', 'microprice',
}

_KNOWN_TRADE_FEATURES = {
    'cvd', 'buy_volume', 'sell_volume', 'trade_count', 'aggressor_ratio',
    'large_trade_flag', 'vwap_deviation', 'trade_imbalance_ratio',
    'tick_speed', 'price_impact', 'rolling_cvd_5', 'rolling_cvd_20',
}

_EXCLUDE_COLS = {
    'Target', 'Open', 'High', 'Low', 'Close', 'Volume', 'price',
    'qty', 'is_buyer_maker', 'Adj Close',
}


def build_hybrid_deep_dataset(job, db: Session, config: dict, add_log) -> tuple:
    """
    Main entry point for the Hybrid Deep (L2 + Live Trade) training pipeline.

    Steps:
        1. Dual WebSocket collection (L2 + aggTrade in parallel)
        2. Advanced L2 feature calculation on L2 buffer
        3. As-of merge (trade-tick granularity)
        4. Trade tick feature engineering (12 modular features)
        5. Target variable creation
        6. Modular feature list construction

    Returns:
        (df, features)  — ML-ready DataFrame and feature column list
    """
    from app.services.auto_feature_selector import calculate_l2_advanced_features

    symbol          = job.symbol
    target_rows     = config.get("target_rows", 10000)
    sel_l2          = config.get("l2_features", ["obi", "spread", "microprice"])
    sel_trade       = config.get("hybrid_deep_trade_features", [
        "cvd", "buy_volume", "sell_volume", "trade_count",
        "aggressor_ratio", "large_trade_flag", "vwap_deviation",
    ])
    pred_target     = config.get("prediction_target", "classification")

    add_log(f"[HybridDeep] ═══ Starting Hybrid Deep Training for {symbol} ═══")
    add_log(f"[HybridDeep] Target: {target_rows:,} trade ticks")
    add_log(f"[HybridDeep] L2 features selected: {len(sel_l2)}")
    add_log(f"[HybridDeep] Trade features selected: {len(sel_trade)}")

    # ── Step 1: Dual WebSocket Collection ─────────────────────────────────────
    df_trades, df_l2 = _run_hybrid_deep_scraper(
        symbol, target_rows, db, job, add_log
    )

    if df_trades.empty:
        raise Exception(
            "[HybridDeep] Trade buffer is empty. Check WebSocket connectivity."
        )
    if df_l2.empty:
        raise Exception(
            "[HybridDeep] L2 buffer is empty. Check WebSocket connectivity."
        )

    add_log(f"[HybridDeep] Raw: {len(df_trades)} trade ticks, {len(df_l2)} L2 snapshots")

    # ── Step 2: Advanced L2 Feature Calculation ────────────────────────────────
    add_log("[HybridDeep] Calculating advanced L2 microstructure features...")
    try:
        l2_prep = df_l2.copy().reset_index()
        # Rename index column to 'timestamp' if needed
        if l2_prep.columns[0] != 'timestamp':
            l2_prep.rename(columns={l2_prep.columns[0]: 'timestamp'}, inplace=True)
        if 'microprice' in l2_prep.columns:
            l2_prep['Close'] = l2_prep['microprice']

        df_l2_adv, _ = calculate_l2_advanced_features(l2_prep)
        # Attach advanced feature columns back to df_l2
        df_l2_adv.index = df_l2.index[:len(df_l2_adv)]
        for col in df_l2_adv.columns:
            if col not in df_l2.columns:
                df_l2[col] = df_l2_adv[col]
        add_log(f"[HybridDeep] Added {len(df_l2_adv.columns)} advanced L2 features.")
    except Exception as e:
        add_log(f"[HybridDeep] ⚠️ Advanced L2 features skipped (non-fatal): {e}")

    # Drop raw bids/asks (not needed after feature extraction)
    df_l2.drop(columns=['bids', 'asks'], inplace=True, errors='ignore')

    # ── Step 3: As-Of Merge (trade-tick granularity) ──────────────────────────
    add_log("[HybridDeep] Merging trade ticks ← L2 snapshots (as-of merge)...")
    df = merge_tick_with_l2(df_trades, df_l2)
    add_log(f"[HybridDeep] Merged: {len(df)} rows × {len(df.columns)} columns")

    # ── Step 4: Trade Tick Feature Engineering ────────────────────────────────
    add_log(f"[HybridDeep] Engineering trade features: {sel_trade}")
    df = calculate_trade_tick_features(df, sel_trade)

    # ── Step 5: Target Variable ────────────────────────────────────────────────
    # Use microprice > price fallback for Close
    if 'Close' not in df.columns:
        if 'microprice' in df.columns:
            df['Close'] = df['microprice']
        elif 'price' in df.columns:
            df['Close'] = df['price']
        else:
            raise Exception("[HybridDeep] Cannot find Close price for target.")

    if pred_target == "classification":
        df['Target'] = (df['Close'].shift(-1) > df['Close']).astype(int)
    else:
        df['Target'] = df['Close'].shift(-1)

    df.dropna(inplace=True)

    if len(df) < 10:
        raise Exception(
            f"[HybridDeep] Not enough data after processing: {len(df)} rows."
        )

    # ── Step 6: Modular Feature List ──────────────────────────────────────────
    final_features = []
    for col in df.columns:
        if col in _EXCLUDE_COLS:
            continue
        if col in _KNOWN_L2_FEATURES:
            if col in sel_l2:
                final_features.append(col)
        elif col in _KNOWN_TRADE_FEATURES:
            if col in sel_trade:
                final_features.append(col)
        # All other columns (e.g., mid_price from merge) are excluded cleanly

    if not final_features:
        final_features = ['Close']

    l2_cnt    = sum(1 for f in final_features if f in _KNOWN_L2_FEATURES)
    trade_cnt = sum(1 for f in final_features if f in _KNOWN_TRADE_FEATURES)
    add_log(
        f"[HybridDeep] Feature set: {len(final_features)} total "
        f"(L2: {l2_cnt} | Trade Tick: {trade_cnt})"
    )

    # ── Broadcast preview to frontend visualizer ───────────────────────────────
    try:
        import json as _json
        import asyncio as _aio
        from app.services.websocket_manager import manager as _mgr

        preview = []
        for ts, row in df.tail(200).iterrows():
            rec = row.to_dict()
            rec['timestamp'] = ts.isoformat() if isinstance(ts, pd.Timestamp) else str(ts)
            rec = {k: (None if pd.isna(v) else v) for k, v in rec.items()}
            preview.append(rec)

        payload = _json.dumps({
            "type": "final_dataset",
            "symbol": symbol,
            "mode": "hybrid_deep",
            "data": preview,
        })
        try:
            loop = _aio.get_event_loop()
            if loop.is_running():
                loop.create_task(_mgr.broadcast(payload, channel_id="training_visualizer"))
            else:
                _aio.run(_mgr.broadcast(payload, channel_id="training_visualizer"))
        except RuntimeError:
            _aio.run(_mgr.broadcast(payload, channel_id="training_visualizer"))
    except Exception as e:
        add_log(f"⚠️ Dataset preview broadcast failed (non-fatal): {e}")

    return df, final_features
