import pandas as pd
import numpy as np
import os
import json
import pandas_ta as ta
from sqlalchemy.orm import Session
from datetime import datetime

# Import feature helpers
from app.services.helpers.institutional_features import add_smc_fvg, add_ict_killzones, add_wick_rejection, add_swing_structure, add_order_blocks
from app.services.helpers.vwap_calculator import calculate_vwap_sd_features

def apply_technical_indicators(df: pd.DataFrame, indicators: list, add_log) -> list:
    """Applies technical indicators to the OHLCV DataFrame."""
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
            
    return successful_indicators

def build_hybrid_dataset(job, db: Session, config: dict, add_log) -> tuple[pd.DataFrame, list]:
    """
    Builds a merged dataset of OHLCV and L2 Orderbook data.
    Returns:
        df: The merged pandas DataFrame.
        features: A list of feature columns to be used for model training.
    """
    # Import locally to avoid circular dependencies if needed
    from app.services.ml_training_engine import fetch_data, fetch_l2_data, _run_live_scraper

    symbol = job.symbol
    timeframe = job.timeframe
    
    # 1. Fetch OHLCV Data
    ohlcv_period = config.get("ohlcv_period", "1mo")
    exchange_name = config.get("exchange", "binance")
    add_log(f"[HYBRID] Fetching historical OHLCV data for {symbol} from {exchange_name.upper()}...")
    df_ohlcv = fetch_data(symbol, timeframe, period=ohlcv_period, exchange_name=exchange_name)
    add_log(f"[HYBRID] Fetched {len(df_ohlcv)} rows of OHLCV market data.")
    
    # Apply indicators to OHLCV
    indicators = config.get("indicators", ["RSI", "MACD"])
    add_log(f"[HYBRID] Calculating technical indicators: {', '.join(indicators)}")
    successful_indicators = apply_technical_indicators(df_ohlcv, indicators, add_log)
    add_log(f"[HYBRID] Successfully calculated {len(successful_indicators)} OHLCV features.")
    
    # Drop rows that don't have enough data to calculate indicators
    df_ohlcv.dropna(inplace=True)

    # 2. Fetch L2 Data
    is_deep_training = config.get("is_deep_training", False)
    target_rows = config.get("target_rows", 0)
    lookback_hours = config.get("data_lookback_hours", 6)
    resample_l2 = config.get("resample_l2", True)
    
    if is_deep_training and target_rows > 0:
        add_log(f"[HYBRID] Starting Deep Training Data Collector. Target: {target_rows} rows from Live Binance WebSocket...")
        df_l2 = _run_live_scraper(symbol, target_rows, db, job, add_log)
        if df_l2.empty:
            raise Exception("[HYBRID] Deep Training failed. Scraper returned empty dataset.")
    else:
        add_log(f"[HYBRID] Fetching High-Frequency L2 OrderBook data for {symbol} (Last {lookback_hours} hours)...")
        timeframe_to_pass = timeframe if resample_l2 else None
        df_l2 = fetch_l2_data(symbol, db, lookback_hours, timeframe_to_pass)
        if resample_l2:
            add_log(f"[HYBRID] Fetched L2 data and resampled to {timeframe} timeframe.")
        else:
            add_log(f"[HYBRID] Fetched {len(df_l2)} ticks of raw High-Frequency L2 data.")
            
    if df_l2.empty:
        raise Exception("[HYBRID] No L2 data available for the given lookback period.")

    # 3. Merge Datasets
    add_log("[HYBRID] Merging OHLCV and L2 OrderBook datasets on timestamps...")
    
    # Ensure both indices are tz-naive and have exact same dtype for merge_asof
    df_ohlcv.index = pd.to_datetime(df_ohlcv.index).tz_localize(None).astype('datetime64[ns]')
    df_l2.index = pd.to_datetime(df_l2.index).tz_localize(None).astype('datetime64[ns]')
    
    # Sort just in case
    df_ohlcv.sort_index(inplace=True)
    df_l2.sort_index(inplace=True)
    
    # Drop target-related or duplicate columns from L2 before merging if they exist
    cols_to_drop = [col for col in ['Open', 'High', 'Low', 'Close', 'Volume'] if col in df_l2.columns]
    if cols_to_drop:
        df_l2.drop(columns=cols_to_drop, inplace=True, errors='ignore')

    if resample_l2:
        # Standard inner merge since both are resampled to same interval
        df = pd.merge(df_ohlcv, df_l2, left_index=True, right_index=True, how='inner')
    else:
        # As-of merge for raw ticks. 
        # For each L2 tick, find the most recent OHLCV candle (forward-fill OHLCV onto L2)
        add_log("[HYBRID] Performing 'As-Of' merge (Forward Filling OHLCV onto L2 ticks)...")
        # We need to use merge_asof which requires sorted indices
        df = pd.merge_asof(
            df_l2.reset_index(), 
            df_ohlcv.reset_index(), 
            on='timestamp', 
            direction='backward'
        )
        df.set_index('timestamp', inplace=True)

    add_log(f"[HYBRID] Merged dataset contains {len(df)} rows.")

    # 4. Target Calculation
    prediction_target = config.get("prediction_target", "classification")
    if 'Close' not in df.columns:
        # If somehow 'Close' is missing, fallback to L2 microprice proxy
        if 'microprice' in df.columns:
            df['Close'] = df['microprice']
        else:
            raise Exception("[HYBRID] 'Close' price is missing from merged dataset.")

    if prediction_target == "classification":
        df['Target'] = (df['Close'].shift(-5) > df['Close']).astype(int)
    else:
        df['Target'] = df['Close'].shift(-5)
        
    df.dropna(inplace=True)

    if prediction_target == "classification" and df['Target'].nunique() == 1:
        add_log("⚠️ Target variable has only one class (no variance). Artificially adding an opposite label to prevent model crash.")
        opposite_label = 1 if df['Target'].iloc[0] == 0 else 0
        df.iloc[0, df.columns.get_loc('Target')] = opposite_label
        df.iloc[-1, df.columns.get_loc('Target')] = opposite_label

    if len(df) < 10:
        raise Exception(f"[HYBRID] Not enough data after merging. Found {len(df)} rows. Please increase dataset lookbacks.")

    # 5. Define Feature Sets
    l2_selected = config.get("l2_features", ["obi", "spread", "microprice"])
    exclude_cols = ['Target', 'Open', 'High', 'Low', 'Close', 'Volume', 'Adj Close']
    
    KNOWN_L2_FEATURES = {
        'Effective_Spread', 'Spread_ROC', 'Mid_Price_Acceleration', 'Spread_Asymmetry',
        'WAP_Top_5', 'WAP_Top_10', 'Multi_Level_Imbalance_Top5', 'Multi_Level_Imbalance_Top10',
        'Depth_Ratio', 'Ask_Wall_Distance', 'Bid_Wall_Distance', 'Order_Book_Skewness',
        'Level_1_Imbalance', 'Imbalance_Momentum', 'Order_Flow_Imbalance', 'OFI_Acceleration',
        'CVD_Proxy', 'CVD_Acceleration', 'Realized_Micro_Volatility', 'Tick_Test_Roll',
        'obi', 'spread', 'microprice'
    }
    
    final_features = []
    all_possible = df.columns.tolist()
    
    for col in all_possible:
        if col in exclude_cols:
            continue
            
        if col in KNOWN_L2_FEATURES:
            # Only include L2 features if the user explicitly selected them
            if col in l2_selected:
                final_features.append(col)
        else:
            # This is a Technical Indicator (e.g., RSI_14, MACD_12_26_9) or other column
            final_features.append(col)

    if not final_features:
        final_features = ['Close']

    add_log(f"[HYBRID] Using {len(final_features)} combined features for training (L2: {sum(1 for f in final_features if f in KNOWN_L2_FEATURES)}, TA: {sum(1 for f in final_features if f not in KNOWN_L2_FEATURES)}).")
    
    # Broadcast final dataset preview
    try:
        from app.services.websocket_manager import manager
        import asyncio
        preview_df = df.tail(200).copy()
        
        preview_records = []
        for ts, row in preview_df.iterrows():
            rec = row.to_dict()
            rec['timestamp'] = ts.isoformat() if isinstance(ts, pd.Timestamp) else str(ts)
            # Replace NaNs with None for JSON serialization
            for k, v in rec.items():
                if pd.isna(v):
                    rec[k] = None
            preview_records.append(rec)
            
        payload = {
            "type": "final_dataset",
            "symbol": symbol,
            "data": preview_records
        }
        
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(manager.broadcast(json.dumps(payload), channel_id="training_visualizer"))
            else:
                asyncio.run(manager.broadcast(json.dumps(payload), channel_id="training_visualizer"))
        except RuntimeError:
            asyncio.run(manager.broadcast(json.dumps(payload), channel_id="training_visualizer"))
    except Exception as e:
        add_log(f"⚠️ Failed to broadcast final dataset preview: {e}")
    
    return df, final_features
