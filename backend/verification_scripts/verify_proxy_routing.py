import asyncio
import logging
from app.strategies.wall_hunter_bot import WallHunterBot

logging.basicConfig(level=logging.INFO)

async def test_proxy_routing():
    print("\n--- Initializing WallHunterBot with Proxy Routing (Paper Trading) ---")
    
    # Configure the bot to trade DOGE/FDUSD but watch DOGE/USDT
    mock_config = {
        "symbol": "DOGE/FDUSD",
        "exchange": "binance",
        "is_paper_trading": True,
        "vol_threshold": 100000000, # Large threshold to avoid instant firing during test
        "min_wall_lifetime": 0,
        "enable_proxy_wall": True,
        "proxy_exchange": "binance",
        "proxy_symbol": "DOGE/USDT",
        "buy_order_type": "limit",
        "limit_buffer": 0.05,
        "trading_mode": "spot"
    }

    bot = WallHunterBot(bot_id=999, config=mock_config)
    
    # Fake public exchange object for the test
    class MockExchange:
        def __init__(self):
            self.id = "binance"
            
        async def watch_order_book(self, symbol, limit=20):
            print(f">>> [MockExchange] watch_order_book called for symbol: {symbol}")
            await asyncio.sleep(1) # Simulate delay
            # Mock a massive spoofed wall on USDT to trigger wall logic
            return {
                'bids': [[0.2500, 150000000]], # Massive bid wall
                'asks': [[0.2505, 5000]]
            }
            
        async def fetch_order_book(self, symbol, limit=5):
            print(f">>> [MockExchange] fetch_order_book called for symbol: {symbol} (Native Execution Lookup!)")
            return {
                'bids': [[0.2498, 1000]], # Native pair might lag slightly behind
                'asks': [[0.2501, 1000]]
            }
            
        async def fetch_ticker(self, symbol):
            pass

    # Assign the mock exchange
    bot.public_exchange = MockExchange()
    # In this test, assuming self.proxy_exchange == self.exchange, proxy falls back to public
    bot.proxy_public_exchange = bot.public_exchange
    class MockEngine:
        def __init__(self):
            self.exchange = MockExchange()
        async def execute_trade(self, side, amount, price, order_type="market", params=None):
            print(f"\n=> 🚀 TRADE EXECUTED!\n   Side: {side.upper()}\n   Amount: {amount}\n   Price: {price} (NATIVE PRICE!)\n   OrderType: {order_type}\n")
            return {"id": "MOCK-12345", "average": price, "price": price}
            
        async def cancel_order(self, *args, **kwargs):
            return True

    bot.engine = MockEngine()
    bot.running = True
    
    # Let's bypass other tasks to isolate
    import types
    # Mock methods to prevent failures
    bot._publish_status = types.MethodType(lambda self, p: None, bot)
    bot.manage_risk = types.MethodType(lambda *args: asyncio.sleep(0.1), bot)
    bot._send_telegram = types.MethodType(lambda *args: asyncio.sleep(0.1), bot)
    
    # Run the native price loop for 2 seconds in background
    native_task = asyncio.create_task(bot._native_price_loop())
    
    # Run the hunter loop
    hunter_task = asyncio.create_task(bot._run_loop())
    
    # Let it run for 4 seconds then terminate
    await asyncio.sleep(4)
    bot.running = False
    
    print("\n--- Test Complete ---")

if __name__ == "__main__":
    asyncio.run(test_proxy_routing())
