import sys
import os
import time
import pandas as pd
import numpy as np

# Ensure backend path is in sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), 'app')))

from services.advanced_ml.features.forex.smc_market_structure_features import SMCMarketStructureFeatures

def generate_synthetic_forex_data(rows=100000):
    """Generate 100,000 rows of synthetic OHLCV data with DatetimeIndex for testing."""
    print(f"[*] Generating {rows} rows of synthetic Forex data...")
    
    # 15-minute intervals
    dates = pd.date_range(start='2020-01-01', periods=rows, freq='15min')
    
    # Random walk for price
    np.random.seed(42)
    returns = np.random.normal(loc=0, scale=0.001, size=rows)
    close_price = 1.1000 * np.exp(np.cumsum(returns))
    
    # OHLC synthesis
    high_price = close_price * (1 + np.abs(np.random.normal(0, 0.0005, size=rows)))
    low_price = close_price * (1 - np.abs(np.random.normal(0, 0.0005, size=rows)))
    open_price = np.roll(close_price, 1)
    open_price[0] = close_price[0] # Fix first row
    
    df = pd.DataFrame({
        'open': open_price,
        'high': high_price,
        'low': low_price,
        'close': close_price,
        'volume': np.random.randint(100, 5000, size=rows)
    }, index=dates)
    
    return df

def run_verification():
    print("=" * 60)
    print("SMC & Market Structure Feature Engine Verification")
    print("=" * 60)
    
    df = generate_synthetic_forex_data(rows=100000)
    print(f"[*] Input DataFrame Shape: {df.shape}")
    print(f"[*] Index Type: {type(df.index)}")
    print("-" * 60)
    
    # Measure execution time
    start_time = time.time()
    
    print("[*] Running SMCMarketStructureFeatures.calculate_all()...")
    result_df = SMCMarketStructureFeatures.calculate_all(df)
    
    execution_time = time.time() - start_time
    
    print("-" * 60)
    print("EXECUTION RESULTS")
    print("-" * 60)
    print(f"Execution Time: {execution_time:.4f} seconds (for 100,000 rows!)")
    
    # Feature count validation
    new_cols = [c for c in result_df.columns if c.startswith('smc_')]
    print(f"Total SMC Metrics Generated: {len(new_cols)} (Expected: 66)")
    
    if len(new_cols) != 66:
        print("ERROR: Metric count mismatch! Please review the code.")
    else:
        print("SUCCESS: Exact metric count matched (66).")
        
    # NaN and Infinity check
    nan_count = result_df[new_cols].isna().sum().sum()
    inf_count = np.isinf(result_df[new_cols]).sum().sum()
    
    print(f"Total NaNs: {nan_count}")
    print(f"Total Infinities: {inf_count}")
    
    if nan_count == 0 and inf_count == 0:
        print("SUCCESS: Data is 100% clean (No NaNs or Infs). ML Ready.")
    else:
        print("ERROR: Dirty data found!")

    print("-" * 60)
    print("DEEP ANALYSIS OF KEY METRICS (Sample Data)")
    print("-" * 60)
    
    # Display statistics for a few key metrics to prove they are working and dynamic
    key_metrics = [
        'smc_current_structure_state',
        'smc_htf_ltf_structural_confluence',
        'smc_ob_mitigation_count',
        'smc_in_london_killzone',
        'smc_dist_to_sydney_high'
    ]
    
    for metric in key_metrics:
        if metric in result_df.columns:
            unique_vals = result_df[metric].nunique()
            mean_val = result_df[metric].mean()
            print(f"- {metric}:")
            print(f"   - Unique Values: {unique_vals}")
            print(f"   - Mean Value: {mean_val:.4f}")
            print(f"   - Min/Max: {result_df[metric].min():.4f} / {result_df[metric].max():.4f}")
            
            if unique_vals > 1:
                print("   - Status: Active & Dynamic (OK)")
            else:
                print("   - Status: Flat/Inactive (Check logic)")
            print()
            
    print("=" * 60)
    print("Verification Complete!")
    print("=" * 60)

if __name__ == "__main__":
    run_verification()
