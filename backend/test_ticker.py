import asyncio
import ccxt.async_support as ccxt

async def test():
    e = ccxt.binance()
    t = await e.fetch_tickers(['BTC/USDT'])
    BTC = t['BTC/USDT']
    for k, v in BTC.items():
        print(f"{k}: {v}")
    await e.close()

asyncio.run(test())
