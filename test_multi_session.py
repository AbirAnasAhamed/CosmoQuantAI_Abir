import sys
import os
import asyncio
from datetime import datetime

# Adjust Python path to load backend modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), 'backend')))

from app.strategies.helpers.trading_session_filter import TradingSessionTracker

def test_sessions():
    now = datetime.utcnow()
    print(f"Current UTC Time: {now.strftime('%H:%M:%S UTC')}")
    
    # 1. 24/7 logic
    print("\n--- Testing 24/7 (None) ---")
    active = TradingSessionTracker.is_session_active(["None"])
    print(f"Is active? {active}")
    
    # 2. String fallback logic
    print("\n--- Testing string fallback ---")
    active = TradingSessionTracker.is_session_active("London") # even if we pass a string due to a legacy bug, we expect it to iterate the string and fail gracefully or throw exception. Wait the type hint says list[str]. But let's check array.
    
    # 3. Known multi-session
    print("\n--- Testing Multi Session (London + New York) ---")
    active = TradingSessionTracker.is_session_active(["London", "New York"])
    print(f"Is actively trading now in London/NY? {active}")
    print(f"Windows: {TradingSessionTracker.get_session_window_str(['London', 'New York'])}")

    # 4. Custom Time (Past time)
    print("\n--- Testing Custom Time (Always False if 00:00-00:01) ---")
    active = TradingSessionTracker.is_session_active(["Custom|00:00-00:01"])
    print(f"Is actively trading? {active}")
    print(f"Windows: {TradingSessionTracker.get_session_window_str(['Custom|00:00-00:01'])}")

    # 5. Custom Time (Spanning current time)
    start_h = now.hour - 1 if now.hour > 0 else 23
    end_h   = now.hour + 1 if now.hour < 23 else 0
    test_str = f"Custom|{start_h:02d}:00-{end_h:02d}:00"
    print(f"\n--- Testing Custom Time Spanning Current Time ({test_str}) ---")
    active = TradingSessionTracker.is_session_active([test_str])
    print(f"Is actively trading? {active}")
    print(f"Windows: {TradingSessionTracker.get_session_window_str([test_str])}")

if __name__ == "__main__":
    test_sessions()
