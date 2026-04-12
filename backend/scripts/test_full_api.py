import requests

API_KEY = "jzMN8CJoLdpxoYoqz7PkynX7sVDxSOAW"
CIK = "0001067983"
SYM = "AAPL"

def check(name, url):
    print(f"\n--- {name} ---")
    print(f"URL: {url.replace(API_KEY, 'HIDDEN')}")
    try:
        resp = requests.get(url, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            print("SUCCESS")
            print(str(resp.json())[:50])
        else:
            print(f"FAIL: {resp.text[:100]}")
    except Exception as e:
        print(f"Error: {e}")

# 1. Quote on Stable (Known working)
check("Quote Stable", f"https://financialmodelingprep.com/stable/quote?symbol={SYM}&apikey={API_KEY}")

# 2. Quote on v3 (Path param) - Did this fail before?
check("Quote v3 Path", f"https://financialmodelingprep.com/api/v3/quote/{SYM}?apikey={API_KEY}")

# 3. 13F on v3 (Standard)
check("13F v3", f"https://financialmodelingprep.com/api/v3/form-13f/{CIK}?apikey={API_KEY}")

# 4. 13F on Stable (Path param)
check("13F Stable Path", f"https://financialmodelingprep.com/stable/form-13f/{CIK}?apikey={API_KEY}")

# 5. 13F on Stable (Query param)
check("13F Stable Query", f"https://financialmodelingprep.com/stable/form-13f?cik={CIK}&apikey={API_KEY}")
