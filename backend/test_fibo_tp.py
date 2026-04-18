import asyncio
import ccxt.async_support as ccxt
import sys
import os

from app.strategies.helpers.fibo_tp_calculator import calculate_fibo_extension_tp

async def test_fibo():
    print("🚀 Initializing Binance Client for Test...")
    exchange = ccxt.binance()
    
    symbol = 'BTC/USDT'
    timeframe = '5m'
    
    try:
        print(f"📥 Fetching {timeframe} OHLCV data for {symbol}...")
        ohlcv = await exchange.fetch_ohlcv(symbol, timeframe, limit=30)
        
        if not ohlcv:
            print("❌ Failed to fetch OHLCV data.")
            return

        current_price = ohlcv[-1][4]
        print(f"💰 Current {symbol} Price (Mock Entry): {current_price}")
        
        print("\n📈 --- Testing LONG Entry ---")
        for level in [1.272, 1.618, 2.618]:
            tp = calculate_fibo_extension_tp(ohlcv, current_price, 'buy', level)
            if tp:
                pct_diff = ((tp - current_price) / current_price) * 100
                print(f"✅ {level}x Extension TP: {tp:.2f} ({pct_diff:.2f}% above entry)")
            else:
                print(f"❌ Failed to calculate {level}x Extension for LONG")
                
        print("\n📉 --- Testing SHORT Entry ---")
        for level in [1.272, 1.618, 2.618]:
            tp = calculate_fibo_extension_tp(ohlcv, current_price, 'sell', level)
            if tp:
                pct_diff = ((current_price - tp) / current_price) * 100
                print(f"✅ {level}x Extension TP: {tp:.2f} ({pct_diff:.2f}% below entry)")
            else:
                print(f"❌ Failed to calculate {level}x Extension for SHORT")

    except Exception as e:
        print(f"Error during test: {e}")
    finally:
        await exchange.close()

if __name__ == "__main__":
    asyncio.run(test_fibo())
