import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.strategies.helpers.zero_tolerance_tracker import ZeroToleranceTracker

def run_tests():
    print("--- Testing Zero Tolerance Tracker ---")
    
    # Test 1: Zero Tolerance Ticks = 0 (Immediate breakeven)
    entry_price = 0.1010
    tracker1 = ZeroToleranceTracker(enable_zero_tolerance=True, zero_tolerance_ticks=0)
    tracker1.activate(entry_price=entry_price, side='long', tick_size=0.000001)
    
    print(f"\n[Test 1] LONG | Entry: {entry_price} | Ticks: 0")
    print(f"Trigger Price Calculated: {tracker1.trigger_price}")
    
    # Tick 1: Price is above entry
    triggered = tracker1.check_trigger(0.101005, 'long')
    print(f"Price: 0.101005 | Triggered: {triggered}")
    assert triggered == False
    
    # Tick 2: Price goes back to entry price
    triggered = tracker1.check_trigger(0.1010, 'long')
    print(f"Price: 0.101000 | Triggered: {triggered}")
    assert triggered == True
    print("[PASS] Test 1 Passed!")

    # Test 2: Zero Tolerance Ticks = 5
    entry_price = 0.1010
    tracker2 = ZeroToleranceTracker(enable_zero_tolerance=True, zero_tolerance_ticks=5)
    tracker2.activate(entry_price=entry_price, side='long', tick_size=0.000001)
    
    print(f"\n[Test 2] LONG | Entry: {entry_price} | Ticks: 5")
    print(f"Trigger Price Calculated: {tracker2.trigger_price}")
    
    # Tick 1: Price goes down slightly, but not past buffer (0.1010 - 0.000005 = 0.100995)
    triggered = tracker2.check_trigger(0.100998, 'long')
    print(f"Price: 0.100998 | Triggered: {triggered}")
    assert triggered == False
    
    # Tick 2: Price reaches the buffer limit
    triggered = tracker2.check_trigger(0.100995, 'long')
    print(f"Price: 0.100995 | Triggered: {triggered}")
    assert triggered == True
    print("[PASS] Test 2 Passed!")
    
    # Test 3: SHORT Scenario
    entry_price_short = 0.5000
    tracker3 = ZeroToleranceTracker(enable_zero_tolerance=True, zero_tolerance_ticks=2)
    tracker3.activate(entry_price=entry_price_short, side='short', tick_size=0.0001)
    
    print(f"\n[Test 3] SHORT | Entry: {entry_price_short} | Ticks: 2")
    print(f"Trigger Price Calculated: {tracker3.trigger_price}")
    
    # Tick 1: Price rises 1 tick (not past buffer)
    triggered = tracker3.check_trigger(0.5001, 'short')
    print(f"Price: 0.5001 | Triggered: {triggered}")
    assert triggered == False
    
    # Tick 2: Price rises 2 ticks (buffer reached)
    triggered = tracker3.check_trigger(0.5002, 'short')
    print(f"Price: 0.5002 | Triggered: {triggered}")
    assert triggered == True
    print("[PASS] Test 3 Passed!")

    print("\n[SUCCESS] All Verification Tests Passed Successfully!")

if __name__ == "__main__":
    run_tests()
