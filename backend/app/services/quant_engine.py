import pandas as pd
import numpy as np
from statsmodels.tsa.stattools import coint
from typing import Dict, Union, Tuple, List

def calculate_correlation_matrix(price_data: pd.DataFrame) -> Dict:
    """
    Calculate the Pearson correlation matrix of asset returns.
    
    Args:
        price_data (pd.DataFrame): DataFrame with asset symbols as columns and timestamps as rows.
                                   Values should be numeric prices.

    Returns:
        Dict: A dictionary representation of the correlation matrix.
              NaNs are replaced with 0.
    """
    # Calculate percentage change to get returns
    returns = price_data.pct_change()
    
    # Calculate correlation matrix
    correlation_matrix = returns.corr(method='pearson')
    
    # Replace NaNs with 0 (e.g., if a column has constant values or not enough data)
    correlation_matrix = correlation_matrix.fillna(0)
    
    # Convert to dictionary
    return correlation_matrix.to_dict()

def calculate_cointegration(series_a: Union[pd.Series, np.ndarray], series_b: Union[pd.Series, np.ndarray]) -> Dict:
    """
    Perform the Engle-Granger two-step cointegration test.
    
    Args:
        series_a: First time series (price data).
        series_b: Second time series (price data).

    Returns:
        Dict: A dictionary containing:
              - score (float): The t-statistic of the unit-root test on residuals.
              - p_value (float): MacKinnon's approximate p-value.
              - is_cointegrated (bool): True if p_value < 0.05, else False.
    """
    # Ensure inputs are valid 1D arrays/series and drop NaNs if aligned
    # Check for length match, etc. handled by statsmodels largely, but let's be safe
    # If using pandas, we might want to align indices, but the prompt implies simple series input
    # calculating cointegration requires aligned data usually.
    
    # Run cointegration test
    # coint returns: t-stat, p-value, crit_values
    score, p_value, _ = coint(series_a, series_b)
    
    return {
        "score": float(score),
        "p_value": float(p_value),
        "is_cointegrated": bool(p_value < 0.05)
    }

def calculate_z_score(spread: pd.Series, window: int = 20) -> float:
    """
    Calculate the rolling Z-Score of the spread.
    
    Args:
        spread (pd.Series): The spread time series (e.g., Asset A - Asset B * HedgeRatio).
        window (int): The rolling window size. Default is 20.

    Returns:
        float: The latest Z-Score value. 
               Returns 0.0 if not enough data.
    """
    if len(spread) < window:
        return 0.0

    rolling_mean = spread.rolling(window=window).mean()
    rolling_std = spread.rolling(window=window).std()
    
    z_score = (spread - rolling_mean) / rolling_std
    
    # Get the latest value. Handle potential NaNs at the start or if std is 0
    latest_z = z_score.iloc[-1]
    
    
    if pd.isna(latest_z) or np.isinf(latest_z):
        return 0.0
        
    return float(latest_z)

def calculate_rolling_correlation(series_a: pd.Series, series_b: pd.Series, window: int = 30) -> List[Dict[str, float]]:
    """
    Calculate the rolling correlation between two time series.

    Args:
        series_a (pd.Series): First time series.
        series_b (pd.Series): Second time series.
        window (int): Rolling window size.

    Returns:
        List[Dict[str, float]]: A list of dictionaries containing time and correlation value.
                                [{'time': timestamp, 'value': correlation}, ...]
    """
    # Ensure they are aligned
    df = pd.DataFrame({'a': series_a, 'b': series_b}).dropna()

    if len(df) < window:
        return []

    # Calculate rolling correlation
    rolling_corr = df['a'].rolling(window=window).corr(df['b'])

    # Convert to list of dicts
    result = []
    for date, value in rolling_corr.items():
        if pd.notna(value):
             time_val = date.isoformat() if hasattr(date, 'isoformat') else str(date)
             result.append({"time": time_val, "value": value})
             
    return result

def detect_lead_lag(series_a: pd.Series, series_b: pd.Series, max_lag: int = 10) -> Dict[str, Union[int, float]]:
    """
    Detect lead-lag relationship using cross-correlation.
    
    Args:
        series_a: First time series.
        series_b: Second time series.
        max_lag: Maximum lag to check in both directions.

    Returns:
        Dict: {'lag': int, 'correlation': float}
              If max_correlation is at lag -2, it means series_b shifted by -2 matches series_a.
              series_b(t-2) ~ series_a(t) => series_b happened 2 steps earlier?
              Wait.
              df['b'].shift(-2) means shifts UP (t value goes to t-2 index? No).
              pandas shift(-2): value at t comes from t+2.
              shifted_b[t] = b[t+2].
              If corr(a[t], shifted_b[t]) is high, then a[t] ~ b[t+2].
              A(t) matches B(t+2).
              A happens, then B happens 2 steps later.
              A Leads B by 2 steps.
              Return lag -2.
              
              If shift is +2.
              shifted_b[t] = b[t-2].
              a[t] ~ b[t-2].
              A(t) matches B(t-2).
              B happened 2 steps ago.
              B Leads A by 2 steps.
              Return lag +2.
    """
    # Ensure alignment
    df = pd.DataFrame({'a': series_a, 'b': series_b}).dropna()
    if len(df) < max_lag * 2 + 1:
         return {'lag': 0, 'correlation': 0.0}
        
    correlations = {}
    # Iterate from -max_lag to +max_lag
    for lag in range(-max_lag, max_lag + 1):
        if lag == 0:
            c = df['a'].corr(df['b'])
        else:
            shifted_b = df['b'].shift(lag)
            # Use common index
            valid_idx = shifted_b.dropna().index.intersection(df['a'].index)
            if len(valid_idx) < 10: # Minimum sample size
                c = 0
            else:
                c = df['a'].loc[valid_idx].corr(shifted_b.loc[valid_idx])
        
        correlations[lag] = c if pd.notna(c) else 0.0

    # Find max correlation key
    # We want the strongest relationship, positive or negative?
    # Usually for lead/lag in trades, we care about directional following, so +1 correlation.
    # But let's assume absolute magnitude for strength, but return signed correlation.
    best_lag = max(correlations, key=lambda k: correlations.get(k, 0))
    max_corr = correlations[best_lag]
    
    return {'lag': int(best_lag), 'correlation': float(max_corr)}
