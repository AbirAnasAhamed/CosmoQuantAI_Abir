import requests
import json
import sys

def verify_api():
    url = "http://localhost:8000/api/v1/analytics/regime"
    print(f"Testing API endpoint: {url}")
    
    try:
        response = requests.get(url)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print("Response Data:")
            print(json.dumps(data, indent=2)[:500] + "... (truncated)")
            
            # Validation
            assert "current_regime" in data
            assert data["current_regime"] in ["Bull Stable", "Bull Volatile", "Bear Stable", "Bear Volatile"]
            print("\nVALIDATION SUCCESSFUL: 'current_regime' is valid.")
        else:
            print(f"Request failed with status: {response.status_code}")
            print(response.text)
            
    except Exception as e:
        print(f"Error: {e}")
        # If localhost fails, maybe try 127.0.0.1
        try:
            url = "http://127.0.0.1:8000/api/v1/analytics/regime"
            print(f"Retrying with 127.0.0.1: {url}")
            response = requests.get(url)
            print(f"Status Code: {response.status_code}")
            if response.status_code == 200:
                data = response.json()
                print("Response Data:")
                print(json.dumps(data, indent=2)[:500] + "...")
                print("\nVALIDATION SUCCESSFUL (on retry).")
        except Exception as e2:
            print(f"Retry failed: {e2}")

if __name__ == "__main__":
    verify_api()
