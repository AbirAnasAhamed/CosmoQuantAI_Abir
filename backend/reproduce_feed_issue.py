
import feedparser
import requests

CRYPTOPANIC_RSS = "https://cryptopanic.com/news/rss/"

print(f"Fetching {CRYPTOPANIC_RSS} using feedparser...")
feed = feedparser.parse(CRYPTOPANIC_RSS)

if feed.bozo:
    print(f"Feedparser reported issue: {feed.bozo_exception}")
else:
    print("Feed parsed successfully!")

if hasattr(feed, 'status'):
    print(f"Status Code: {feed.status}")

if len(feed.entries) > 0:
    print(f"Found {len(feed.entries)} entries.")
    print(f"First entry title: {feed.entries[0].title}")
else:
    print("No entries found.")
    # Check if we got HTML instead of XML
    try:
        response = requests.get(CRYPTOPANIC_RSS)
        print(f"Raw response start: {response.text[:200]}")
    except Exception as e:
        print(f"Failed to fetch raw response: {e}")

print("\n--- Testing with Realistic Headers ---")
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://google.com',
    'Upgrade-Insecure-Requests': '1'
}
try:
    response = requests.get(CRYPTOPANIC_RSS, headers=headers)
    print(f"Response status with User-Agent: {response.status_code}")
    
    
    # Save content to file for inspection
    with open("crypto_feed_debug.xml", "wb") as f:
        f.write(response.content)
    print("Saved raw content to crypto_feed_debug.xml")

    # Parse the content directly
    feed_ua = feedparser.parse(response.content)
    if feed_ua.bozo:
        print(f"Feedparser (with UA) reported issue: {feed_ua.bozo_exception}")
    else:
        print("Feed parsed successfully with User-Agent!")
        if len(feed_ua.entries) > 0:
            print(f"Found {len(feed_ua.entries)} entries.")
            print(f"First entry title: {feed_ua.entries[0].title}")
except Exception as e:
    print(f"Failed to fetch with User-Agent: {e}")
