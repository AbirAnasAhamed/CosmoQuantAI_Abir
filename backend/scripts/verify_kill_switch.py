import requests
import redis
import sys
import os

# Adjust path if needed or use env vars
REDIS_URL = "redis://localhost:6379/0"
API_URL = "http://localhost:8000/api/v1/system/kill-switch"

def verify_kill_switch():
    print("🧪 Starting Kill Switch Verification...")
    
    # 1. Check Initial State via Redis
    try:
        r = redis.from_url(REDIS_URL, decode_responses=True)
        initial_state = r.get("global_kill_switch")
        print(f"🔹 Initial Redis State: {initial_state}")
    except Exception as e:
        print(f"❌ Redis Connection Error: {e}")
        return

    # 2. Activate Kill Switch via API
    print("\n👉 Activating Kill Switch via API...")
    try:
        res = requests.post(API_URL, json={"active": True})
        if res.status_code == 200 and res.json()['active'] == True:
            print("✅ API Response: Active = True")
        else:
            print(f"❌ API Error: {res.text}")
            return
    except Exception as e:
        print(f"❌ API Connection Error: {e}")
        return

    # 3. Verify in Redis
    current_state = r.get("global_kill_switch")
    print(f"🔹 Redis State after activation: {current_state}")
    
    if current_state == "true":
        print("✅ SUCCESS: Redis key updated to 'true'.")
    else:
        print("❌ FAILURE: Redis key did not update!")
        return

    # 4. Deactivate Kill Switch via API
    print("\n👉 Deactivating Kill Switch via API...")
    requests.post(API_URL, json={"active": False})
    
    final_state = r.get("global_kill_switch")
    print(f"🔹 Final Redis State: {final_state}")
    
    if final_state == "false":
        print("✅ SUCCESS: Redis key reset to 'false'.")
    else:
        print("❌ FAILURE: Redis key did not reset!")

    print("\n🎉 Verification Complete! Backend & Redis are synced.")

if __name__ == "__main__":
    verify_kill_switch()
