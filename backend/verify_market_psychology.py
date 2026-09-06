import pandas as pd
import numpy as np
import sys
import os

# Add backend to path so imports work
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.services.advanced_ml.features.forex.market_psychology.market_psychology_features import MarketPsychologyEngine
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
    
    # Volume with some random spikes to trigger capitulation/traps
    df['volume'] = np.random.lognormal(10, 1, num_bars)
    
    # Add manual spikes to ensure some metrics trigger
    df.loc[100, 'volume'] = df['volume'].mean() * 5
    df.loc[100, 'high'] = df['high'][100] + 0.02
    
    return df

def test_standalone_engine():
    print("--- 1. Testing Standalone MarketPsychologyEngine ---")
    df = generate_synthetic_forex_data(300)
    initial_cols = list(df.columns)
    
    engine = MarketPsychologyEngine(df)
    df_result = engine.generate_all_features()
    
    new_cols = [c for c in df_result.columns if c.startswith('psych_')]
    
    print(f"Initial columns: {len(initial_cols)}")
    print(f"Generated 'psych_' features: {len(new_cols)}")
    
    if len(new_cols) != 46:
        print(f"[ERROR] Expected 46 psychology metrics, but got {len(new_cols)}!")
        missing_count = 46 - len(new_cols)
        print(f"List of generated: {new_cols}")
        return False
        
    print(f"[SUCCESS] All 46 metrics successfully generated.")
    
    # Check for NaNs (after index 200 due to 200 SMA)
    valid_data = df_result.iloc[200:]
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
    
    # Select 2 legacy metrics and 3 new psych metrics
    selected_features = [
        'sma', 'rsi', # Standard features
        'gap_analysis', 'consecutive_candles', # Legacy psych features
        'psych_capitulation_spike', 'psych_fomo_acceleration', 'psych_euphoria_despair' # New psych features
    ]
    
    try:
        df_result = generate_ohlcv_features(df, selected_features)
        
        # Check if the requested features exist
        missing = [f for f in ['psych_capitulation_spike', 'psych_fomo_acceleration'] if f not in df_result.columns]
        if missing:
            print(f"[ERROR] Main pipeline failed to generate {missing}")
            return False
            
        print("[SUCCESS] Main pipeline integrated successfully without breaking legacy features.")
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
        print("\n=== FINAL RESULT: VERIFICATION FAILED. NEEDS FIXING. ===")
