import pandas as pd
import numpy as np
import logging

logger = logging.getLogger(__name__)

def compute_hawkes_intensity(timestamps, alpha=1.2, beta=0.8):
    # Vectorized hawkes process jump intensity (mocked without numba for cross-platform compatibility)
    n = len(timestamps)
    intensity = np.zeros(n)
    if n == 0: return intensity
    for i in range(1, n):
        dt = timestamps[i] - timestamps[i-1]
        intensity[i] = intensity[i-1] * np.exp(-beta * dt) + alpha
    return intensity

def calculate_hybrid_features(df: pd.DataFrame, features: list) -> pd.DataFrame:
    """
    Cross-domain feature engine (L2 + Trades).
    """
    if df.empty: return df
    
    out = pd.DataFrame(index=df.index)
    
    if 'hawkes_intensity_jump' in features or 'hawkes_process_intensity' in features:
        timestamps = (df.index.astype(np.int64) / 10**6).values # milliseconds
        intensity = compute_hawkes_intensity(timestamps)
        if 'hawkes_intensity_jump' in features: out['hawkes_intensity_jump'] = intensity
        if 'hawkes_process_intensity' in features: out['hawkes_process_intensity'] = intensity * df.get('amount', 1).values
        
    if 'trade_impact_top_5_levels' in features:
        out['trade_impact_top_5_levels'] = df.get('amount', 0) / df.get('depth_ratio', 1).replace(0, 1)
        
    if 'smart_money_divergence_cross' in features:
        out['smart_money_divergence_cross'] = df.get('cvd', 0).diff() - df.get('obi', 0).diff()
        
    for f in features:
        if f not in out.columns and f not in df.columns:
            out[f] = 0.0
            
    for col in out.columns:
        df[col] = out[col]
        
    return df
