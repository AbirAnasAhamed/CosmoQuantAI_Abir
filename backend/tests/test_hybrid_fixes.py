import sys
import os
import pandas as pd
import numpy as np
from unittest.mock import patch

# Setup paths
sys.path.append(r"d:\CosmoQuantAI_Abir\backend")

# Create dummy data for technical indicators
dates = pd.date_range('2023-01-01', periods=1500, freq='1D')
df = pd.DataFrame({
    'Open': np.random.randn(1500).cumsum() + 100,
    'High': np.random.randn(1500).cumsum() + 105,
    'Low': np.random.randn(1500).cumsum() + 95,
    'Close': np.random.randn(1500).cumsum() + 100,
    'Volume': np.random.randint(100, 1000, size=1500)
}, index=dates)

logs = []
def dummy_log(msg):
    logs.append(msg)
    print("LOG:", msg)

print("="*50)
print("1. Testing Technical Indicators Fix")
print("="*50)

from app.services.hybrid_pipeline import apply_technical_indicators

try:
    successful = apply_technical_indicators(df, ["SMA Multi", "ADX Multi", "Fake Indicator"], dummy_log)
    print("Successful indicators:", successful)
    if 'SMA_10' in df.columns and "SMA Multi" in successful:
        print("✅ [PASS] Multi indicators successfully calculated without 'Unknown indicator' error.")
    else:
        print("❌ [FAIL] Failed to calculate Multi indicators.")
except Exception as e:
    print(f"❌ [FAIL] Exception during apply_technical_indicators: {e}")

print("\n" + "="*50)
print("2. Testing Target Rows Guardrail (Deep Training)")
print("="*50)

class MockJob:
    symbol = "BTC/USDT"
    timeframe = "1m"
class MockDB:
    pass

job = MockJob()
db = MockDB()

config = {
    "is_deep_training": True,
    "target_rows": 100, # Deliberately set very low
    "ohlcv_period": "1d",
    "exchange": "binance",
    "prediction_target": "classification",
    "plp_features": [],
    "l2_features": ["obi", "spread", "microprice"],
    "resample_l2": False
}

def mock_run_live(symbol, target_rows, db, job, add_log):
    print(f"--> [MOCK] _run_live_scraper called with target_rows: {target_rows}")
    # Return dummy dataframe of exactly target_rows length
    l2_df = pd.DataFrame({
        'Close': np.random.randn(target_rows).cumsum() + 100,
        'obi': np.random.rand(target_rows),
        'spread': np.random.rand(target_rows),
        'microprice': np.random.randn(target_rows).cumsum() + 100
    }, index=pd.date_range(end=pd.Timestamp.utcnow(), periods=target_rows, freq='1s'))
    return l2_df

def mock_fetch_data(*args, **kwargs):
    print("--> [MOCK] fetch_data called")
    # OHLCV data ending at the current time
    return df.copy()

import app.services.hybrid_pipeline as hp

with patch('app.services.ml_training_engine._run_live_scraper', side_effect=mock_run_live), \
     patch('app.services.ml_training_engine.fetch_data', side_effect=mock_fetch_data), \
     patch('app.services.websocket_manager.manager', autospec=True):
    
    try:
        print(f"Calling build_hybrid_dataset with target_rows = {config['target_rows']}...")
        res_df, res_feats = hp.build_hybrid_dataset(job, db, config, dummy_log)
        
        print(f"Returned DataFrame length: {len(res_df)}")
        if len(res_df) > 0:
            print("✅ [PASS] build_hybrid_dataset successfully executed without crashing on 0 rows.")
        else:
            print("❌ [FAIL] build_hybrid_dataset returned 0 rows!")
            
    except Exception as e:
        print(f"❌ [FAIL] build_hybrid_dataset failed with Exception: {e}")

# Check if target_rows was automatically increased in logs
if any("Auto-increasing to 1000" in log for log in logs):
    print("✅ [PASS] Target rows guardrail correctly triggered and logged.")
else:
    print("❌ [FAIL] Target rows guardrail did not trigger.")
