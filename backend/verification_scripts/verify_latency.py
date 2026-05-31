import asyncio
import datetime
import sys
import os

# Add the 'backend' directory to sys.path so we can import 'app'
sys.path.append(os.path.join(os.path.dirname(__file__), ''))

from app.services.event_driven.engine import EventDrivenEngine, MarketEvent, OrderEvent, FillEvent, EventType

async def verify_latency():
    print("--- Starting Latency Verification ---")
    
    # Initialize Engine
    engine = EventDrivenEngine("BTC/USDT")
    engine.latency_ms = 500.0 # Set 500ms latency
    
    # Mock Start Time
    start_time = datetime.datetime.now()
    engine.last_event_time = start_time
    
    # Create an Order Event
    order = OrderEvent(
        symbol="BTC/USDT",
        order_type="MKT",
        quantity=1,
        direction="BUY"
    )
    
    print(f"[{datetime.datetime.now()}] Placing Order with 500ms latency...")
    await engine.handle_order_event(order)
    
    # Check Buffer
    if len(engine.pending_orders) == 1:
        print("PASS: Order successfully buffered.")
        scheduled_time = engine.pending_orders[0]['execute_at']
        print(f"Order scheduled for: {scheduled_time} (Start + 500ms should be roughly {start_time + datetime.timedelta(milliseconds=500)})")
    else:
        print("FAIL: Order not buffered.")
        return

    # Simulate Time Passing (Advance Event Loop Logic Manually)
    
    # 1. Advance time by 200ms (Should NOT execute)
    print(f"[{datetime.datetime.now()}] Advancing time by 200ms...")
    engine.last_event_time += datetime.timedelta(milliseconds=200)
    
    # Run the check logic isolated
    if engine.last_event_time and engine.pending_orders:
        ready_orders = [item for item in engine.pending_orders if engine.last_event_time >= item['execute_at']]
        if len(ready_orders) == 0:
             print("PASS: Order NOT executed yet.")
        else:
             print("FAIL: Order executed too early!")
             
    # 2. Advance time by another 400ms (Total 600ms > 500ms) (Should Execute)
    print(f"[{datetime.datetime.now()}] Advancing time by 400ms (Total 600ms)...")
    engine.last_event_time += datetime.timedelta(milliseconds=400)
    
    # Run the logic again
    if engine.last_event_time and engine.pending_orders:
        ready_orders = []
        remaining = []
        for item in engine.pending_orders:
            if engine.last_event_time >= item['execute_at']:
                ready_orders.append(item)
            else:
                remaining.append(item)
        
        engine.pending_orders = remaining
        
        if len(ready_orders) == 1:
            print("PASS: Order identified for execution.")
            # Execute
            await engine._execute_order(ready_orders[0]['order'])
            
            # Check output queue
            if not engine.events.empty():
                event = await engine.events.get()
                if event.type == EventType.FILL:
                    print(f"[{datetime.datetime.now()}] PASS: Fill Event Generated.")
                else:
                    print(f"FAIL: Unexpected event type: {event.type}")
            else:
                print("FAIL: No Fill event generated.")
        else:
            print("FAIL: Order should have been executed but wasn't.")

    print("--- Verification Complete ---")

if __name__ == "__main__":
    asyncio.run(verify_latency())
