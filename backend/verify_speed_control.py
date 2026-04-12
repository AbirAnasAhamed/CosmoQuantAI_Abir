import asyncio
import time
import sys
import os

# Add project root to sys.path
sys.path.append(os.getcwd())

from app.services.event_driven.engine import EventDrivenEngine, MarketEvent

class TestEngine(EventDrivenEngine):
    def __init__(self, symbol, target_events):
        super().__init__(symbol)
        self.target_events = target_events
        self.processed_events = 0
        self.start_time = 0
        self.end_time = 0

    async def handle_market_event(self, event: MarketEvent):
        # We override this to just count events and stop
        self.processed_events += 1
        if self.processed_events >= self.target_events:
            self.stop()

    async def run_test(self):
        self.start_time = time.time()
        await self.run()
        self.end_time = time.time()
        return self.end_time - self.start_time

def log(msg):
    print(msg)
    with open("test_results.log", "a", encoding="utf-8") as f:
        f.write(msg + "\n")

async def main():
    # Clear log file
    with open("test_results.log", "w", encoding="utf-8") as f:
        f.write("--- Verifying Speed Control ---\n")
    
    print("--- Verifying Speed Control ---")

    # Test 1: speed=1.0 (Real-time)
    # We expect 4 events (3 intervals of 1s) to take ~3 seconds.
    msg = "\nTest 1: Speed 1.0x (Expect ~3.0s for 4 events)"
    log(msg)
    
    engine = TestEngine("BTC/USDT", target_events=4)
    engine.set_speed(1.0)
    duration = await engine.run_test()
    
    log(f"Time Taken: {duration:.4f}s")
    if 2.8 <= duration <= 3.2:
        log("✅ PASS")
    else:
        log(f"❌ FAIL (Expected ~3.0s)")

    # Test 2: speed=10.0 (10x faster)
    # 4 events (3 intervals of 1s) -> 3s / 10 = 0.3s
    msg = "\nTest 2: Speed 10.0x (Expect ~0.3s for 4 events)"
    log(msg)
    
    engine = TestEngine("BTC/USDT", target_events=4)
    engine.set_speed(10.0)
    duration = await engine.run_test()
    
    log(f"Time Taken: {duration:.4f}s")
    if 0.25 <= duration <= 0.45:
        log("✅ PASS")
    else:
        log(f"❌ FAIL (Expected ~0.3s)")

    # Test 3: speed=0 (Max Speed)
    # Should be almost instant
    msg = "\nTest 3: Max Speed (Expect < 0.1s for 4 events)"
    log(msg)
    
    engine = TestEngine("BTC/USDT", target_events=4)
    engine.set_speed(0)
    duration = await engine.run_test()
    
    log(f"Time Taken: {duration:.4f}s")
    if duration < 0.1:
        log("✅ PASS")
    else:
        log(f"❌ FAIL (Expected < 0.1s)")

if __name__ == "__main__":
    asyncio.run(main())
