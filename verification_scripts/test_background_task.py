import asyncio
import os
import sys

# Add the backend directory to python path for imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), 'backend')))

from app.strategies.wall_hunter_bot import WallHunterBot

# Mock an exchange module that simulates a delayed order fill price
class MockExchange:
    def __init__(self):
        self.markets = {
            'DOGE/USDT': {
                'precision': {
                    'amount': 0.0001,
                    'price': 0.00001
                }
            }
        }

    def amount_to_precision(self, symbol, amount):
        return f"{amount:.4f}"
        
    async def fetch_order(self, order_id, symbol):
        print(f"MockExchange: fetch_order called for {order_id}...")
        # Simulate that when we fetch the order, it returns the real average price
        return {
            'id': order_id,
            'average': 0.1505, # Real execution price is slightly higher than 0.1500 (slippage)
            'price': 0.1505,
            'status': 'closed'
        }
        
    async def close(self): ...

class MockEngine:
    def __init__(self):
        self.exchange = MockExchange()
        self.trades = []
        self.cancelled_orders = []

    async def execute_trade(self, side, amount, price, order_type="market"):
        self.trades.append({"side": side, "amount": amount, "price": price, "type": order_type})
        print(f"MockEngine: execute_trade {side} {amount} at {price} ({order_type})")
        # In this mock, the market order does NOT return an average price immediately
        # forcing the background task logic to kick in.
        return {"id": "mock_123", "average": None, "price": None}
        
    async def cancel_order(self, order_id):
        print(f"MockEngine: cancel_order {order_id}")
        self.cancelled_orders.append(order_id)

async def test_background_task():
    print("Initializing Wall Hunter Bot with mocked exchange engine...")
    config = {
        "symbol": "DOGE/USDT",
        "exchange": "binance",
        "is_paper_trading": False, # must be false to trigger fetch order
        "amount_per_trade": 10.0,
        "partial_tp_pct": 50.0,
        "sell_order_type": "limit",
        "target_spread": 0.0004
    }
    
    bot = WallHunterBot(bot_id=999, config=config)
    bot.engine = MockEngine()
    
    # We simulate a snipe execution at exact mid-price of 0.1500
    print("Calling execute_snipe (Expected to NOT block and return instantly)")
    
    import time
    start_time = time.time()
    await bot.execute_snipe(0.1500, "buy", 0.1500)
    end_time = time.time()
    
    elapsed = end_time - start_time
    print(f"Elapsed time for execute_snipe: {elapsed:.4f} seconds")
    
    if elapsed < 0.1:
        print("✅ SUCCESS: Blocking sleep was successfully removed from execute_snipe!")
    else:
        print("❌ FAILED: execute_snipe took too long, sleep might still be there.")
        
    print("\nCurrent bot active_pos (Provisional limits set based on mid_price 0.1500):")
    for k, v in bot.active_pos.items():
        print(f"  {k}: {v}")
        
    assert bot.active_pos['entry'] == 0.1500, "Provisional entry is not 0.1500!"
    
    print("\nWaiting 1 second to allow background task to fetch and replace order...")
    await asyncio.sleep(1.0)
    
    print("\nCurrent bot active_pos after background task (Expected entry 0.1505):")
    if bot.active_pos:
        for k, v in bot.active_pos.items():
            print(f"  {k}: {v}")
            
        if bot.active_pos['entry'] == 0.1505:
            print("✅ SUCCESS: Background task fetched and updated entry price correctly!")
        else:
            print("❌ FAILED: Background task did not update the entry price.")
    else:
         print("❌ FAILED: Active pos is None!")
         

if __name__ == "__main__":
    # We configure simple logging so we can see the internal log messages
    import logging
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    asyncio.run(test_background_task())
