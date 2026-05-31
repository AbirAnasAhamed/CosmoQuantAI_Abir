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

from app.services.event_driven.engine import EventDrivenEngine

async def verify_hot_reload():
    print("--- Starting Verification: Hot Reload Parameters ---")
    
    # 1. Initialize Engine
    engine = EventDrivenEngine("BTC/USDT")
    
    # Run engine in background
    run_task = asyncio.create_task(engine.run())
    
    # Wait for start
    await asyncio.sleep(1)
    
    # 2. Check Initial Params
    print(f"Initial Params: {engine.strategy.params}")
    if engine.strategy.params['stop_loss'] == 0.01:
        print("✅ Initial Stop Loss is correct (0.01)")
    else:
        print(f"❌ Initial Params Incorrect: {engine.strategy.params}")

    # 3. Send UPDATE_PARAMS
    new_params = {
        "stop_loss": 0.05,
        "take_profit": 0.10,
        "buy_probability": 0.9
    }
    print(f"Sending UPDATE_PARAMS: {new_params}")
    
    await engine.process_command({
        "type": "UPDATE_PARAMS",
        "params": new_params
    })
    
    await asyncio.sleep(0.5)
    
    # 4. Verify Update
    print(f"Updated Params: {engine.strategy.params}")
    
    if engine.strategy.params['stop_loss'] == 0.05:
        print("✅ Stop Loss updated successfully to 0.05")
    else:
        print("❌ Stop Loss update failed.")
        
    if engine.strategy.params['take_profit'] == 0.10:
        print("✅ Take Profit updated successfully to 0.10")
    else:
        print("❌ Take Profit update failed.")

    # 5. Invalid Update Test
    print("Testing Invalid Parameter (Negative Value)...")
    await engine.process_command({
        "type": "UPDATE_PARAMS",
        "params": {"stop_loss": "INVALID_NUMBER"}
    })
    
    # Should remain 0.05 or handle error gracefully (we print error in implementation)
    # The implementation catches ValueError.
    
    # Stop
    engine.stop()
    await run_task
    print("--- Verification Complete ---")

if __name__ == "__main__":
    try:
        asyncio.run(verify_hot_reload())
    except KeyboardInterrupt:
        pass
