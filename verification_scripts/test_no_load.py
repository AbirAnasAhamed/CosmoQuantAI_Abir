
import asyncio
import ccxt.async_support as ccxt

async def test_no_load():
    symbol = 'DOGE/USDT'
    
    print("\n--- Testing Binance (future) WITHOUT load_markets ---")
    exchange = ccxt.binance({
        'enableRateLimit': True,
        'options': {'defaultType': 'future'}
    })
    
    try:
        # fetch_ticker often works without load_markets if the symbol is standard
        # But CCXT might try to load markets anyway if it doesn't have them in cache.
        # We can try to skip it by setting markets manually or just trying the call.
        print(f"Fetching ticker for {symbol}...")
        ticker = await exchange.fetch_ticker(symbol)
        print(f"SUCCESS! Last: {ticker['last']}")
    except Exception as e:
        print(f"FAILED: {e}")
    finally:
        await exchange.close()

if __name__ == "__main__":
    asyncio.run(test_no_load())
