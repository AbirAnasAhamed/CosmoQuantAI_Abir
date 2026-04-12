import requests

API_KEY = "jzMN8CJoLdpxoYoqz7PkynX7sVDxSOAW"
CIK = "0001067983"
SYM = "AAPL"

def check(name, url):
    try:
        resp = requests.get(url, timeout=10)
        print(f"{name}: {resp.status_code}")
    except Exception as e:
        print(f"{name}: ERROR {e}")

# 1. Quote Stable
check("Quote Stable", f"https://financialmodelingprep.com/stable/quote?symbol={SYM}&apikey={API_KEY}")

# 2. Quote v3
check("Quote v3", f"https://financialmodelingprep.com/api/v3/quote/{SYM}?apikey={API_KEY}")

# 3. 13F v3
check("13F v3", f"https://financialmodelingprep.com/api/v3/form-13f/{CIK}?apikey={API_KEY}")

# 4. 13F Stable Path
check("13F Stable Path", f"https://financialmodelingprep.com/stable/form-13f/{CIK}?apikey={API_KEY}")

# 5. 13F Stable Query
check("13F Stable Query", f"https://financialmodelingprep.com/stable/form-13f?cik={CIK}&apikey={API_KEY}")
