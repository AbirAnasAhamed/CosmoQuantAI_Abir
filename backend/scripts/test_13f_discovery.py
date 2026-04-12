import requests

API_KEY = "jzMN8CJoLdpxoYoqz7PkynX7sVDxSOAW"
BASE_URL = "https://financialmodelingprep.com/stable"
CIK = "0001067983"

def check(path, params={}):
    params['apikey'] = API_KEY
    url = f"{BASE_URL}{path}"
    print(f"Testing: {url}")
    try:
        resp = requests.get(url, params=params, timeout=5)
        print(f"  -> {resp.status_code}")
    except:
        print("  -> ERR")

candidates = [
    f"/13f?cik={CIK}",
    f"/13f/{CIK}",
    f"/form-13f?cik={CIK}", # Tried (404)
    f"/form-13f/{CIK}",     # Tried (404)
    f"/institutional-holdings?cik={CIK}",
    f"/institutional-stock-ownership?cik={CIK}",
    f"/institutional-holder?symbol=AAPL",
    f"/mutual-fund-holdings?cik={CIK}",
    f"/etf-holdings?cik={CIK}",
    f"/stock/13f?cik={CIK}",
]

for c in candidates:
    if '?' in c:
        path, query = c.split('?')
        # rudimentary parsing
        check(path, {"cik": CIK} if "cik" in query else {"symbol": "AAPL"})
    else:
        check(c)
