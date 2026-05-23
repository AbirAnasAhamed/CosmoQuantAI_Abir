import sys
import os
import pandas as pd
import numpy as np

# Add backend directory to sys.path so we can import app modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../../../d:/CosmoQuantAI_Abir/backend')))

from app.services.trade_feature_engineering import calculate_advanced_trade_features

def generate_dummy_ticks(n=1000):
    np.random.seed(42)
    # Generate dummy Binance-like aggTrade data
    timestamps = pd.date_range("2026-05-01 00:00:00", periods=n, freq='10ms') # 10ms intervals
    prices = 60000 + np.random.randn(n).cumsum() * 10 # Random walk
    amounts = np.abs(np.random.randn(n) * 2) # Random amounts
    sides = np.random.choice(['buy', 'sell'], n)
    
    # Introduce some consecutive runs and identical prices for iceberg proxy
    for i in range(100, 110):
        sides[i] = 'buy'
        prices[i] = prices[100]
        
    df = pd.DataFrame({
        'timestamp': timestamps,
        'price': prices,
        'amount': amounts,
        'side': sides
    })
    return df

def run_test():
    print("--- Starting Feature Engineering Test ---")
    df_raw = generate_dummy_ticks(2000)
    print(f"Generated {len(df_raw)} dummy tick rows.")
    
    # Expected all 23 features
    expected_features = [
        'rolling_vol_imbalance', 'trade_velocity', 'vwap_deviation', 'consecutive_runs',
        'aggressor_ratio', 'avg_trade_size', 'whale_trade_freq', 'retail_participation_ratio',
        'trade_size_variance', 'iceberg_proxy_count', 'up_down_tick_ratio', 'micro_volatility',
        'amihud_illiquidity', 'tick_speed', 'tick_acceleration', 'zero_tick_ratio', 'realized_variance',
        'kyles_lambda', 'autocorr_signs', 'entropy_of_signs', 'roll_measure_spread', 'vpin_proxy'
    ]
    
    try:
        df_feats = calculate_advanced_trade_features(df_raw, requested_features=None)
        print("\nTest passed! Calculation ran without errors.")
        
        missing = [f for f in expected_features if f not in df_feats.columns]
        if missing:
            print(f"ERROR: Missing features -> {missing}")
        else:
            print(f"SUCCESS: All {len(expected_features)} expected features generated successfully.")
            
        print("\n--- Output DataFrame Sample (last 3 rows) ---")
        pd.set_option('display.max_columns', None)
        print(df_feats[expected_features].tail(3))
        
        # Check for NaNs
        nans = df_feats[expected_features].isna().sum().sum()
        print(f"\nTotal NaN values in feature columns: {nans}")
        
    except Exception as e:
        import traceback
        print("\nERROR during calculation:")
        traceback.print_exc()

if __name__ == "__main__":
    run_test()
