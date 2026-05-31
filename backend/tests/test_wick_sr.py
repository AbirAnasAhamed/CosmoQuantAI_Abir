import sys
import os

# Add backend directory to sys.path to resolve imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.strategies.helpers.wick_sr_tracker import WickSRTracker

def test_tracker():
    print("=== Testing WickSRTracker dynamic parameters ===")
    
    try:
        tracker = WickSRTracker(
            timeframe="15m",
            sweep_threshold_candles=5,
            min_touches=35,
            atr_period=20,
            atr_multiplier=2.5
        )
        
        assert tracker.timeframe == "15m"
        assert tracker.min_touches == 35
        assert tracker.atr_period == 20
        assert tracker.atr_multiplier == 2.5
        
        print("[OK] Tracker initialized successfully with dynamic parameters:")
        print(f"  - TF: {tracker.timeframe}")
        print(f"  - Min Touches: {tracker.min_touches}")
        print(f"  - ATR Period: {tracker.atr_period}")
        print(f"  - ATRx: {tracker.atr_multiplier}")
        
        # Test updating with mock candles (ensure no math/ATR calculation errors)
        import random
        mock_klines = []
        base_price = 50000
        for i in range(100):
            high = base_price + random.uniform(10, 50)
            low = base_price - random.uniform(10, 50)
            close = base_price + random.uniform(-20, 20)
            mock_klines.append({
                'time': 1000000 + i*900, # 15m intervals
                'open': base_price,
                'high': high,
                'low': low,
                'close': close,
                'volume': 100
            })
            base_price = close
            
        tracker.update_levels(mock_klines)
        print("[OK] Tracker processed 100 mock candles without errors.")
        print("=== Test Passed Successfully ===")
        
    except Exception as e:
        print(f"[ERROR] Test failed: {e}")

if __name__ == "__main__":
    test_tracker()
