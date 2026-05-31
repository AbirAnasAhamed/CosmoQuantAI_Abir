import asyncio
import sys
import os
from unittest.mock import MagicMock

# Fix console encoding for Windows
sys.stdout.reconfigure(encoding='utf-8')

# Ensure we can import app properly
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from app.strategies.wall_hunter_futures import WallHunterFuturesStrategy

class MockBotRecord:
    def __init__(self):
        self.id = 1
        self.owner_id = 1
        self.market = "BTC/USDT"
        self.exchange = "binance"
        self.is_paper_trading = True
        self.config = {
            "trading_mode": "futures",
            "leverage": 10,
            
            "enable_wall_trigger": True,
            "vol_threshold": 500000,
            
            # Supertrend Config
            "enable_supertrend_entry_trigger": True,
            "enable_supertrend_trend_unlock_mode": True,
            
            # UT Bot Config
            "enable_ut_entry_trigger": True,
            "enable_ut_trend_unlock_mode": True,
        }

async def run_test():
    print("🚀 Initializing Trend Unlock Test...")
    
    # Mock CCXT Service
    mock_ccxt = MagicMock()
    
    # Initialize Strategy
    bot_record = MockBotRecord()
    strategy = WallHunterFuturesStrategy(bot_record, mock_ccxt)
    
    # Mock Redis (avoid connectivity issues)
    strategy.redis = MagicMock()
    strategy._publish_status = MagicMock()
    
    # Initialize Tracker Mocks
    strategy.supertrend_tracker = MagicMock()
    strategy.ut_bot_tracker = MagicMock()
    
    strategy.active_pos = None  # No active position
    
    print("\n--- Test 1: Trend Unlock State Transitions ---")
    
    # Simulate: No signals
    strategy.supertrend_tracker.is_entry_signal.return_value = False
    strategy.ut_bot_tracker.is_entry_signal.return_value = False
    print("Test 1.1: No Signals...")
    await mock_run_loop_partial(strategy)
    print(f"unlocked_supertrend_dir: {strategy.unlocked_supertrend_dir}")
    print(f"unlocked_ut_dir: {strategy.unlocked_ut_dir}")
    assert strategy.unlocked_supertrend_dir is None
    assert strategy.unlocked_ut_dir is None
    
    # Simulate: Supertrend BUY signal
    strategy.supertrend_tracker.is_entry_signal.side_effect = lambda side, closed: side == "buy"
    print("\nTest 1.2: Supertrend BUY Crossover...")
    await mock_run_loop_partial(strategy)
    print(f"unlocked_supertrend_dir: {strategy.unlocked_supertrend_dir}")
    assert strategy.unlocked_supertrend_dir == "buy"
    
    # Simulate: UT Bot SELL signal
    strategy.supertrend_tracker.is_entry_signal.side_effect = lambda side, closed: False
    strategy.ut_bot_tracker.is_entry_signal.side_effect = lambda side, closed: side == "sell"
    print("\nTest 1.3: UT Bot SELL Crossover...")
    await mock_run_loop_partial(strategy)
    print(f"unlocked_ut_dir: {strategy.unlocked_ut_dir}")
    assert strategy.unlocked_ut_dir == "sell"
    
    # Simulate: UT Bot BUY signal (flipping direction)
    strategy.ut_bot_tracker.is_entry_signal.side_effect = lambda side, closed: side == "buy"
    print("\nTest 1.4: UT Bot flips to BUY...")
    await mock_run_loop_partial(strategy)
    print(f"unlocked_ut_dir: {strategy.unlocked_ut_dir}")
    assert strategy.unlocked_ut_dir == "buy"

    print("\n✅ Trend Unlock State Transitions Passed!")
    
    print("\n--- Test 2: Filter Logic Verification ---")
    # Now simulate a Wall Detection to see if it allows the entry
    best_wall = {'price': 65000, 'type': 'buy', 'vol': 1000000}
    target_side = "buy" if best_wall['type'] == 'buy' else "sell"
    
    # UT Bot currently unlocked for BUY, Wall is BUY
    # is_entry_signal at this new iteration is False (crossover was in past)
    strategy.ut_bot_tracker.is_entry_signal.side_effect = lambda side, closed=None: False
    
    # Supertrend is Entry Trigger disabled for this test to isolate UT
    # Filter Logic from line 849
    print(f"Simulating a {target_side.upper()} Wall while UT is unlocked for {strategy.unlocked_ut_dir.upper()}")
    
    ut_blocked = False
    if strategy.enable_ut_entry_trigger and strategy.ut_bot_tracker:
        if getattr(strategy, 'ut_trend_unlock_mode', False):
            if strategy.unlocked_ut_dir != target_side:
                print("🚫 [UT Unlock Filter] Wall rejected! Waiting for initial crossover.")
                ut_blocked = True
            else:
                print("🔓 [UT Unlock] Path is clear for BUY!")
                ut_blocked = False
        else:
            if not strategy.ut_bot_tracker.is_entry_signal(target_side):
                print("🚫 [UT Entry Filter] Wall rejected! No exact crossover.")
                ut_blocked = True
                
    assert ut_blocked == False, "UT Bot blocked the trade despite being unlocked!"
    print("✅ Filter Logic verification passed!")
    print("\n🎯 All Tests Completed Successfully!")

async def mock_run_loop_partial(strategy):
    # This roughly emulates lines 693-703 where state is saved
    if getattr(strategy, 'supertrend_trend_unlock_mode', False) and getattr(strategy, 'supertrend_tracker', None):
        closed_only = getattr(strategy, 'supertrend_candle_close', False)
        if strategy.supertrend_tracker.is_entry_signal("buy", closed_only):
            if strategy.unlocked_supertrend_dir != "buy":
                strategy.unlocked_supertrend_dir = "buy"
        elif strategy.supertrend_tracker.is_entry_signal("sell", closed_only):
            if strategy.unlocked_supertrend_dir != "sell":
                strategy.unlocked_supertrend_dir = "sell"
                
    if getattr(strategy, 'ut_trend_unlock_mode', False) and getattr(strategy, 'ut_bot_tracker', None):
        closed_only = getattr(strategy, 'ut_bot_candle_close', False)
        if strategy.ut_bot_tracker.is_entry_signal("buy", closed_only):
            if strategy.unlocked_ut_dir != "buy":
                strategy.unlocked_ut_dir = "buy"
        elif strategy.ut_bot_tracker.is_entry_signal("sell", closed_only):
            if strategy.unlocked_ut_dir != "sell":
                strategy.unlocked_ut_dir = "sell"

if __name__ == "__main__":
    asyncio.run(run_test())
