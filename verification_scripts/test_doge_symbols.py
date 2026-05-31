import asyncio
import sys
import os

# Add the backend directory to sys.path
sys.path.append(r'e:\CosmoQuantAI\backend')

from app.services.market_depth_service import MarketDepthService

async def test_doge_symbols():
    service = MarketDepthService()
    try:
        print("Checking DOGE symbols for Kucoin...")
        # Since I cleared Redis and then it was fetched by the app, I can just fetch again
        markets = await service.get_exchange_markets('kucoin')
        
        doge_symbols = [m for m in markets if 'DOGE' in m]
        print(f"Found {len(doge_symbols)} DOGE symbols:")
        for s in doge_symbols:
            print(f" - {s}")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await service.close_all_exchanges()

if __name__ == "__main__":
    asyncio.run(test_doge_symbols())
