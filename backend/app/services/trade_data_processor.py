import pandas as pd
import numpy as np
import os
import pandas_ta as ta
from app.services.trade_feature_engineering import calculate_advanced_trade_features

def process_historical_trades(file_path: str = None, df_raw: pd.DataFrame = None, bar_type: str = "time", bar_size: str = "1m", volume_threshold: float = 10.0, apply_indicators: list = None, add_log_func=print) -> pd.DataFrame:
    """
    Process raw trade tick data from CSV or DataFrame into ML-ready features.
    Supports both Time Bars and Volume Bars.
    """
    if df_raw is not None and not df_raw.empty:
        add_log_func(f"Processing {len(df_raw)} live trades from WebSocket...")
        df = df_raw.copy()
        if 'timestamp' in df.columns and 'datetime' not in df.columns:
            df['datetime'] = pd.to_datetime(df['timestamp'], unit='ms')
    elif file_path and os.path.exists(file_path):
        add_log_func(f"Loading raw trades from {os.path.basename(file_path)}...")
        try:
            df = pd.read_csv(file_path, usecols=['datetime', 'price', 'amount', 'side'])
        except ValueError:
            df = pd.read_csv(file_path, usecols=['datetime', 'price', 'amount'])
    else:
        raise ValueError("Must provide either a valid file_path or a non-empty df_raw")
        
    df['datetime'] = pd.to_datetime(df['datetime'])
    df['price'] = df['price'].astype(float)
    df['amount'] = df['amount'].astype(float)
    
    # Estimate or use trade direction (1 for Buy, -1 for Sell)
    if 'side' in df.columns:
        df['trade_dir'] = df['side'].map({'buy': 1, 'sell': -1}).fillna(0)
    else:
        # Tick rule fallback
        df['price_change'] = df['price'].diff()
        df['trade_dir'] = np.where(df['price_change'] > 0, 1, np.where(df['price_change'] < 0, -1, 0))
        df['trade_dir'] = df['trade_dir'].replace(0, np.nan).ffill().fillna(0)
        
    df['signed_volume'] = df['amount'] * df['trade_dir']
    df['trade_count'] = 1
    
    # --- CALCULATE ADVANCED TICK FEATURES ---
    add_log_func(f"Calculating institutional-grade advanced tick features...")
    df = calculate_advanced_trade_features(df, requested_features=apply_indicators)
    
    # List of advanced feature columns to aggregate (using 'last' value for the bar)
    adv_cols = [c for c in df.columns if c not in ['datetime', 'timestamp', 'price', 'amount', 'side', 'trade_dir', 'signed_volume', 'trade_count', 'price_change', 'cum_vol', 'bar_id']]
    
    add_log_func(f"Loaded {len(df)} raw trades. Generating {bar_type.upper()} bars...")
    
    if bar_type == "time":
        df.set_index('datetime', inplace=True)
        
        # Mapping timeframe string
        tf_map = {'1s': '1s', '5s': '5s', '1m': '1min', '5m': '5min', '15m': '15min', '1h': '1h', '4h': '4h', '1d': '1d'}
        pandas_tf = tf_map.get(bar_size.lower(), '1min')
        
        # Open, High, Low, Close, Volume
        bars = pd.DataFrame()
        bars['open'] = df['price'].resample(pandas_tf).first()
        bars['high'] = df['price'].resample(pandas_tf).max()
        bars['low'] = df['price'].resample(pandas_tf).min()
        bars['close'] = df['price'].resample(pandas_tf).last()
        bars['volume'] = df['amount'].resample(pandas_tf).sum()
        
        # Trade specific features
        buy_vol = df.loc[df['trade_dir'] == 1, 'amount'].resample(pandas_tf).sum()
        sell_vol = df.loc[df['trade_dir'] == -1, 'amount'].resample(pandas_tf).sum()
        bars['buy_volume'] = buy_vol.fillna(0)
        bars['sell_volume'] = sell_vol.fillna(0)
        
        bars['cvd'] = (bars['buy_volume'] - bars['sell_volume']).cumsum()
        bars['trade_count'] = df['trade_count'].resample(pandas_tf).sum()
        
        # Aggregate advanced tick features (taking the last value of the tick window inside the bar)
        for col in adv_cols:
            bars[col] = df[col].resample(pandas_tf).last().ffill()
        
        # FFill missing candles
        bars['close'] = bars['close'].ffill()
        bars['open'] = bars['open'].fillna(bars['close'])
        bars['high'] = bars['high'].fillna(bars['close'])
        bars['low'] = bars['low'].fillna(bars['close'])
        bars['volume'] = bars['volume'].fillna(0)
        bars['trade_count'] = bars['trade_count'].fillna(0)
        
    elif bar_type == "volume":
        df['cum_vol'] = df['amount'].cumsum()
        df['bar_id'] = (df['cum_vol'] // volume_threshold).astype(int)
        
        bars = df.groupby('bar_id').agg(
            datetime=('datetime', 'last'),
            open=('price', 'first'),
            high=('price', 'max'),
            low=('price', 'min'),
            close=('price', 'last'),
            volume=('amount', 'sum'),
            net_volume=('signed_volume', 'sum'),
            trade_count=('trade_count', 'sum')
        )
        bars.set_index('datetime', inplace=True)
        bars['cvd'] = bars['net_volume'].cumsum()
        bars['buy_volume'] = (bars['volume'] + bars['net_volume']) / 2
        bars['sell_volume'] = (bars['volume'] - bars['net_volume']) / 2
        
        # Aggregate advanced tick features (taking the last value of the tick window inside the bar)
        adv_agg = df.groupby('bar_id')[adv_cols].last()
        bars = bars.join(adv_agg)
    else:
        raise ValueError("bar_type must be either 'time' or 'volume'")
        
    bars = bars.dropna()
    
    # Capitalize columns for consistency with rest of the engine
    bars.rename(columns={'open': 'Open', 'high': 'High', 'low': 'Low', 'close': 'Close', 'volume': 'Volume'}, inplace=True)
    
    add_log_func(f"Generated {len(bars)} bars. Calculating requested indicators...")

    return bars
