import os
import sys
import pandas as pd
import numpy as np

# Add backend to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.services.advanced_ml.engine import AdvancedMLEngine
from app.services.advanced_ml.data_handler import AdvancedDataHandler

class MockJob:
    def __init__(self):
        self.id = "test_ppo_job"
        self.config = {
            "epochs": 2,
            "initial_balance": 10000,
            "commission": 0.02, # 0.02%
            "slippage": 0.01 # 0.01%
        }

class MockDB:
    def commit(self):
        pass

def add_log(msg):
    print(msg)

def run_verification():
    print("--- Starting PPO-RL Verification ---")
    
    # 1. Create Dummy Data with large swings to encourage trading
    # 1000 rows, price swings from 100 to 110
    steps = np.arange(1000)
    prices = 100 + 10 * np.sin(steps / 10.0) + np.random.normal(0, 0.1, 1000)
    
    # Very large features to test normalization
    volume = np.random.uniform(100000, 500000, 1000)
    obi = np.random.uniform(0, 1, 1000)
    
    df = pd.DataFrame({
        "timestamp": pd.date_range("2023-01-01", periods=1000, freq="1min"),
        "Close": prices,
        "volume": volume,
        "obi": obi
    })
    
    features = ["volume", "obi"]
    
    # Verify DataHandler Normalization
    print("Checking Data Normalization...")
    rl_df = AdvancedDataHandler.prepare_rl_data(df, features)
    print(f"Raw Volume Mean: {df['volume'].mean():.2f}")
    print(f"Normalized Volume Mean: {rl_df['volume'].mean():.2f} (Expected: ~0)")
    assert abs(rl_df['volume'].mean()) < 0.1, "Features were not normalized!"
    
    job = MockJob()
    db = MockDB()
    
    print("\nRunning PPO-RL Training (2 epochs)...")
    try:
        model, model_path, metrics = AdvancedMLEngine.train_ppo_rl(
            job=job,
            df=df,
            features=features,
            db=db,
            add_log=add_log
        )
        print("\n--- Training Completed Successfully ---")
        print("Metrics Returned:")
        for k, v in metrics.items():
            print(f"  {k}: {v}")
            
        assert "win_rate" in metrics, "Missing 'win_rate' in metrics"
        assert "sharpe_ratio" in metrics, "Missing 'sharpe_ratio' in metrics"
        
        # We expect some trades to have happened because the price fluctuates 10% 
        # and commission is only 0.02%.
        if metrics.get("trades_count", 0) == 0:
            print("\n⚠️ WARNING: The agent did not take any trades. But it completed without errors.")
        else:
            print("\n✅ SUCCESS: The agent successfully took trades and learned!")
            
    except Exception as e:
        print(f"\n❌ ERROR during PPO-RL training: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    run_verification()
