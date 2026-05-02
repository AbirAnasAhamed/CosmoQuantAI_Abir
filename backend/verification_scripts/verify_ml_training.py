import httpx
import time
import sys

BASE_URL = "http://localhost:8000/api/v1"
TEST_USER = {
    "email": "testuser_training@example.com",
    "password": "Password123!",
    "full_name": "Test User Training"
}

def get_token():
    # 1. Try to register
    with httpx.Client() as client:
        res = client.post(f"{BASE_URL}/users/", json=TEST_USER)
        # We ignore if already exists (400)
        
        # 2. Login
        login_data = {"username": TEST_USER["email"], "password": TEST_USER["password"]}
        res = client.post(f"{BASE_URL}/auth/login/access-token", data=login_data)
        if res.status_code != 200:
            print(f"Failed to login: {res.text}")
            sys.exit(1)
        return res.json()["access_token"]

def verify_training():
    print("--- 🚀 Starting ML Training Verification ---")
    token = get_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    with httpx.Client(headers=headers) as client:
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
        res = client.post(f"{BASE_URL}/model-training/train", json=payload)
        
        if res.status_code != 200:
            print(f"❌ Failed to start training: {res.text}")
            sys.exit(1)
            
        job = res.json()
        job_id = job["id"]
        print(f"✅ Training Job Started! Job ID: {job_id}")
        
        # 2. Poll Status
        print("\n2️⃣  Polling Training Status...")
        max_retries = 30 # 60 seconds
        for i in range(max_retries):
            res = client.get(f"{BASE_URL}/model-training/jobs/{job_id}")
            if res.status_code != 200:
                print(f"❌ Failed to get job status: {res.text}")
                sys.exit(1)
                
            status_data = res.json()
            status = status_data["status"]
            progress = status_data["progress"]
            logs = status_data.get("logs", [])
            latest_log = logs[-1] if logs else "No logs yet"
            
            print(f"   [{i+1}/{max_retries}] Status: {status} | Progress: {progress:.1f}% | Log: {latest_log}")
            
            if status in ["COMPLETED", "FAILED"]:
                print(f"\n✅ Training Finished with status: {status}")
                if status == "FAILED":
                    print(f"❌ Error: {status_data.get('error_message')}")
                    sys.exit(1)
                break
                
            time.sleep(2)
        else:
            print("❌ Training took too long. Polling timed out.")
            sys.exit(1)
            
        # 3. Verify ML Registry Integration
        print("\n3️⃣  Verifying ML Registry...")
        res = client.get(f"{BASE_URL}/ml-models")
        if res.status_code != 200:
            print(f"❌ Failed to get ML Registry: {res.text}")
            sys.exit(1)
            
        models = res.json()
        found = any(m.get("model_type") == "Random Forest" for m in models)
        if found:
            print("✅ Model successfully registered in CustomMLModels!")
        else:
            print("❌ Model not found in ML Registry.")
            sys.exit(1)
            
        print("\n🎉 All Verification Passed Successfully!")

if __name__ == "__main__":
    verify_training()
