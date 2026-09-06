import sys
import os
import time
import pandas as pd
import numpy as np

# Ensure backend path is in sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), 'app')))

from services.advanced_ml.features.forex.candlestick_pattern_features import CandlestickPatternFeatures

def run_verification():
    print("=" * 60)
    print("Candlestick Pattern Feature Engine Verification")
    print("=" * 60)
    
    rows = 50000
    dates = pd.date_range(start='2020-01-01', periods=rows, freq='15min')
    
    np.random.seed(42)
    returns = np.random.normal(loc=0, scale=0.001, size=rows)
    close_price = 1.1000 * np.exp(np.cumsum(returns))
    high_price = close_price * (1 + np.abs(np.random.normal(0, 0.0005, size=rows)))
    low_price = close_price * (1 - np.abs(np.random.normal(0, 0.0005, size=rows)))
    open_price = np.roll(close_price, 1)
    open_price[0] = close_price[0]
    
    df = pd.DataFrame({
        'open': open_price,
        'high': high_price,
        'low': low_price,
        'close': close_price,
        'volume': np.random.randint(100, 5000, size=rows)
    }, index=dates)
    
    start_time = time.time()
    
    result_df = CandlestickPatternFeatures.calculate_all(df)
    
    execution_time = time.time() - start_time
    
    print(f"Execution Time: {execution_time:.4f} seconds")
    
    new_cols = [c for c in result_df.columns if c.startswith('cdl_')]
    print(f"Total Metrics Generated: {len(new_cols)} (Expected: 65)")
    
    nan_count = result_df[new_cols].isna().sum().sum()
    inf_count = np.isinf(result_df[new_cols]).sum().sum()
    
    print(f"Total NaNs: {nan_count}")
    print(f"Total Infinities: {inf_count}")
    
    print("-" * 60)
    print("DEEP ANALYSIS OF CUSTOM QUANT METRICS")
    print("-" * 60)
    
    for metric in ['cdl_custom_pin_bar', 'cdl_custom_days_since_master', 'cdl_custom_exhaustion_divergence', 'cdl_custom_momentum_power']:
        if metric in result_df.columns:
            unique_vals = result_df[metric].nunique()
            mean_val = result_df[metric].mean()
            print(f"- {metric}:")
            print(f"   - Unique Values: {unique_vals}")
            print(f"   - Min/Max: {result_df[metric].min():.4f} / {result_df[metric].max():.4f}")
            print()

if __name__ == "__main__":
    run_verification()
