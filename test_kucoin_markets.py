import asyncio
import sys
import os

# Add the backend directory to sys.path
sys.path.append(r'e:\CosmoQuantAI\backend')

from app.services.market_depth_service import MarketDepthService

async def test_markets():
    service = MarketDepthService()
    try:
        print("Fetching Kucoin markets...")
        markets = await service.get_exchange_markets('kucoin')
        print(f"Success! Found {len(markets)} markets.")
        
        # Check for futures
        futures = [m for m in markets if ':' in m]
        print(f"Futures markets found: {len(futures)}")
        if futures:
            print(f"Sample futures: {futures[:5]}")
            
        doge_futures = [m for m in markets if 'DOGE' in m and ':' in m]
        print(f"DOGE futures found: {doge_futures}")
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await service.close_all_exchanges()

if __name__ == "__main__":
    asyncio.run(test_markets())
