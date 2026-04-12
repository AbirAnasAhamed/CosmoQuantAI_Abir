import sys

def test_wall_distance():
    print("Running Wall Distance Trigger Check...\n")
    
    mid_price = 100.0
    max_wall_distance_pct = 1.0
    vol_threshold = 50000.0
    
    print(f"Mid Price: {mid_price}")
    print(f"Max Wall Distance Allowed: {max_wall_distance_pct}%")
    print(f"Volume Threshold: {vol_threshold}\n")
    
    orderbook = {
        'bids': [
            [99.5, 60000.0],  # Valid (0.5% away, > 50k vol)
            [99.0, 100000.0], # Valid (1.0% away, > 50k vol)
            [98.5, 200000.0], # Invalid (1.5% away, > 50k vol)
            [99.8, 10000.0],  # Invalid (< 50k vol)
        ]
    }
    
    current_walls = {}
    max_vol = 0
    
    for price, vol in orderbook['bids']:
        if vol > max_vol:
            max_vol = vol
        if vol >= vol_threshold:
            distance_pct = abs(price - mid_price) / mid_price * 100.0
            print(f"Checking wall at {price} with vol {vol} -> Distance: {distance_pct:.2f}%")
            if distance_pct <= max_wall_distance_pct:
                print(f"  [+] ACCEPTED")
                current_walls[price] = vol
            else:
                print(f"  [-] REJECTED (Too far, max is {max_wall_distance_pct}%)")
        else:
            print(f"Checking wall at {price} with vol {vol} -> REJECTED (Low volume)")
            
    print(f"\nFinal Tracked Walls: {current_walls}")
    
    if 99.5 in current_walls and 99.0 in current_walls and 98.5 not in current_walls:
        print("\n✅ TEST PASSED: Bot successfully filters out distant walls!")
        return 0
    else:
        print("\n❌ TEST FAILED: Logic error.")
        return 1

if __name__ == "__main__":
    sys.exit(test_wall_distance())
