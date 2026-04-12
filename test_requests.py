import requests

url = "https://www.okx.com/api/v5/public/instruments?instType=SPOT"

# print("--- Test 1: No Headers ---")
# try:
#     response = requests.get(url, timeout=10)
#     print(f"Status Code: {response.status_code}")
#     print(f"Response: {response.text[:200]}")
# except Exception as e:
#     print(f"Error: {e}")

print("\n--- Test 2: User-Agent + Headers ---")
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.google.com/",
    # "x-simulated-trading": "1" # sometimes needed for demo, but this is public data
}
try:
    response = requests.get(url, headers=headers, timeout=10)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text[:200]}")
except Exception as e:
    print(f"Error: {e}")
