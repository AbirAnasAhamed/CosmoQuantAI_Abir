import requests
import os

# Key provided by user in the prompt
API_KEY = "jzMN8CJoLdpxoYoqz7PkynX7sVDxSOAW"
BASE_URL = "https://financialmodelingprep.com/stable"

def test_endpoint(name, endpoint, params={}):
    params['apikey'] = API_KEY
    url = f"{BASE_URL}{endpoint}"
    print(f"\n--- Testing {name} ---")
    print(f"URL: {url}")
    print(f"Params: {params}")
    
    try:
        resp = requests.get(url, params=params, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            print(f"Success! Data type: {type(data)}")
            if isinstance(data, list) and len(data) > 0:
                print(f"Sample: {data[0]}")
            elif isinstance(data, dict):
                print(f"Keys: {list(data.keys())}")
            else:
                print(f"Data: {data}")
        else:
            print(f"Error: {resp.text}")
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    # Test 1: Quote (as per docs)
    test_endpoint("Quote (Stable)", "/quote", {"symbol": "AAPL"})
    
    # Test 2: 13F (Unknown path in stable, trying common patterns)
    # The v3 path was /form-13f/{cik}
    # Let's try /form-13f?cik=... or ?symbol=... or just the v3 path on stable base
    
    # Attempt A: Path param on stable (Old way but on stable)
    test_endpoint("13F (Path Param)", "/form-13f/0001067983", {}) # Buffett CIK
    
    # Attempt B: Query param
    test_endpoint("13F (Query Param)", "/form-13f", {"cik": "0001067983"})
    
    # Attempt C: Search (Known working in docs)
    test_endpoint("Search", "/search-name", {"query": "apple"})
