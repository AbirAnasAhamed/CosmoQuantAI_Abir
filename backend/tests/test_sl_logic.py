import sys
import os

sys.path.append('E:\\CosmoQuantAI\\backend')

# Dummy Bot Record
class MockRecord:
    def __init__(self, config):
        self.id = 99
        self.market = "BTC/USDT"
        self.exchange = "binance"
        self.is_paper_trading = True
        self.config = config

import asyncio

async def run_test():
    from app.strategies.wall_hunter_bot import WallHunterBot
    from app.strategies.wall_hunter_futures import WallHunterFuturesStrategy
    import json
    
    # --- TEST 1: Spot Initialization ---
    init_config_spot = {"sl_order_type": "soft_limit", "symbol": "BTC/USDT", "exchange": "binance"}
    spot_bot = WallHunterBot("spot_test", init_config_spot, None, "test_owner")
    
    assert spot_bot.sl_order_type == "soft_limit", f"Spot init Failed: {spot_bot.sl_order_type}"
    
    # --- TEST 2: Spot Live Update ---
    # mock telegram
    spot_bot._send_telegram = lambda x: asyncio.sleep(0)
    spot_bot.update_config({"sl_order_type": "limit"})
    assert spot_bot.sl_order_type == "limit", f"Spot update Failed: {spot_bot.sl_order_type}"
    print("Spot Bot Parsing OK")
    
    # --- TEST 3: Futures Initialization ---
    init_config_futures = {"sl_order_type": "stop_limit"}
    mock_record = MockRecord(init_config_futures)
    mock_record.owner_id = "test_owner"
    futures_bot = WallHunterFuturesStrategy(mock_record, None)
    
    assert futures_bot.sl_order_type == "stop_limit", f"Futures init Failed: {futures_bot.sl_order_type}"
    
    # --- TEST 4: Futures Live Update ---
    futures_bot._send_telegram = lambda x: asyncio.sleep(0)
    futures_bot.update_config({"sl_order_type": "soft_limit"})
    assert futures_bot.sl_order_type == "soft_limit", f"Futures update Failed: {futures_bot.sl_order_type}"
    print("Futures Bot Parsing OK")
    
    print("ALL TESTS PASSED: sl_order_type binds cleanly in __init__ and update_config()")

if __name__ == "__main__":
    asyncio.run(run_test())
