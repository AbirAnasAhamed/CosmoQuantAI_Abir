
import asyncio
import sys
import os
import traceback

# Mocking app context to test service directly
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.services.market_depth_service import market_depth_service

async def verify_fix():
    # symbols = ['DOGE/USDT:USDT', 'DOGE/USDT']
    symbols = ['DOGE/USDT:USDT']
    
    for symbol in symbols:
        print(f"\n--- Testing symbol: {symbol} ---")
        try:
            result = await market_depth_service.fetch_raw_order_book(symbol, 'binance', limit=10)
            print("Success!")
            print(f"Bids count: {len(result['bids'])}")
        except Exception as e:
            print(f"Failed for {symbol}: {type(e).__name__}: {str(e)}")
            traceback.print_exc()

    await market_depth_service.close_all_exchanges()

if __name__ == "__main__":
    asyncio.run(verify_fix())
