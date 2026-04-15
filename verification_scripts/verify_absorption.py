import asyncio
import sys
import os

# Add the project root to sys.path to import local modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))

from app.strategies.helpers.absorption_tracker import AbsorptionTracker

async def test_absorption():
    print("🧪 Starting CVD Absorption Tracker Verification...")
    
    # Initialize tracker with $10,000 threshold and 5s window
    tracker = AbsorptionTracker(threshold=10000, window_seconds=5)
    
    # 1. Test Buy Absorption (Price hits Ask)
    print("\n🔹 Testing BUY Absorption (Passive Sellers absorbing Market Buys)...")
    # Simulate market buys totaling $15,000 within 5 seconds
    tracker.add_trade(price=50000, amount_base=0.1, side='buy') # $5,000
    tracker.add_trade(price=50000, amount_base=0.1, side='buy') # $5,000
    tracker.add_trade(price=50000, amount_base=0.1, side='buy') # $5,000
    
    delta = tracker.get_current_delta()
    print(f"Current Delta: ${delta:,.2f}")
    
    is_buy_abs = tracker.is_absorption_detected('sell') # Price hits ASK wall
    print(f"Is BUY Absorption detected? {'✅ YES' if is_buy_abs else '❌ NO'}")
    
    # 2. Test Sell Absorption (Price hits Bid)
    print("\n🔹 Testing SELL Absorption (Passive Buyers absorbing Market Sells)...")
    # Simulate market sells totaling $12,000
    tracker.add_trade(price=49990, amount_base=0.1, side='sell') # -$4,999
    tracker.add_trade(price=49990, amount_base=0.1, side='sell') # -$4,999
    tracker.add_trade(price=49990, amount_base=0.1, side='sell') # -$4,999
    
    delta = tracker.get_current_delta()
    print(f"Current Delta: ${delta:,.2f}")
    
    is_sell_abs = tracker.is_absorption_detected('buy') # Price hits BID wall
    print(f"Is SELL Absorption detected? {'✅ YES' if is_sell_abs else '❌ NO'}")

    # 3. Test Window Expiry
    print("\n🔹 Testing Window Expiry (Waiting 6 seconds)...")
    await asyncio.sleep(6)
    delta_after = tracker.get_current_delta()
    print(f"Delta after 6s: ${delta_after:,.2f}")
    is_abs_after = tracker.is_absorption_detected('buy')
    print(f"Is Absorption detected after expiry? {'✅ YES (Error)' if is_abs_after else '❌ NO (Correct)'}")

    if is_buy_abs and is_sell_abs and not is_abs_after:
        print("\n✨ VERIFICATION SUCCESSFUL: Absorption logic is working correctly!")
    else:
        print("\n⚠️ VERIFICATION FAILED: Some conditions were not met.")

if __name__ == "__main__":
    asyncio.run(test_absorption())
