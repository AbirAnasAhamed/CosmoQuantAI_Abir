
import asyncio
import sys
import os
from datetime import datetime

# Add current directory to path to allow imports
sys.path.append(os.getcwd())

from app.services.event_driven.engine import EventDrivenEngine, MarketEvent, OrderEvent, FillEvent

async def verify_partial_fill():
    print("--- Starting Partial Fill Verification ---")
    
    # 1. Initialize Engine
    engine = EventDrivenEngine("BTC/USDT")
    engine.volume_participation_rate = 0.1 # 10% Participation
    print(f"Participation Rate: {engine.volume_participation_rate*100}%")

    # 2. Setup Market Data (Volume = 100)
    # Max Fill per bar = 100 * 0.1 = 10 units
    market_event = MarketEvent(
        symbol="BTC/USDT",
        date=datetime.now(),
        open_price=100, high=105, low=95, close=100,
        volume=100
    )
    
    # 3. Create Large Order (Qty = 50)
    # Should take 5 bars to fill (50 / 10 = 5)
    order = OrderEvent(
        symbol="BTC/USDT",
        order_type="MKT",
        quantity=50,
        direction="BUY"
    )
    
    # Put order in pending
    engine.pending_orders.append({
        "order": order,
        "execute_at": datetime.now() # Ready immediately
    })
    
    print(f"Placed Order: {order.quantity} units. Market Volume: {market_event.volume}.")
    print(f"Expected Fill/Bar: {int(market_event.volume * engine.volume_participation_rate)}")
    
    # 4. Run Loop
    total_filled = 0
    iterations = 0
    
    # Store fills to verify
    fills = []
    
    # We will simulate the loop logic manually
    while total_filled < 50:
        iterations += 1
        print(f"\n[Iteration {iterations}] Processing...")
        
        # A. Hande Market Event (Sets current_market_event and re-queues waiting orders)
        await engine.handle_market_event(market_event)
        
        # B. Check Pending Orders (Simulates _execute_order call)
        # We need to manually trigger what the loop does
        
        # In the real loop, it checks pending_orders
        # engine.pending_orders has newly re-queued orders now if any
        
        current_pending = engine.pending_orders
        engine.pending_orders = [] # Clear them as we process
        
        if not current_pending:
            print("ERROR: No pending orders found! Setup failed?")
            break
            
        for item in current_pending:
            current_order = item['order']
            print(f"Executing Order Qty: {current_order.quantity}")
            await engine._execute_order(current_order)
        
        # Check generated events (Fills)
        while not engine.events.empty():
            event = await engine.events.get()
            if event.type.name == 'FILL':
                fills.append(event)
                total_filled += event.quantity
                print(f"  -> Filled {event.quantity} units. Total Filled: {total_filled}/50")
            elif event.type.name == 'SIGN':
                pass # Ignore signals
                
        if iterations > 10:
            print("ERROR: Too many iterations! Stuck?")
            break

    # 5. Assertions
    print("\n--- Verification Results ---")
    if total_filled == 50:
        print("SUCCESS: Order completely filled.")
    else:
        print(f"FAILURE: Order not filled. Total: {total_filled}")
        
    if iterations == 5:
        print(f"SUCCESS: Order took exactly {iterations} iterations (Correct).")
    else:
        print(f"FAILURE: Order took {iterations} iterations. Expected 5.")

    # Check sum of fills
    fill_sum = sum(f.quantity for f in fills)
    if fill_sum == 50:
        print(f"SUCCESS: Sum of partial fills ({fill_sum}) matches original quantity.")
    else:
        print(f"FAILURE: Sum mismatch! {fill_sum} != 50")

if __name__ == "__main__":
    asyncio.run(verify_partial_fill())
