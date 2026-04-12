import asyncio
import ccxt.async_support as ccxt

async def check():
    exchange = ccxt.mexc()
    await exchange.load_markets()
    print("POL/USDC in markets:", "POL/USDC" in exchange.markets)
    print("POL/USDT in markets:", "POL/USDT" in exchange.markets)
    await exchange.close()

asyncio.run(check())
