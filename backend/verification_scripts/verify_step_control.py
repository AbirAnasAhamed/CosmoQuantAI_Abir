import asyncio
import sys
import os

# Robust Path Setup
cwd = os.getcwd()
if os.path.exists(os.path.join(cwd, 'app', 'services')):
    # Docker (/app) or Backend Root
    if cwd not in sys.path:
        sys.path.append(cwd)
elif os.path.exists(os.path.join(cwd, 'backend', 'app', 'services')):
    # Project Root with backend folder
    sys.path.append(os.path.join(cwd, 'backend'))
else:
    print(f"Warning: Could not determine python path from {cwd}")

from app.services.event_driven.engine import EventDrivenEngine

async def verify_pause_step():
    print("--- Starting Verification: Pause & Step ---")
    
    # 1. Initialize Engine
    engine = EventDrivenEngine("BTC/USDT")
    
    # Run engine in background
    run_task = asyncio.create_task(engine.run())
    
    # Wait for start
    await asyncio.sleep(1)
    
    # 2. Pause
    print("Sending PAUSE...")
    engine.pause()
    await asyncio.sleep(0.5) # Allow pause to take effect
    
    # Check if paused (we can check internal state or observe lack of events if we hooked events)
    # Here we check internal state for simplicity
    if engine.is_paused:
        print("✅ Engine is paused.")
    else:
        print("❌ Engine failed to pause.")
        
    # Monitor for silence
    print("Monitoring for silence (2s)...")
    # In a real test we would mock the websocket and assert no messages.
    # Here we just sleep and trust the internal state + manual observation if needed.
    await asyncio.sleep(2)
    
    # 3. Step
    print("Sending STEP...")
    engine.step()
    await asyncio.sleep(0.5)
    
    # It should still be paused
    if engine.is_paused:
        print("✅ Engine returned to pause state after step.")
    else:
        print("❌ Engine resumed fully instead of stepping.")

    # 4. Resume
    print("Sending RESUME...")
    engine.resume()
    await asyncio.sleep(0.5)
    
    if not engine.is_paused:
        print("✅ Engine resumed.")
    else:
        print("❌ Engine failed to resume.")

    # Stop
    engine.stop()
    await run_task
    print("--- Verification Complete ---")

if __name__ == "__main__":
    # Windows SelectorPolicy fix if needed, but handled by asyncio usually
    try:
        asyncio.run(verify_pause_step())
    except KeyboardInterrupt:
        pass
