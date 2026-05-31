import requests
import json

def test_matrix_api():
    url = "http://localhost:8000/api/v1/analytics/correlation-matrix"
    payload = {
        "symbols": ["BTC/USDT", "ETH/USDT"],
        "timeframe": "1h"
    }
    
    print(f"Testing {url} with payload {payload}...")
    try:
        response = requests.post(url, json=payload)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            if "cointegrated_pairs" in data:
                print(f"Success! 'cointegrated_pairs' found. Count: {len(data['cointegrated_pairs'])}")
                print(f"First pair: {data['cointegrated_pairs'][0] if data['cointegrated_pairs'] else 'None'}")
            else:
                print("FAILURE: 'cointegrated_pairs' MISSING in response.")
                print(f"Keys found: {list(data.keys())}")
        else:
            print(f"Error Response: {response.text}")
            
    except Exception as e:
        print(f"Request failed: {e}")

if __name__ == "__main__":
    test_matrix_api()
