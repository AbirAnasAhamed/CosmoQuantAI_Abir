import asyncio
import logging
import json
from app.services.advanced_orderbook_service import orderbook_service

logging.basicConfig(level=logging.INFO)

async def run_test():
    symbol = "BTC/USDT"
    print(f"Starting test for {symbol}...")
    await orderbook_service.start(symbol)
    
    # Wait for data to populate
    for _ in range(5):
        await asyncio.sleep(2)
        print("\n--- Current State ---")
        print(json.dumps(orderbook_service.state, indent=2))
        
    print("Test finished. Stopping service...")
    await orderbook_service.stop()

if __name__ == "__main__":
    asyncio.run(run_test())
