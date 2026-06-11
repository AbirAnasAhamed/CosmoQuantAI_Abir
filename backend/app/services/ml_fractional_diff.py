import pandas as pd
import numpy as np

def get_weights(d, size):
    """
    Returns weights for fractional differentiation.
    """
    w = [1.]
    for k in range(1, size):
        w_ = -w[-1] / k * (d - k + 1)
        w.append(w_)
    
    # Reverse so that oldest data gets w[0] and newest gets w[-1]
    w = np.array(w[::-1]).reshape(-1, 1) 
    return w

def frac_diff(series, d, thres=1e-5):
    """
    Fractionally differentiate a pandas series.
    series: pd.Series
    d: float, differencing value (e.g. 0.5)
    thres: float, drops weights below this threshold to save computation.
    """
    if d == 0.0:
        return series
    elif d == 1.0:
        return series.diff()

    # Calculate weights
    w = [1.]
    for k in range(1, len(series)):
        w_ = -w[-1] / k * (d - k + 1)
        if abs(w_) < thres:
            break
        w.append(w_)
    
    w = np.array(w[::-1])
    
    # Apply weights using convolution
    res = np.convolve(series, w, mode='valid')
    
    # Pad the beginning with NaNs to match original length
    pad_len = len(series) - len(res)
    res_padded = np.concatenate([np.full(pad_len, np.nan), res])
    
    return pd.Series(res_padded, index=series.index)

def apply_fractional_differentiation(df, d_value=0.5, exclude_cols=None):
    """
    Applies fractional differentiation to all numeric columns in df except excluded ones.
    """
    if exclude_cols is None:
        exclude_cols = []
        
    df_diff = df.copy()
    
    for col in df_diff.columns:
        if col not in exclude_cols and pd.api.types.is_numeric_dtype(df_diff[col]):
            # Only apply to price-like or cumulative features that need stationarity
            # E.g., 'close', 'open', 'high', 'low', 'volume'
            # We skip categorical or already stationary features if possible
            # Here we apply to all non-excluded numeric columns for simplicity
            df_diff[col] = frac_diff(df_diff[col], d=d_value)
            
    # Drop rows with NaNs introduced by the windowing
    df_diff.dropna(inplace=True)
    return df_diff
