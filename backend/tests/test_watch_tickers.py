import asyncio
import ccxt.pro as ccxt

async def test():
    e = ccxt.binance()
    try:
        tickers = await e.watch_tickers()
        print("Success, tickers length:", len(tickers))
    except Exception as ex:
        print("Error:", ex)
    finally:
        await e.close()

asyncio.run(test())
