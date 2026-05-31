
import asyncio
import logging
import sys
import os

# Ensure we can import from app
sys.path.append(os.getcwd())

from app.services.news_scraper import NewsScraper
from app.core.config import settings

# Setup logging to see what's happening
logging.basicConfig(level=logging.INFO)

async def verify():
    print(f"Checking API Key in settings: {settings.CRYPTOPANIC_API_KEY and 'Found' or 'Missing'}")
    
    scraper = NewsScraper()
    print("Fetching from CryptoPanic API...")
    news = scraper.fetch_cryptopanic_api()
    
    print(f"Fetched {len(news)} items.")
    for n in news[:5]:
        print(f"[{n['source']}] {n['title']} ({n['published_at']})")

if __name__ == "__main__":
    asyncio.run(verify())
