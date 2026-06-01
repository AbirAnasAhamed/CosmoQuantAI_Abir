import sys
import os
import pandas as pd
import numpy as np

# Add backend to path so we can import app
sys.path.append(os.path.dirname(__file__))

from app.services.advanced_ml.extended_rl_engine import ExtendedRLEngine
from app import models

class MockJob:
    def __init__(self, algo):
        self.id = "mock_job_123"
        self.algorithm = algo
        self.config = {
            "epochs": 1,
            "learning_rate": 0.001,
            "initial_balance": 10000,
            "commission": 0.02,
            "slippage": 0.01
        }
        self.progress = 0
        self.status = models.TrainingStatus.PROCESSING
        self.error_message = None

class MockDB:
    def commit(self): pass
    def refresh(self, obj): pass

def mock_add_log(msg):
    print(f"[LOG] {msg}")

def main():
    print("=== Phase 1 Verification Script ===")
    
    # Create dummy dataframe with enough rows (100+)
    dates = pd.date_range(start="2023-01-01", periods=150, freq="1H")
    df = pd.DataFrame({
        "timestamp": dates,
        "Open": np.random.rand(150) * 1000 + 20000,
        "High": np.random.rand(150) * 1000 + 20000,
        "Low": np.random.rand(150) * 1000 + 20000,
        "Close": np.random.rand(150) * 1000 + 20000,
        "Volume": np.random.rand(150) * 10,
        "RSI": np.random.rand(150) * 100
    })
    
    # Make sure High is highest and Low is lowest
    df['High'] = df[['Open', 'High', 'Low', 'Close']].max(axis=1)
    df['Low'] = df[['Open', 'High', 'Low', 'Close']].min(axis=1)
    
    features = ["Open", "High", "Low", "Close", "Volume", "RSI"]
    db = MockDB()
    
    test_algos = ["A2C-RL", "DDPG-RL", "DQN-RL", "TD3-RL", "Liquid-NN"]
    
    for algo in test_algos:
        print(f"\n--- Testing {algo} ---")
        job = MockJob(algo)
        try:
            model, path, metrics = ExtendedRLEngine.train_extended_rl(
                job=job,
                df=df,
                features=features,
                db=db,
                add_log=mock_add_log
            )
            print(f"✅ SUCCESS: {algo}")
            print(f"  -> Path: {path}")
            print(f"  -> Metrics: {metrics}")
        except Exception as e:
            print(f"❌ FAILED: {algo}")
            print(f"  -> Error: {str(e)}")

if __name__ == "__main__":
    main()
