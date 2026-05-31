import requests
import sys

def test_api():
    url = "http://localhost:8000/api/v1/analytics/correlation/rolling"
    params = {
        "symbol_a": "BTC/USDT",
        "symbol_b": "ETH/USDT",
        "timeframe": "1h",
        "window": 30
    }
    
    print(f"Testing {url} with params {params}...")
    try:
        response = requests.get(url, params=params)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Response (first 3 items): {data[:3]}")
            print(f"Total items: {len(data)}")
            
            # Simple validation
            if len(data) > 0 and 'time' in data[0] and 'value' in data[0]:
                print("Validation Passed: Data format is correct.")
            else:
                print("Validation Failed: Incorrect data format.")
        else:
            print(f"Error Response: {response.text}")
            
    except Exception as e:
        print(f"Request failed: {e}")
        print("Ensure the backend server is running at http://localhost:8000")

if __name__ == "__main__":
    test_api()
