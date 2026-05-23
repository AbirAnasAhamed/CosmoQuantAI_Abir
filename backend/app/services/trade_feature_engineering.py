import pandas as pd
import numpy as np

def calculate_advanced_trade_features(df_raw: pd.DataFrame, requested_features: list = None) -> pd.DataFrame:
    """
    Calculates institutional/hedge-fund grade HFT features from raw tick data.
    These features are vectorised for ultra-fast calculation suitable for WebSocket live data.
    
    df_raw must contain: 'price', 'amount', and 'side' (or 'trade_dir').
    Ideally should contain 'timestamp' or 'datetime' for tick speed metrics.
    """
    if df_raw is None or df_raw.empty:
        return df_raw
        
    if 'price' not in df_raw.columns or 'amount' not in df_raw.columns:
        # Cannot calculate without price and volume
        return df_raw
        
    df = df_raw.copy()
    
    # --- 1. Basic Data Prep ---
    if 'trade_dir' not in df.columns:
        if 'side' in df.columns:
            df['trade_dir'] = df['side'].map({'buy': 1, 'sell': -1}).fillna(0)
        else:
            # Fallback to tick test rule
            df['price_change'] = df['price'].diff()
            df['trade_dir'] = np.where(df['price_change'] > 0, 1, np.where(df['price_change'] < 0, -1, 0))
            df['trade_dir'] = df['trade_dir'].replace(0, np.nan).ffill().fillna(0)
            
    df['signed_volume'] = df['amount'] * df['trade_dir']
    
    # Calculate inter-arrival time (tick speed)
    if 'timestamp' in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df['timestamp']):
            time_diff = df['timestamp'].diff().dt.total_seconds() * 1000
        else:
            time_diff = df['timestamp'].diff()
    elif 'datetime' in df.columns:
        time_diff = df['datetime'].diff().dt.total_seconds() * 1000
    else:
        time_diff = pd.Series(1.0, index=df.index)
        
    tick_speed_ms = time_diff.fillna(1.0).clip(lower=1.0)
    
    # --- Institutional Grade Windows ---
    window_short = 100  # Fast HFT window (~2-5 seconds on highly active pairs like BTC)
    window_long = 500   # Slow HFT window (~15-30 seconds)
    
    feats = {}
    
    # --- Volume & Flow Dynamics ---
    rolling_buy_vol = df['amount'].where(df['trade_dir'] == 1, 0).rolling(window=window_short, min_periods=1).sum()
    rolling_sell_vol = df['amount'].where(df['trade_dir'] == -1, 0).rolling(window=window_short, min_periods=1).sum()
    
    feats['rolling_vol_imbalance'] = rolling_buy_vol / (rolling_buy_vol + rolling_sell_vol).clip(lower=1e-9)
    feats['trade_velocity'] = df['amount'].rolling(window=window_short, min_periods=1).count() / (tick_speed_ms.rolling(window=window_short, min_periods=1).sum() / 1000).clip(lower=1e-3)
    
    # VWAP Deviation
    cum_vol = df['amount'].cumsum()
    cum_vol_price = (df['price'] * df['amount']).cumsum()
    vwap_tick = cum_vol_price / cum_vol.clip(lower=1e-9)
    feats['vwap_deviation'] = (df['price'] - vwap_tick) / vwap_tick.clip(lower=1e-9)
    
    # Consecutive Directional Runs (Streak length)
    run_blocks = (df['trade_dir'] != df['trade_dir'].shift()).cumsum()
    feats['consecutive_runs'] = df.groupby(run_blocks).cumcount() + 1
    
    feats['aggressor_ratio'] = (df['trade_dir'] == 1).rolling(window=window_short, min_periods=1).mean()
    
    # --- Trade Size & Micro-behavior ---
    feats['avg_trade_size'] = df['amount'].rolling(window=window_short, min_periods=1).mean()
    
    # Whale trade: size > 95th percentile of trailing long window
    rolling_95th = df['amount'].rolling(window=window_long, min_periods=1).quantile(0.95).bfill()
    whale_flag = (df['amount'] > rolling_95th).astype(int)
    feats['whale_trade_freq'] = whale_flag.rolling(window=window_short, min_periods=1).sum()
    
    # Retail proxy: size < 25th percentile
    rolling_25th = df['amount'].rolling(window=window_long, min_periods=1).quantile(0.25).bfill()
    retail_flag = (df['amount'] < rolling_25th).astype(int)
    feats['retail_participation_ratio'] = retail_flag.rolling(window=window_short, min_periods=1).mean()
    
    feats['trade_size_variance'] = df['amount'].rolling(window=window_short, min_periods=1).var().fillna(0)
    
    # Iceberg proxy: consecutive trades at exact same price
    price_unchanged = (df['price'] == df['price'].shift(1)).astype(int)
    iceberg_blocks = (price_unchanged == 0).cumsum()
    feats['iceberg_proxy_count'] = price_unchanged.groupby(iceberg_blocks).cumsum()
    
    # Up-tick vs Down-tick volume
    up_tick_vol = df['amount'].where(df['price'] > df['price'].shift(1), 0).rolling(window=window_short, min_periods=1).sum()
    down_tick_vol = df['amount'].where(df['price'] < df['price'].shift(1), 0).rolling(window=window_short, min_periods=1).sum()
    feats['up_down_tick_ratio'] = up_tick_vol / down_tick_vol.clip(lower=1e-9)

    # --- Price Impact & Micro-Volatility ---
    returns = df['price'].pct_change().fillna(0)
    feats['micro_volatility'] = returns.rolling(window=window_short, min_periods=1).std().fillna(0)
    
    # Amihud Illiquidity: |Return| / Volume
    feats['amihud_illiquidity'] = (returns.abs() / df['amount'].clip(lower=1e-9)).rolling(window=window_short, min_periods=1).mean()
    
    feats['tick_speed'] = tick_speed_ms.rolling(window=window_short, min_periods=1).mean()
    feats['tick_acceleration'] = tick_speed_ms.diff().fillna(0).rolling(window=window_short, min_periods=1).mean()
    feats['zero_tick_ratio'] = (returns == 0).rolling(window=window_short, min_periods=1).mean()
    feats['realized_variance'] = (returns ** 2).rolling(window=window_short, min_periods=1).sum()

    # --- Advanced Stats ---
    # Kyle's Lambda proxy: slope = cov(signed_volume, price_diff) / var(signed_volume)
    price_diff = df['price'].diff().fillna(0)
    cov_sv_pd = df['signed_volume'].rolling(window=window_short, min_periods=1).cov(price_diff).fillna(0)
    var_sv = df['signed_volume'].rolling(window=window_short, min_periods=1).var().fillna(0)
    feats['kyles_lambda'] = (cov_sv_pd / var_sv.clip(lower=1e-9)).fillna(0)
    
    # Autocorrelation of Order Signs (Vectorised lag-1)
    var_td = df['trade_dir'].rolling(window=window_short, min_periods=1).var().fillna(0)
    cov_td = df['trade_dir'].rolling(window=window_short, min_periods=1).cov(df['trade_dir'].shift(1)).fillna(0)
    feats['autocorr_signs'] = (cov_td / var_td.clip(lower=1e-9)).fillna(0)
    
    # Entropy of Trade Directions
    p = feats['aggressor_ratio'].clip(1e-5, 1 - 1e-5)
    feats['entropy_of_signs'] = -p * np.log2(p) - (1-p) * np.log2(1-p)
    
    # Roll Measure: Implicit Spread = 2 * sqrt( max(0, -Cov(dp_t, dp_t-1)) )
    lag_price_diff = price_diff.shift(1).fillna(0)
    cov_dp = price_diff.rolling(window=window_short, min_periods=1).cov(lag_price_diff).fillna(0)
    feats['roll_measure_spread'] = 2 * np.sqrt(np.clip(-cov_dp, a_min=0, a_max=None))
    
    # VPIN Proxy (Volume-Synchronized Probability of Informed Trading)
    feats['vpin_proxy'] = abs(rolling_buy_vol - rolling_sell_vol) / (rolling_buy_vol + rolling_sell_vol).clip(lower=1e-9)
    
    # Append requested features to dataframe
    for col, val in feats.items():
        if requested_features is None or col in requested_features:
            df[col] = val
            
    # Cleanup temporary prep columns to save memory
    cleanup_cols = ['price_change']
    df = df.drop(columns=[c for c in cleanup_cols if c in df.columns], errors='ignore')
    
    return df
