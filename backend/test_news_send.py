import asyncio
import sys
import os

# Ensure backend directory is in the python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.services.news_service import news_service

async def run():
    print("Testing news fetch and send...")
    count = await news_service.fetch_and_process_latest_news()
    print(f"Done. Processed {count} items.")

if __name__ == '__main__':
    asyncio.run(run())
