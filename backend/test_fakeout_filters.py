import asyncio
import logging
import sys

# Configure mock logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

class MockTracker:
    def __init__(self):
        self.last_candle_time = 1000
        self.mock_signal = True
        self.signal_vanish_after = float('inf')  # Time when signal vanishes
        self.current_time = 0
        self.sl_line = 60000.0
        self.check_interval = 0.1

    def is_entry_signal(self, side, closed_candle_only=False):
        if self.current_time >= self.signal_vanish_after:
            return False
        return self.mock_signal
        
    def get_dynamic_trailing_sl(self, side):
        return self.sl_line

class MockBot:
    def __init__(self):
        self.bot_id = "test_bot"
        self.symbol = "BTC/USDT"
        self.running = True
        self.strategy_mode = 'long'
        self.enable_wall_trigger = False
        self.enable_liq_trigger = False
        self.enable_ut_entry_trigger = True
        
        # New Fakeout Settings
        self.ut_bot_candle_close = False
        self.ut_bot_validation_secs = 0
        self.ut_bot_retest_snipe = False
        
        self.ut_bot_tracker = MockTracker()
        self.logger = logger
        
        self.executed = False
        self.executed_order_type = None
        self.executed_limit_price = None

    async def execute_snipe(self, wall_price, side, current_mid_price, best_bid, best_ask, override_order_type=None, override_limit_price=None):
        self.executed = True
        self.executed_order_type = override_order_type
        self.executed_limit_price = override_limit_price
        logger.info(f"Snipe Executed! Type: {override_order_type}, Limit: {override_limit_price}")

class MockListener:
    def __init__(self, bot):
        from app.strategies.helpers.ut_standalone_listener import UTStandaloneListener
        self.listener = UTStandaloneListener(bot)
        
        # Override fetch to not hit exchange
        async def mock_fetch():
            return 61000.0, 60999.0, 61001.0
        self.listener._fetch_realtime_price = mock_fetch

async def test_scenarios():
    # TEST 1: Instant Snipe (No timeout, no close)
    logger.info("--- TEST 1: Instant Snipe ---")
    bot1 = MockBot()
    listener1 = MockListener(bot1)
    # Give it 0.5s to run the loop iteration
    loop_task = asyncio.create_task(listener1.listener.start())
    await asyncio.sleep(0.5)
    listener1.listener.running = False
    assert bot1.executed == True, "Failed Test 1: Should execute instantly"

    # TEST 2: Validation Timeout (Signal sustains)
    logger.info("\n--- TEST 2: Validation Timeout (Sustained) ---")
    bot2 = MockBot()
    bot2.ut_bot_validation_secs = 2 # Wait 2 seconds
    listener2 = MockListener(bot2)
    loop_task2 = asyncio.create_task(listener2.listener.start())
    # Should not be executed immediately
    await asyncio.sleep(0.5)
    assert bot2.executed == False, "Failed Test 2: Should wait"
    # Wait until timeout finishes
    await asyncio.sleep(2)
    listener2.listener.running = False
    assert bot2.executed == True, "Failed Test 2: Should execute after timeout"

    # TEST 3: Validation Timeout (Signal vanishes)
    logger.info("\n--- TEST 3: Validation Timeout (Fakeout Vanishes) ---")
    bot3 = MockBot()
    bot3.ut_bot_validation_secs = 2
    bot3.ut_bot_tracker.signal_vanish_after = 1 # Signal vanishes after 1 second
    
    # We need a background coroutine to update "current_time" for the mock
    async def time_updater():
        while bot3.running:
            bot3.ut_bot_tracker.current_time += 0.5
            await asyncio.sleep(0.5)
    
    time_task = asyncio.create_task(time_updater())
    listener3 = MockListener(bot3)
    loop_task3 = asyncio.create_task(listener3.listener.start())
    
    await asyncio.sleep(3)
    listener3.listener.running = False
    bot3.running = False
    assert bot3.executed == False, "Failed Test 3: Should NOT execute, fakeout averted"
    
    # TEST 4: Retest Snipe (Limit Order Override)
    logger.info("\n--- TEST 4: Retest Snipe (Limit Override) ---")
    bot4 = MockBot()
    bot4.ut_bot_retest_snipe = True
    listener4 = MockListener(bot4)
    loop_task4 = asyncio.create_task(listener4.listener.start())
    
    await asyncio.sleep(0.5)
    listener4.listener.running = False
    assert bot4.executed == True, "Failed Test 4: Should execute"
    assert bot4.executed_order_type == "limit", "Failed Test 4: Order type must be overridden to limit"
    assert bot4.executed_limit_price == 60000.0 * 1.001, "Failed Test 4: Limit price must be SL line * buffer"

    logger.info("\n✅ ALL TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(test_scenarios())
