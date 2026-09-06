import asyncio
import logging
import json
import sys
import os

# Add the backend directory to python path for imports
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from app.services.advanced_orderbook_service import orderbook_service

logging.basicConfig(level=logging.INFO)

async def test_doge():
    symbol = "DOGE/USDT:USDT"
    print(f"Starting test for {symbol}...")
    await orderbook_service.start(symbol)
    
    for _ in range(5):
        await asyncio.sleep(2)
        print("\n--- Current State ---")
        print(json.dumps(orderbook_service.state, indent=2))
        
    await orderbook_service.stop()

if __name__ == "__main__":
    asyncio.run(test_doge())
