import asyncio
import ccxt.async_support as ccxt

async def main():
    exchange = ccxt.krakenfutures()
    try:
        markets = await exchange.load_markets()
        print(f"Kraken Futures Symbols: {list(markets.keys())[:20]}")
        # Search for DOGE
        doge_symbols = [s for s in markets.keys() if 'DOGE' in s]
        print(f"DOGE symbols: {doge_symbols}")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await exchange.close()

if __name__ == "__main__":
    asyncio.run(main())
