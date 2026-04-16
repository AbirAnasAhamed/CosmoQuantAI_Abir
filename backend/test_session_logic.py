import sys
import os
import asyncio

# Setup path so we can import the app modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__))))

from app.strategies.helpers.trading_session_filter import TradingSessionTracker

async def run_tests():
    print("--- Testing Trading Session Filter Logic ---")
    
    print(f"[Test 1] Session 'None' is active: {TradingSessionTracker.is_session_active('None')} (Expected: True)")
    assert TradingSessionTracker.is_session_active("None") == True
    
    # Mocking Time checks
    print("\n--- Testing Time Window Logic ---")
    res_sydney = TradingSessionTracker._is_time_in_window(23, 30, 22, 0, 7, 0)
    res_london = TradingSessionTracker._is_time_in_window(23, 30, 8, 0, 17, 0)
    print(f"[Test 2] Time 23:30 falls in Sydney (22:00-07:00)? {res_sydney} (Expected: True)")
    print(f"[Test 3] Time 23:30 falls in London (08:00-17:00)? {res_london} (Expected: False)")
    
    assert res_sydney == True
    assert res_london == False
    
    res_ny = TradingSessionTracker._is_time_in_window(14, 0, 13, 0, 22, 0)
    res_overlap = TradingSessionTracker._is_time_in_window(14, 0, 13, 0, 17, 0)
    res_tokyo = TradingSessionTracker._is_time_in_window(14, 0, 0, 0, 9, 0)
    print(f"[Test 4] Time 14:00 falls in New York (13:00-22:00)? {res_ny} (Expected: True)")
    print(f"[Test 5] Time 14:00 falls in Overlap (13:00-17:00)? {res_overlap} (Expected: True)")
    print(f"[Test 6] Time 14:00 falls in Tokyo (00:00-09:00)? {res_tokyo} (Expected: False)")
    
    assert res_ny == True
    assert res_overlap == True
    assert res_tokyo == False

    print("\n--- Testing Bot Initialization (Spot & Futures) ---")
    try:
        from app.strategies.wall_hunter_bot import WallHunterBot
        from app.strategies.wall_hunter_futures import WallHunterFuturesStrategy
        
        config_spot = {"symbol": "BTC/USDT", "trading_session": "London", "is_paper_trading": True}
        bot_spot = WallHunterBot(bot_id=1, config=config_spot, owner_id=1)
        print(f"[Test 7] Spot Bot correctly initialized with session: '{bot_spot.session_tracker.session_name}'")
        assert bot_spot.session_tracker.session_name == "London"
        
        class MockBotRecord:
            def __init__(self):
                self.id = 2
                self.owner_id = 1
                self.market = "BTC/USDT"
                self.exchange = "binance"
                self.is_paper_trading = True
                self.config = {"trading_session": "New York"}
                
        bot_futures = WallHunterFuturesStrategy(bot_record=MockBotRecord(), ccxt_service=None)
        print(f"[Test 8] Futures Bot correctly initialized with session: '{bot_futures.session_tracker.session_name}'")
        assert bot_futures.session_tracker.session_name == "New York"
        
        print("\nALL TESTS PASSED! Trading Session logic and modules are working perfectly.")
    except Exception as e:
        print(f"Initialization test failed: {e}")

if __name__ == "__main__":
    asyncio.run(run_tests())
