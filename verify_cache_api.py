import time
import urllib.request
import urllib.error
import sys
import json

BASE_URL = "http://localhost:8000/api/v1/sentiment/correlation"
SYMBOL = "BTC/USDT"

def verify_cache():
    print(f"Testing Cache on {BASE_URL} for {SYMBOL}...")
    url = f"{BASE_URL}?symbol={SYMBOL}&period=7d"
    
    # Wait loop for server availability
    for i in range(10):
        try:
            urllib.request.urlopen(url)
            break
        except urllib.error.URLError:
            print(f"Waiting for server... {i+1}/10")
            time.sleep(2)
    
    # Warup / First Call
    print("1. sending first request (should be slow/live)...")
    start_time = time.time()
    try:
        with urllib.request.urlopen(url) as response:
            if response.status != 200:
                print(f"Error: {response.status}")
                return False
            _ = response.read()
    except Exception as e:
        print(f"Request failed: {e}")
        return False
        
    duration_1 = time.time() - start_time
    print(f"First Call Duration: {duration_1:.4f} seconds")
    
    # Second Call
    print("2. sending second request (should be fast/cached)...")
    start_time = time.time()
    try:
        with urllib.request.urlopen(url) as response:
             if response.status != 200:
                print(f"Error: {response.status}")
                return False
             _ = response.read()
    except Exception as e:
        print(f"Request failed: {e}")
        return False
        
    duration_2 = time.time() - start_time
    print(f"Second Call Duration: {duration_2:.4f} seconds")
    
    # Validation
    # We accept < 0.3s for cached since windows networking can be flaky
    if duration_2 < duration_1 and duration_2 < 0.3: 
        print("\n✅ CACHE VERIFIED! Response time improved significantly.")
        print(f"Improvement: {duration_1 / duration_2:.1f}x faster")
        return True
    else:
        print("\n❌ CACHE VERIFICATION FAILED (Or first call was already fast).")
        print(f"First: {duration_1}, Second: {duration_2}")
        return False

if __name__ == "__main__":
    if verify_cache():
        sys.exit(0)
    else:
        sys.exit(1)
