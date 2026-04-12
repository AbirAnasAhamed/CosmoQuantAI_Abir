
import feedparser
import requests
import asyncio
from app.services.news_scraper import NewsScraper

async def run_fetch():
    scraper = NewsScraper()
    url = scraper.CRYPTOPANIC_RSS
    print(f"Fetching {url}...")
    
    # Attempt 1: Using feedparser directly (as in current code)
    print("\n--- Attempt 1: feedparser.parse(url) ---")
    try:
        feed = feedparser.parse(url)
        if feed.bozo:
            print(f"FAILED (bozo): {feed.bozo_exception}")
            # print(f"Raw feed content snippet (if any): {feed.feed.get('summary', 'N/A')}")
        else:
            print(f"SUCCESS: Found {len(feed.entries)} entries.")
    except Exception as e:
        print(f"EXCEPTION: {e}")

    # Attempt 2: Using requests without headers
    print("\n--- Attempt 2: requests.get(url) ---")
    try:
        resp = requests.get(url, timeout=10)
        print(f"Status Code: {resp.status_code}")
        print(f"Content Type: {resp.headers.get('Content-Type')}")
        print(f"Content snippet: {resp.text[:200]}")
    except Exception as e:
        print(f"EXCEPTION: {e}")

    print("\n--- Attempt 3b: requests.get(url, headers=enhancedHeaders) ---")
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
        'Cache-Control': 'max-age=0',
    }
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        print(f"Status Code: {resp.status_code}")
        if resp.status_code == 200:
            content = resp.text
            # Check if it looks like XML
            if content.strip().startswith('<?xml') or '<rss' in content:
                print("SUCCESS: Content looks like XML RSS.")
                feed = feedparser.parse(resp.content)
                print(f"Parsed {len(feed.entries)} entries.")
            else:
                 print("STILL HTML/BLOCKED.")
    except Exception as e:
        print(f"EXCEPTION: {e}")

    # Attempt 4: Using the fixed NewsScraper.fetch_rss_feed
    print("\n--- Attempt 4: NewsScraper.fetch_rss_feed (The Fix) ---")
    try:
        # We need to test the actual method.
        # Since fetch_rss_feed is an instance method, we use the scraper instance.
        print(f"Calling scraper.fetch_rss_feed('{url}', 'CryptoPanic')...")
        items = scraper.fetch_rss_feed(url, "CryptoPanic")
        print(f"Returned {len(items)} items.")
        if len(items) == 0:
             print("SUCCESS: Handled gracefully (returned empty list). Check logs for specific warning.")
        else:
             print(f"SURPRISE: Fetched {len(items)} items despite Cloudflare!")
    except Exception as e:
        print(f"FAILED: Method raised exception: {e}")

if __name__ == "__main__":
    asyncio.run(run_fetch())
