import os
import sys
import time
from sqlalchemy.orm import Session
from fastapi.testclient import TestClient

# Add the parent directory to sys.path so we can import 'app'
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.db.session import SessionLocal
from app import models
from app.main import app
from app.api import deps
from app.services.ml_training_engine import train_model_task
from app.strategies.helpers.ml_l2_predictor import MLL2Predictor
import torch

# Setup mock user and db
def override_get_db():
    try:
        db = SessionLocal()
        yield db
    finally:
        db.close()

def get_test_user(db: Session):
    user = db.query(models.User).filter(models.User.email == "test_ml_training@example.com").first()
    if not user:
        user = models.User(email="test_ml_training@example.com", full_name="Test ML Training", hashed_password="fake", is_active=True)
        db.add(user)
        db.commit()
        db.refresh(user)
    return user

db = SessionLocal()
test_user = get_test_user(db)
db.close()

def override_get_current_user():
    return test_user

app.dependency_overrides[deps.get_db] = override_get_db
app.dependency_overrides[deps.get_current_user] = override_get_current_user

client = TestClient(app)

ALGORITHMS_TO_TEST = [
    'LightGBM',
    'CatBoost',
    'GRU',
    '1D-CNN',
    'DeepLOB',
    'Transformer',
    'PPO-RL'
]

def test_all_engines():
    print("--- 🚀 Starting ML Engines Verification ---")
    
    successful_models = []
    failed_models = []

    for algo in ALGORITHMS_TO_TEST:
        print(f"\n=======================================")
        print(f"🧪 Testing Engine: {algo}")
        print(f"=======================================")
        
        # Determine optimal config for fast testing
        payload = {
            "symbol": "BTC/USDT",
            "timeframe": "1d",
            "algorithm": algo,
            "config": {
                "indicators": ["RSI", "MACD"],
                "epochs": 1,
                "dataset_type": "ohlcv",
                "ohlcv_period": "1mo", # Very small dataset for fast testing
                "prediction_target": "classification"
            }
        }
        
        # PPO and RL might need more episodes but 1 epoch translates to 1 total_timesteps in our code
        
        response = client.post("/api/v1/model-training/train", json=payload)
        if response.status_code != 200:
            print(f"❌ Failed to start training for {algo}: {response.text}")
            failed_models.append(algo)
            continue
            
        job = response.json()
        job_id = job["id"]
        print(f"✅ Training Job Started! Job ID: {job_id}")
        
        print(f"⚙️ Executing Training Engine...")
        db_session = SessionLocal()
        try:
            train_model_task(job_id, db_session)
        except Exception as e:
            print(f"❌ Exception during training {algo}: {e}")
            import traceback
            traceback.print_exc()
            failed_models.append(algo)
            db_session.close()
            continue
            
        db_session.close()
        
        # Check status
        response = client.get(f"/api/v1/model-training/jobs/{job_id}")
        job_data = response.json()
        
        if job_data['status'] == "COMPLETED":
            print(f"✅ Training successfully completed for {algo}!")
            
            # Now test inference using MLL2Predictor
            print(f"🔍 Testing Inference Engine for {algo}...")
            try:
                # Find the registered model
                models_list = client.get("/api/v1/ml-models/").json()
                # Find the registered model — the auto-trained name includes symbol+algo
                registered_model = next(
                    (m for m in models_list 
                     if m.get("model_type") == algo or algo.lower() in m.get("name", "").lower()),
                    None
                )
                
                if not registered_model:
                    print(f"❌ Model not found in registry for {algo}")
                    failed_models.append(algo)
                    continue
                
                # Instantiate the predictor with the registered model
                predictor = MLL2Predictor(ai_model_id=registered_model["id"])
                
                # Mock a live L2 orderbook snapshot
                mock_orderbook = {
                    "bids": [[50000.0 - i * 0.5, 1.0 + i * 0.1] for i in range(20)],
                    "asks": [[50010.0 + i * 0.5, 1.0 + i * 0.1] for i in range(20)],
                }
                mock_price = 50005.0
                mock_side = "long"
                
                prediction = predictor.predict(mock_orderbook, mock_price, mock_side)
                print(f"✅ Inference successful! Prediction output: {prediction}")
                successful_models.append(algo)
                
            except Exception as e:
                print(f"❌ Inference failed for {algo}: {e}")
                failed_models.append(algo)
        else:
            print(f"❌ Training failed for {algo}: {job_data.get('error_message')}")
            if job_data.get("logs"):
                print("Latest Logs:")
                for log in job_data["logs"][-5:]:
                    print(f"   {log}")
            failed_models.append(algo)

    print("\n\n=======================================")
    print("📊 VERIFICATION SUMMARY")
    print("=======================================")
    print(f"✅ Successful Engines: {len(successful_models)}/7")
    for algo in successful_models:
        print(f"   - {algo}")
        
    if failed_models:
        print(f"\n❌ Failed Engines: {len(failed_models)}")
        for algo in failed_models:
            print(f"   - {algo}")
        sys.exit(1)
    else:
        print("\n🎉 All 7 new ML Engines are fully operational!")

if __name__ == "__main__":
    test_all_engines()
