import asyncio
import logging
import time

from app.strategies.helpers.dual_engine_analyzer import DualEngineTracker

# Disable pandas_ta progress bar/logs if any
logging.getLogger("pandas_ta").setLevel(logging.ERROR)

async def main():
    out = open("dual_engine_test_results.txt", "w", encoding="utf-8")
    def p(text):
        out.write(str(text) + "\n")
        print(text)

    p("Starting Dual Engine Tester...")
    config = {
        "enable_dual_engine": True,
        "dual_engine_mode": "Classic",
        "dual_engine_ema_filter": True,
        "dual_engine_rsi_filter": False,
        "dual_engine_candle_filter": True
    }
    
    tracker = DualEngineTracker("binance", "BTC/USDT", config)
    
    # BUY SCENARIO
    klines = []
    base_price = 60000
    timestamp = int(time.time() * 1000) - (150 * 60 * 1000)
    
    for i in range(148):
        klines.append([
            timestamp + i * 60_000,
            base_price + i * 10,       # open
            base_price + i * 10 + 50,  # high
            base_price + i * 10 - 50,  # low
            base_price + i * 10 + 20,  # close
            1.0                        # vol
        ])
    
    # Prev Candle: Bearish
    klines.append([
        timestamp + 148 * 60_000,
        61480,   # open
        61500,   # high
        61000,   # low
        61050,   # close
        10.0
    ])
    
    # Current Candle: Bullish Engulfing
    klines.append([
        timestamp + 149 * 60_000,
        61000,   # open
        61600,   # high
        60950,   # low
        61500,   # close
        10.0
    ])

    p("\n--- Testing BUY Signal Scenario ---")
    await tracker._calculate_context(klines)
    
    p("\n--- RESULTS ---")
    p(tracker.get_metrics_string())
    p(f"Is BUY? {tracker.is_aligned('buy')}")
    p(f"Is SELL? {tracker.is_aligned('sell')}")
    p(f"State: {tracker.current_state}")
    
    
    # SELL SCENARIO
    klines_sell = []
    for i in range(148):
        klines_sell.append([
            timestamp + i * 60_000,
            base_price - i * 10,
            base_price - i * 10 + 50,
            base_price - i * 10 - 50,
            base_price - i * 10 - 20,
            1.0
        ])
    
    # Prev Candle: Bullish
    klines_sell.append([
        timestamp + 148 * 60_000,
        15000,   # open
        15500,   # high
        14900,   # low
        15400,   # close
        10.0
    ])
    
    # Current Candle: Bearish Engulfing
    klines_sell.append([
        timestamp + 149 * 60_000,
        15500,   # open
        15600,   # high
        14800,   # low
        14900,   # close
        10.0
    ])
    
    p("\n--- Testing SELL Signal Scenario ---")
    await tracker._calculate_context(klines_sell)
    p("\n--- RESULTS ---")
    p(tracker.get_metrics_string())
    p(f"Is BUY? {tracker.is_aligned('buy')}")
    p(f"Is SELL? {tracker.is_aligned('sell')}")
    p(f"State: {tracker.current_state}")
    
    out.close()

if __name__ == "__main__":
    asyncio.run(main())
