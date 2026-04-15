
import asyncio
import ccxt.async_support as ccxt

async def investigate_symbols():
    exchange = ccxt.binanceusdm({'enableRateLimit': True})
    try:
        print("Loading markets for binanceusdm...")
        markets = await exchange.load_markets()
        
        target = 'DOGE/USDT:USDT'
        print(f"\nChecking for {target}...")
        if target in markets:
            print(f"FOUND: {target}")
            print(f"Bids: {len(await exchange.fetch_order_book(target, limit=5)['bids'])}")
        else:
            print(f"NOT FOUND: {target}")
            # List first 10 symbols to see format
            print(f"Sample symbols: {list(markets.keys())[:10]}")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await exchange.close()

if __name__ == "__main__":
    asyncio.run(investigate_symbols())
