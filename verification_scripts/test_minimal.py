
import asyncio
import ccxt.async_support as ccxt

async def test_minimal():
    symbol = 'DOGE/USDT' # Try without :USDT as well
    exchange = ccxt.binanceusdm({'enableRateLimit': True})
    
    print("\n--- Testing Binance USDM (Minimal) ---")
    try:
        # Try a direct fetch if possible, or ticker
        print(f"Fetching ticker for {symbol}...")
        ticker = await exchange.fetch_ticker(symbol)
        print(f"Ticker Success: Last={ticker['last']}")
    except Exception as e:
        print(f"Ticker Failed: {e}")
        
    try:
        print("\nLoading markets...")
        # explicitly testing the URL CCXT uses
        markets = await exchange.load_markets()
        print(f"Markets loaded: {len(markets)}")
    except Exception as e:
        print(f"Load Markets Failed: {e}")
        
    finally:
        await exchange.close()

if __name__ == "__main__":
    asyncio.run(test_minimal())
