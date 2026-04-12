import urllib.request
try:
    url = "https://api-futures.kucoin.com/api/v1/contracts/active"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    response = urllib.request.urlopen(req, timeout=10)
    print("Success:", response.status)
except Exception as e:
    print("Error:", e)
