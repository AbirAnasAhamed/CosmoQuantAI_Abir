
import requests

API_KEY = "fe7086d832e2bd3aba5b31d29627f0a4f8f1e53d"
URL = f"https://cryptopanic.com/api/v1/posts/?auth_token={API_KEY}&public=true"

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0'
}

print(f"Fetching {URL} with UA...")
try:
    response = requests.get(URL, headers=headers, timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Content-Type: {response.headers.get('Content-Type')}")
    if response.status_code == 200:
        print("Success!")
        data = response.json()
        print(f"First result: {data['results'][0]['title'] if 'results' in data and data['results'] else 'No results'}")
    else:
        print(f"Content: {response.text[:500]}")
except Exception as e:
    print(f"Error: {e}")
