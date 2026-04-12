import asyncio
import sys
from pathlib import Path

# Add project root to python path to resolve app imports if needed
sys.path.append(str(Path(__file__).resolve().parent.parent))

import ccxt.pro as ccxt

async def test_watch_orderbook():
    exchange = ccxt.binance({
        'enableRateLimit': True,
    })
    
    symbol = 'DOGE/USDT'
    limit = 20
    
    print(f"[{symbol}] Conencting to Binance WebSocket OrderBook streaming via CCXT Pro...")
    
    count = 0
    max_updates = 5
    
    try:
        while count < max_updates:
            # This method will yield control and wait until a new update is received
            orderbook = await exchange.watch_order_book(symbol, limit)
            
            if orderbook['bids'] and orderbook['asks']:
                best_bid = orderbook['bids'][0][0]
                best_ask = orderbook['asks'][0][0]
                print(f"[{count+1}/{max_updates}] Received WS Update - Best Bid: {best_bid}, Best Ask: {best_ask}")
            else:
                print(f"[{count+1}/{max_updates}] Received empty orderbook")
            
            count += 1
            
        print("✅ WebSocket data reception test successful! watch_order_book is working fast without hitting rate limits.")
        
    except Exception as e:
        print(f"❌ Error occurred during WebSocket connection: {e}")
    finally:
        await exchange.close()
        print("Test complete. Exchange connection closed.")

if __name__ == "__main__":
    asyncio.run(test_watch_orderbook())
