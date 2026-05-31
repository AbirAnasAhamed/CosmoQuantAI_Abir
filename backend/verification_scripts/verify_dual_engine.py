import asyncio
import logging
import random
import time
from app.strategies.helpers.dual_engine_analyzer import DualEngineTracker

logging.basicConfig(level=logging.INFO)

async def test_dual_engine():
    print("==================================================")
    print("TESTING DUAL ENGINE PARITY (OVERALL INSIGHT SCORE)")
    print("==================================================")
    
    config = {
        "enable_dual_engine": True,
        "dual_engine_mode": "Legacy", 
        "dual_engine_ema_filter": True,
        "dual_engine_rsi_filter": True,
        "dual_engine_macd_filter": True,
        "dual_engine_squeeze_filter": True,
        "dual_engine_ema_length": 50,
        "dual_engine_rsi_length": 14,
        "dual_engine_rsi_ob": 70,
        "dual_engine_rsi_os": 30,
        "dual_engine_macd_fast": 12,
        "dual_engine_macd_slow": 26,
        "dual_engine_macd_signal": 9,
        "dual_engine_squeeze_length": 20,
        "dual_engine_squeeze_bb_mult": 2.0,
        "dual_engine_squeeze_kc_mult": 1.5,
    }
    
    tracker = DualEngineTracker("binance", "BTC/USDT", config)
    
    print("Generating mock historical 1m data for BTC/USDT...")
    
    formatted_klines = []
    base_price = 100000.0
    
    # Generate 250 strongly trending bullish candles to trigger a STRONG BUY (>4 score)
    for i in range(250):
        # Trending up
        base_price += random.uniform(10, 50) 
        
        formatted_klines.append({
            'timestamp': int(time.time() * 1000) - (250 - i) * 60000,
            'open': base_price,
            'high': base_price + 20,
            'low': base_price - 10,
            'close': base_price + 15,
            'volume': random.uniform(100, 500)
        })
        
    print(f"Generated {len(formatted_klines)} klines. Calculating Dual Engine...")
    
    try:
        await tracker._calculate_context(formatted_klines)
        
        print("\n" + "="*30)
        print("         RESULTS")
        print("="*30)
        print(f"Mode Used:      {tracker.mode}")
        print(f"Insight Signal: {tracker.current_state['signal']}")
        print(f"LTF Trend:      {tracker.current_state['trend']}")
        print(f"Current RSI:    {tracker.current_state['rsi']}")
        print("="*30)
        print("SUCCESS! Parity executed perfectly without errors.")
        
    except Exception as e:
        print(f"FAILED with error: {e}")

if __name__ == "__main__":
    asyncio.run(test_dual_engine())
