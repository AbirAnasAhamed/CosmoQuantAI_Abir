import asyncio
import sys
import os

# Add the backend directory to sys.path
sys.path.append(r'e:\CosmoQuantAI\backend')

from app.services.market_depth_service import MarketDepthService

async def test_markets():
    service = MarketDepthService()
    try:
        # 1. Test Spot
        print("Fetching Kucoin Spot markets...")
        spot_exchange = service.get_exchange_instance('kucoin')
        await spot_exchange.load_markets()
        print(f"Spot Success! Found {len(spot_exchange.markets)} markets.")
        
        # 2. Test Futures
        print("Fetching Kucoin Futures markets...")
        futures_exchange = service.get_exchange_instance('kucoin', symbol='BTC/USDT:USDT')
        await futures_exchange.load_markets()
        print(f"Futures Success! Found {len(futures_exchange.markets)} markets.")
        
    except Exception as e:
        print(f"Error during test: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await service.close_all_exchanges()

if __name__ == "__main__":
    asyncio.run(test_markets())
