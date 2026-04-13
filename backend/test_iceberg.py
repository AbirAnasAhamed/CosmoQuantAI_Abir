import asyncio
import time
import sys
import os

# Add the current directory to python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app.strategies.helpers.iceberg_tracker import IcebergTracker

async def main():
    print('Starting Iceberg Spot Check (Simulation Test)...\n')
    
    # 1. Initialize Tracker with small threshold
    tracker = IcebergTracker(window_seconds=10, min_absorbed_vol=5.0) 
    
    # Starting Mid Price: 60000
    bids = [[59900.0, 10.0], [59800.0, 15.0]]
    asks = [[60100.0, 10.0], [60200.0, 20.0]]
    mid_price = 60000.0
    
    print("Initial Orderbook:")
    print("Bids:", bids)
    print("Asks:", asks)
    tracker.update_orderbook(bids, asks)
    
    # 2. Simulate Tape Activity: Massive selling pressure hitting the bid wall at 59900
    print("\n--- Simulating Heavy Sells into 59900 Bid Wall ---")
    print("Trade 1: Sell 2.0 BTC @ 59900")
    tracker.add_trade(59900.0, 2.0, 'sell')
    
    print("Trade 2: Sell 4.0 BTC @ 59900")
    tracker.add_trade(59900.0, 4.0, 'sell')
    
    # Total volume absorbed = 6.0 BTC (> min_absorbed_vol of 5.0)
    # The orderbook only dipped from 10.0 to 9.0 (Simulating a reloading wall that didn't drop by 6.0)
    
    print("\nUpdating orderbook: Wait, the bid wall was defended! It is now 9.0 BTC instead of 4.0 BTC!")
    # Normally 10.0 - 6.0 = 4.0 left. But it reloaded to 9.0.
    bids = [[59900.0, 9.0], [59800.0, 15.0]]
    tracker.update_orderbook(bids, asks)
    
    res = tracker.check_for_iceberg('buy', mid_price)
    
    if res and res.get('iceberg_detected'):
        print(f"\n[ICEBERG BUY SUCCESSFULLY DETECTED]")
        print(f"Price Defended     : {res['price']}")
        print(f"Total Trade Volume : {res['absorbed_vol']} BTC")
        print(f"Limit Wall Remains : {res['limit_vol_remaining']} BTC")
        print(">>> SUCCESS: System successfully correlated the heavy trade absorption vs the defensive reload hook.")
    else:
        print("\n[❌ FAILED] Tracker didn't detect the Iceberg.")
        
    print('\nSimulation Complete.')

if __name__ == "__main__":
    asyncio.run(main())
