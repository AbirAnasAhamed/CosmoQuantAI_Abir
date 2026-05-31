import os
import sys

# Add backend directory to sys.path so we can import app modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.services.ml_transfer_learning import CrossAlgorithmTransfer

def test_transfer():
    test_cases = [
        {"source_path": "model_PPO.zip", "target_algo": "SAC-RL", "config": {"learning_rate": 0.003}},
        {"source_path": "model_LSTM.pt", "target_algo": "GRU", "config": {"learning_rate": 0.001}},
        {"source_path": "model_XGBoost.pkl", "target_algo": "LightGBM", "config": {"learning_rate": 0.1}},
        {"source_path": "model_RandomForest.pkl", "target_algo": "LightGBM", "config": {"learning_rate": 0.1}},
    ]

    for tc in test_cases:
        print(f"Testing transfer from {tc['source_path']} to {tc['target_algo']}...")
        success, new_config, new_path = CrossAlgorithmTransfer.initialize(
            tc['source_path'], tc['target_algo'], tc['config']
        )
        print(f"Success: {success}")
        print(f"New Config: {new_config}")
        print(f"New Path: {new_path}")
        print("-" * 50)

if __name__ == "__main__":
    test_transfer()
