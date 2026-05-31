import os
import sys
import pandas as pd
import numpy as np
import torch
from unittest.mock import MagicMock

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.services.advanced_ml.engine import AdvancedMLEngine
from app.services.ml_predictor import _infer_torch

def generate_mock_data():
    np.random.seed(42)
    dates = pd.date_range("2023-01-01", periods=200, freq="1h")
    df = pd.DataFrame({
        "timestamp": dates,
        "Open": np.random.uniform(50000, 60000, 200),
        "High": np.random.uniform(50000, 60000, 200),
        "Low": np.random.uniform(50000, 60000, 200),
        "Close": np.random.uniform(50000, 60000, 200),
        "Volume": np.random.uniform(100, 1000, 200),
        "Target_Up": np.random.choice([0, 1], 200),
        "Target_Return": np.random.normal(0, 0.01, 200),
    })
    df.set_index("timestamp", inplace=True)
    return df

def test_pipeline():
    print("Starting Advanced ML Pipeline Verification...")
    
    df = generate_mock_data()
    features = ["Open", "High", "Low", "Close", "Volume"]
    
    # Mock DB and Job
    db = MagicMock()
    job = MagicMock()
    job.id = "test_adv_job"
    job.config = {
        "sequence_length": 10,
        "epochs": 1,
        "learning_rate": 0.01,
        "prediction_target": "classification"
    }
    
    def mock_add_log(msg):
        # strip emojis for console
        clean_msg = msg.encode('ascii', 'ignore').decode('ascii')
        print(f" [LOG] {clean_msg}")

    print("\n--- 1. Testing TCN ---")
    job.algorithm = "TCN"
    try:
        tcn_model, tcn_path, tcn_metrics = AdvancedMLEngine.train_tcn(job, df, features, db, mock_add_log)
        print("PASS TCN Training passed. Path:", tcn_path)
        
        # Test inference
        X_infer = df[features].iloc[-1:].values
        signal, conf = _infer_torch(tcn_path, "TCN", X_infer, "classification", None)
        print(f"PASS TCN Inference passed: Signal={signal}, Confidence={conf}")
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"FAIL TCN Failed: {e}")

    print("\n--- 2. Testing TabNet ---")
    job.algorithm = "TabNet"
    try:
        tabnet_model, tabnet_path, tabnet_metrics = AdvancedMLEngine.train_tabnet(job, df, features, db, mock_add_log)
        print("PASS TabNet Training passed. Path:", tabnet_path)
        
        X_infer = df[features].iloc[-1:].values
        signal, conf = _infer_torch(tabnet_path, "TabNet", X_infer, "classification", None)
        print(f"PASS TabNet Inference passed: Signal={signal}, Confidence={conf}")
    except Exception as e:
        print(f"FAIL TabNet Failed: {e}")

    print("\n--- 3. Testing Auto-Encoder ---")
    job.algorithm = "Auto-Encoder"
    try:
        ae_model, ae_path, ae_metrics = AdvancedMLEngine.train_autoencoder(job, df, features, db, mock_add_log)
        threshold = ae_metrics.get("anomaly_threshold")
        print("PASS Auto-Encoder Training passed. Path:", ae_path, "| Threshold:", threshold)
        
        # Test Inference (Normal)
        X_infer = df[features].iloc[-1:].values
        signal, conf = _infer_torch(ae_path, "Auto-Encoder", X_infer, "classification", threshold)
        print(f"PASS Auto-Encoder Inference (Normal) passed: Signal={signal}, Confidence={conf}")
        
        # Test Inference (Anomaly/Crash)
        X_infer_anomaly = X_infer * 50  # Huge spike
        signal, conf = _infer_torch(ae_path, "Auto-Encoder", X_infer_anomaly, "classification", threshold)
        print(f"PASS Auto-Encoder Inference (Anomaly) passed: Signal={signal}, Confidence={conf}")
    except Exception as e:
        print(f"FAIL Auto-Encoder Failed: {e}")

    print("\n--- 4. Testing SAC-RL ---")
    job.algorithm = "SAC-RL"
    job.config["epochs"] = 1 # VERY small for test
    try:
        rl_model, rl_path, rl_metrics = AdvancedMLEngine.train_rl(job, df, features, db, mock_add_log)
        print("PASS SAC-RL Training passed. Path:", rl_path)
        print("PASS SAC-RL Metrics:", rl_metrics)
    except Exception as e:
        print(f"FAIL SAC-RL Failed: {e}")

if __name__ == "__main__":
    test_pipeline()
    print("\nAll Advanced ML verification steps completed!")
