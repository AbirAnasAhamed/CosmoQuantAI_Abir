import asyncio
import sys
import os

# Add the backend directory to sys.path
sys.path.append(r'e:\CosmoQuantAI\backend')

from app.services.market_depth_service import MarketDepthService

async def test_markets():
    service = MarketDepthService()
    log_file = r'e:\CosmoQuantAI\market_test_log.txt'
    with open(log_file, 'w') as f:
        try:
            # 1. Test Spot
            f.write("Fetching Kucoin Spot markets...\n")
            spot_exchange = service.get_exchange_instance('kucoin')
            try:
                await spot_exchange.load_markets()
                f.write(f"Spot Success! Found {len(spot_exchange.markets)} markets.\n")
            except Exception as e:
                f.write(f"Spot Error: {e}\n")
            
            # 2. Test Futures
            f.write("\nFetching Kucoin Futures markets...\n")
            futures_exchange = service.get_exchange_instance('kucoin', symbol='BTC/USDT:USDT')
            try:
                await futures_exchange.load_markets()
                f.write(f"Futures Success! Found {len(futures_exchange.markets)} markets.\n")
            except Exception as e:
                f.write(f"Futures Error: {e}\n")
            
        except Exception as e:
            f.write(f"Critical Error: {e}\n")
        finally:
            await service.close_all_exchanges()
            f.write("\nDone.\n")

if __name__ == "__main__":
    asyncio.run(test_markets())
