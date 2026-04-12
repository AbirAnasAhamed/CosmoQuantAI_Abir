
import asyncio
import sys
import os

# Add the project root to the python path so imports work
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from backend.app.services.news_service import news_service

async def main():
    print("Testing NewsService.fetch_news() ...")
    try:
        news = await news_service.fetch_news()
        print(f"Fetched {len(news)} news items.")
        if len(news) > 0:
            print("First item title:", news[0].get('content'))
            print("First item sentiment:", news[0].get('sentiment'))
            if news[0].get('id').startswith('mock_'):
                 print("⚠️ STILL RETURNING MOCK DATA!")
            else:
                 print("✅ SUCCESS: Real news data fetched.")
        else:
            print("⚠️ FETCHED 0 ITEMS.")
    except Exception as e:
        print(f"❌ Error during fetch: {e}")

if __name__ == "__main__":
    asyncio.run(main())
