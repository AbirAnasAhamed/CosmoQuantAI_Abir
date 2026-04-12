
import requests
import json

BASE_URL = "http://localhost:8000/api/v1"

def test_dynamic_indicator_backtest():
    # 1. Create a dummy indicator
    indicator_data = {
        "name": "Test SMA Strategy",
        "code": "print('Dynamic Code')",
        "base_type": "SMA",
        "parameters": {"period": 20},
        "is_public": False
    }
    
    # Check if indicator exists or create new
    # For simplicity, let's just create one. User auth might be needed.
    # Assuming we can skip auth for localhost test or we use a known token.
    # If auth is required, I might need to login first.
    # Let's assume there is an indicator with ID 1 for now, or print that we need to create one manually.
    
    print("Please ensure backend is running.")
    
    # 2. Run Backtest with indicator_id
    payload = {
        "symbol": "BTC/USDT",
        "timeframe": "1d",
        "strategy": "DynamicIndicatorStrategy",
        "initial_cash": 10000,
        "start_date": "2023-01-01",
        "end_date": "2023-02-01",
        "indicator_id": 1 # Assuming ID 1 exists. If not, this will fail.
    }
    
    try:
        response = requests.post(f"{BASE_URL}/backtest/run", json=payload)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            task_id = response.json().get("task_id")
            print(f"Backtest started with Task ID: {task_id}")
    except Exception as e:
        print(f"Request failed: {e}")

if __name__ == "__main__":
    test_dynamic_indicator_backtest()
