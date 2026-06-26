import pandas as pd
import numpy as np
import time
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))
from app.services.predatory_liquidity_pipeline import calculate_plp_features

def generate_mock_data():
    dates = pd.date_range(start="2026-06-25 00:00:00", periods=5000, freq="s", tz="UTC")
    np.random.seed(42)
    closes = np.cumsum(np.random.randn(5000)) + 50000
    opens = closes - np.random.randn(5000) * 0.5
    highs = np.maximum(opens, closes) + np.random.rand(5000) * 2
    lows = np.minimum(opens, closes) - np.random.rand(5000) * 2
    volumes = np.random.rand(5000) * 10
    
    df = pd.DataFrame({
        'Open': opens,
        'High': highs,
        'Low': lows,
        'Close': closes,
        'Volume': volumes,
        'Quote_Volume': volumes * closes,
        'Taker_Buy_Volume': volumes * 0.4,
        'Trade_Count': np.random.randint(10, 100, 5000)
    }, index=dates)
    return df

def test_pipeline():
    df = generate_mock_data()
    print(f"Mock Data: {len(df)} rows")
    
    # We select some standard PLP features, some ICT features, and some Candle Psychology features
    selected_features = [
        'retail_panic_sweep_proxy', # Old PLP
        'london_killzone_momentum', # ICT
        'smt_divergence_synthetic', # ICT
        'lower_wick_absorption_ratio', # Candle Psych
        'engulfing_momentum_float', # Candle Psych
        'tick_density_ratio' # Candle Psych
    ]
    
    print(f"\n--- Running Full Pipeline with {len(selected_features)} features ---")
    start_t = time.time()
    result_df = calculate_plp_features(df, selected_features)
    end_t = time.time()
    
    print(f"Computation took {end_t - start_t:.4f} seconds.")
    
    print("\n--- Integration Verification ---")
    all_passed = True
    for f in selected_features:
        if f in result_df.columns:
            nulls = result_df[f].isnull().sum()
            print(f"[OK] {f:30s} | Present in output, Nulls: {nulls}")
        else:
            print(f"[FAIL] {f:30s} | MISSING!")
            all_passed = False
            
    if all_passed:
        print("\n[SUCCESS] End-to-End Pipeline integration works perfectly with new modules!")

if __name__ == "__main__":
    test_pipeline()
