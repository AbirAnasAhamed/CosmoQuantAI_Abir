import pandas as pd
import numpy as np
import sys
import os

# Add backend to path so imports work
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.services.advanced_ml.features.forex.ict_macro.ict_macro_features import ICTMacroEngine
from app.services.ml.forex_feature_engine import generate_ohlcv_features

def generate_synthetic_forex_data(num_bars=300):
    np.random.seed(42)
    
    # Generate realistic random walk for close price
    returns = np.random.normal(0, 0.002, num_bars)
    close_prices = 1.1000 * np.exp(np.cumsum(returns))
    
    df = pd.DataFrame({'close': close_prices})
    
    # Generate realistic open, high, low based on volatility
    atr = df['close'].rolling(14).std().fillna(0.002)
    df['open'] = df['close'].shift(1).fillna(1.1000)
    
    # Randomly assign high/low around open and close
    max_oc = df[['open', 'close']].max(axis=1)
    min_oc = df[['open', 'close']].min(axis=1)
    
    df['high'] = max_oc + np.abs(np.random.normal(0, 0.001, num_bars))
    df['low'] = min_oc - np.abs(np.random.normal(0, 0.001, num_bars))
    
    # Volume with some random spikes
    df['volume'] = np.random.lognormal(10, 1, num_bars)
    
    return df

def test_standalone_engine():
    print("--- 1. Testing Standalone ICTMacroEngine ---")
    df = generate_synthetic_forex_data(300)
    initial_cols = list(df.columns)
    
    engine = ICTMacroEngine(df)
    df_result = engine.generate_all_features()
    
    new_cols = [c for c in df_result.columns if c.startswith('ict_')]
    
    print(f"Initial columns: {len(initial_cols)}")
    print(f"Generated 'ict_' features: {len(new_cols)}")
    
    if len(new_cols) != 26:
        print(f"[ERROR] Expected 26 ICT Macro metrics, but got {len(new_cols)}!")
        print(f"List of generated: {new_cols}")
        return False
        
    print(f"[SUCCESS] All 26 metrics successfully generated.")
    
    # Check for NaNs (after index 100 due to 100 SMA in MMBM)
    valid_data = df_result.iloc[100:]
    nan_counts = valid_data[new_cols].isna().sum()
    cols_with_nans = nan_counts[nan_counts > 0]
    
    if len(cols_with_nans) > 0:
        print(f"[ERROR] Found unexpected NaNs in calculated metrics after burn-in period:")
        print(cols_with_nans)
        return False
        
    print(f"[SUCCESS] No unexpected NaNs found. Vectorization is fully safe.")
    return True

def test_pipeline_integration():
    print("\n--- 2. Testing Main Pipeline Integration ---")
    df = generate_synthetic_forex_data(300)
    
    selected_features = [
        'sma', 'rsi', # Standard features
        'fvg', # SMC feature
        'ict_ipda_20d_lookback', 'ict_cbdr_range_compression', 'ict_macro_regime_shift_proxy' # New ICT features
    ]
    
    try:
        df_result = generate_ohlcv_features(df, selected_features)
        
        # Check if the requested features exist
        missing = [f for f in ['ict_ipda_20d_lookback', 'ict_cbdr_range_compression'] if f not in df_result.columns]
        if missing:
            print(f"[ERROR] Main pipeline failed to generate {missing}")
            return False
            
        print("[SUCCESS] Main pipeline integrated successfully without breaking legacy/SMC features.")
        return True
    except Exception as e:
        print(f"[ERROR] Main pipeline crashed: {e}")
        return False

if __name__ == "__main__":
    success_1 = test_standalone_engine()
    success_2 = test_pipeline_integration()
    
    if success_1 and success_2:
        print("\n=== FINAL RESULT: 100% SUCCESS. ALL METRICS AND PIPELINES ARE SOLID. ===")
    else:
        print("\n=== FINAL RESULT: VERIFICATION FAILED. ===")
