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

def test_ml_training():
    print("--- 🚀 Starting ML Training Verification ---")
    
    # 1. Start Training Job
    print("\n1️⃣  Starting Training Job...")
    payload = {
        "symbol": "BTC-USD",
        "timeframe": "1d",
        "algorithm": "Random Forest",
        "config": {
            "indicators": ["RSI", "MACD"],
            "epochs": 10
        }
    }
    
    response = client.post("/api/v1/model-training/train", json=payload)
    if response.status_code != 200:
        print(f"❌ Failed to start training: {response.text}")
        sys.exit(1)
        
    job = response.json()
    job_id = job["id"]
    print(f"✅ Training Job Started! Job ID: {job_id}")
    
    # Note: TestClient does NOT run BackgroundTasks implicitly! 
    # The job will remain PENDING because the background task doesn't execute in TestClient context.
    # To test actual execution, we can manually call the engine function.
    print("\n2️⃣  Executing Training Engine Manually (Simulating Background Task)...")
    from app.services.ml_training_engine import train_model_task
    db_session = SessionLocal()
    train_model_task(job_id, db_session)
    db_session.close()
    
    # 3. Check status again
    print("\n3️⃣  Checking final status...")
    response = client.get(f"/api/v1/model-training/jobs/{job_id}")
    job_data = response.json()
    
    print(f"Final Status: {job_data['status']}")
    print(f"Final Progress: {job_data['progress']}%")
    
    if job_data["logs"]:
        print("Latest Logs:")
        for log in job_data["logs"][-5:]:
            print(f"   {log}")
            
    if job_data['status'] == "COMPLETED":
        print("✅ Training successfully completed!")
    else:
        print(f"❌ Training failed: {job_data.get('error_message')}")
        sys.exit(1)
        
    # 4. Verify ML Registry Integration
    print("\n4️⃣  Verifying ML Registry...")
    response = client.get("/api/v1/ml-models/")
    models_list = response.json()
    
    found = any(m.get("model_type") == "Random Forest" and m.get("name") == "BTC-USD Random Forest Auto" for m in models_list)
    if found:
        print("✅ Model successfully registered in CustomMLModels!")
    else:
        print("❌ Model not found in ML Registry.")
        sys.exit(1)
        
    print("\n🎉 All Verification Passed Successfully!")

if __name__ == "__main__":
    test_ml_training()
