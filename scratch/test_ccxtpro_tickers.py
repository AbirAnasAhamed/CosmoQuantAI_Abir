import asyncio
import ccxt.pro as ccxtpro

async def main():
    exchange = ccxtpro.binance({'options': {'defaultType': 'swap'}})
    print("Watching tickers...")
    try:
        # fetch_tickers first to get the baseline? No, watch_tickers might fetch all if needed.
        # But our IP is banned, so we can't test Binance REST right now.
        # Let's test with Bybit instead to see ccxtpro behaviour.
        bybit = ccxtpro.bybit({'options': {'defaultType': 'linear'}})
        
        async def watch():
            while True:
                await bybit.watch_tickers()
                
        asyncio.create_task(watch())
        
        for _ in range(3):
            await asyncio.sleep(2)
            print(f"Cached tickers: {len(bybit.tickers)}")
            
        await bybit.close()
    except Exception as e:
        print(f"Error: {e}")

asyncio.run(main())
