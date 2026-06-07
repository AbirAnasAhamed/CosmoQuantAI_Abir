import sys
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(SCRIPT_DIR, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.append(BACKEND_DIR)

from app.schemas.model_training import TrainingJobCreate

payload = {
    "symbol": "BTC/USDT",
    "timeframe": "Tick",
    "algorithm": "Decision-Transformer",
    "config": {
        "dataset_type": "hybrid_deep",
        "hybrid_snapshot_file": "BTC_USDT_HYBRID_1000_20260607_120000.parquet",
        "hybrid_deep_trade_features": ["cvd", "buy_volume"]
    }
}

try:
    job = TrainingJobCreate(**payload)
    print("✅ Schema validation successful!")
    print(f"Parsed config: {job.config}")
    assert "hybrid_snapshot_file" in job.config
    print("✅ hybrid_snapshot_file successfully parsed inside config!")
except Exception as e:
    print(f"❌ Schema validation failed: {e}")
