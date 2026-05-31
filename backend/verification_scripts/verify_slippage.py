import asyncio
import datetime
import sys
import os

# Add the 'backend' directory to sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), ''))

from app.services.event_driven.engine import EventDrivenEngine, MarketEvent, OrderEvent, FillEvent, EventType

async def verify_slippage():
    print("--- Starting Slippage Verification ---")
    
    # Initialize Engine
    engine = EventDrivenEngine(symbol="BTC/USDT")
    
    # 1. Set Slippage to 10%
    engine.slippage_pct = 10.0
    print(f"Slippage set to: {engine.slippage_pct}%")
    
    # Define Market Price
    market_price = 100.0
    print(f"Base Market Price: {market_price}")
    
    # --- Test BUY Order ---
    print("\n[TEST 1] Testing BUY Order (Expect Price ~110)")
    # Logic: Pay 10% more = 110
    
    buy_exec = engine.apply_slippage(market_price, "BUY")
    print(f"Executed BUY Price: {buy_exec:.4f}")
    
    if 109.5 < buy_exec < 110.5:
        print("PASS: BUY Execution Price is within range (approx 110).")
    else:
        print("FAIL: BUY Execution Price is incorrect.")

    # --- Test SELL Order ---
    print("\n[TEST 2] Testing SELL Order (Expect Price ~90)")
    # Logic: Get 10% less = 90
    
    sell_exec = engine.apply_slippage(market_price, "SELL")
    print(f"Executed SELL Price: {sell_exec:.4f}")
    
    if 89.5 < sell_exec < 90.5:
        print("PASS: SELL Execution Price is within range (approx 90).")
    else:
        print("FAIL: SELL Execution Price is incorrect.")
        
    print("\n--- Verification Complete ---")

if __name__ == "__main__":
    loop = asyncio.get_event_loop()
    loop.run_until_complete(verify_slippage())
