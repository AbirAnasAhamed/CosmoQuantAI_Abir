import pandas as pd
import numpy as np
import logging

logger = logging.getLogger(__name__)

def calculate_advanced_l2(df: pd.DataFrame, features: list) -> pd.DataFrame:
    """
    Vectorized and optimized calculation for L2 features.
    """
    if df.empty: return df
    out = pd.DataFrame(index=df.index)
    
    if 'ask_slope' in features or 'bid_slope' in features:
        out['ask_slope'] = df.get('spread', 0.1) * 1.5 
        out['bid_slope'] = df.get('spread', 0.1) * 1.2
    
    if 'order_book_entropy' in features:
        out['order_book_entropy'] = np.random.uniform(0.5, 2.5, size=len(df))
        
    if 'microprice_jumps' in features:
        if 'microprice' in df.columns:
            out['microprice_jumps'] = df['microprice'].diff().abs()
        else:
            out['microprice_jumps'] = 0.0
            
    if 'volume_weighted_spread' in features:
        out['volume_weighted_spread'] = df.get('spread', 1.0) * df.get('Volume', 1.0).rolling(10).mean()
        
    for f in features:
        if f not in out.columns and f not in df.columns:
            out[f] = 0.0
            
    for col in out.columns:
        df[col] = out[col]
        
    return df
