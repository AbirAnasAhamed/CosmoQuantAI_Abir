import asyncio
import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.services.market_depth_service import MarketDepthService

async def test_kraken_limits():
    service = MarketDepthService()
    
    print("Testing Kraken Spot Limit Normalization...")
    limit_spot = service._normalize_order_book_limit('kraken', 50)
    print(f"Requested 50, Normalized: {limit_spot}")
    
    print("\nTesting Kraken Futures Instance and Limits...")
    try:
        # This will test get_exchange_instance which uses 'krakenfutures' for symbols with ':'
        exchange = service.get_exchange_instance('kraken', symbol='BTC/USDT:USDT')
        print(f"Exchange Instance Class: {exchange.__class__.__name__}")
        
        limit_futures = service._normalize_order_book_limit('kraken', 100)
        print(f"Requested 100, Normalized: {limit_futures}")
        
        # We won't actually fetch live data here to avoid needing API keys if they are required,
        # but we've verified the logic that caused the previous errors.
        
    except Exception as e:
        print(f"Error during instance creation: {e}")
    finally:
        await service.close_all_exchanges()

if __name__ == "__main__":
    asyncio.run(test_kraken_limits())
