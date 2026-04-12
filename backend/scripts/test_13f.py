import requests

API_KEY = "jzMN8CJoLdpxoYoqz7PkynX7sVDxSOAW"
BASE_URL = "https://financialmodelingprep.com/stable"
CIK = "0001067983" # Buffett

def check(url):
    print(f"Checking: {url.replace(API_KEY, 'HIDDEN')}")
    try:
        resp = requests.get(url, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            print("SUCCESS")
            print(str(resp.json())[:100])
        else:
            print(f"FAIL: {resp.text}")
    except Exception as e:
        print(f"Error: {e}")

# Try Path Param (Standard v3 way)
check(f"{BASE_URL}/form-13f/{CIK}?apikey={API_KEY}")

# Try Query Param (Stable docs way for search/quote)
check(f"{BASE_URL}/form-13f?cik={CIK}&apikey={API_KEY}")

# Try Query Param using symbol if CIK fails?
check(f"{BASE_URL}/form-13f?symbol=BRK.B&apikey={API_KEY}")
