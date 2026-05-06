import pandas as pd
import numpy as np

def calculate_vwap_sd_features(df: pd.DataFrame, anchor: str = 'Daily') -> pd.DataFrame:
    """
    Calculates Anchored VWAP, Standard Deviation, and Z-Score for ML features.
    Assumes df has a DatetimeIndex and columns: ['High', 'Low', 'Close', 'Volume']
    """
    df_out = pd.DataFrame(index=df.index)
    
    # Check if we have volume; if not, create a dummy volume column to prevent crashes
    if 'Volume' not in df.columns:
        volume = pd.Series(1.0, index=df.index)
    else:
        volume = df['Volume'].replace(0, 1.0)  # Prevent division by zero
        
    # Calculate Typical Price
    if all(col in df.columns for col in ['High', 'Low', 'Close']):
        typical_price = (df['High'] + df['Low'] + df['Close']) / 3.0
    else:
        # Fallback for L2 data which might only have 'Close' or 'microprice'
        typical_price = df['Close']
    
    # Build a flat working frame so groupby.transform works reliably
    work = pd.DataFrame({
        'tp':  typical_price,
        'vol': volume,
        'pv':  typical_price * volume,
        'p2v': (typical_price ** 2) * volume,
    }, index=df.index)
    
    # Define anchoring group key as a single Series (avoids multi-level index issues)
    if anchor == 'Weekly':
        iso = df.index.isocalendar()
        group_key = iso['year'].astype(str) + '_W' + iso['week'].astype(str)
    else:
        # Default / 'Daily'
        group_key = df.index.year.astype(str) + '_' + df.index.dayofyear.astype(str)
    
    work['_group'] = group_key.values
    
    # Use transform so the index is preserved perfectly (no reset_index needed)
    cum_vol = work.groupby('_group')['vol'].transform(pd.Series.cumsum)
    cum_pv  = work.groupby('_group')['pv'].transform(pd.Series.cumsum)
    cum_p2v = work.groupby('_group')['p2v'].transform(pd.Series.cumsum)
    
    # VWAP
    vwap = cum_pv / cum_vol
    
    # Variance = E[X²] - (E[X])²   (clip to 0 for floating-point safety)
    variance = ((cum_p2v / cum_vol) - vwap ** 2).clip(lower=0)
    std_dev  = np.sqrt(variance)
    
    # Z-Score: (Close - VWAP) / VWAP_SD
    z_score = np.where(std_dev > 0, (df['Close'] - vwap) / std_dev, 0.0)
    
    df_out['VWAP']        = vwap.values
    df_out['VWAP_SD']     = std_dev.values
    df_out['VWAP_Z_Score'] = z_score
    
    return df_out
