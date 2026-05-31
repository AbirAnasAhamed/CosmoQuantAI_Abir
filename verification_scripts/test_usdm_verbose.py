
import asyncio
import ccxt.async_support as ccxt

async def test_usdm_verbose():
    exchange = ccxt.binanceusdm({
        'enableRateLimit': True,
        'verbose': True
    })
    
    print("\n--- Testing Binance USDM (VERBOSE) ---")
    try:
        # Ticker might be easier than order book for a quick test
        print("\nFetching DOGE/USDT ticker...")
        await exchange.fetch_ticker('DOGE/USDT')
        print("\nSUCCESS!")
    except Exception as e:
        print(f"\nFAILED: {e}")
    finally:
        await exchange.close()

if __name__ == "__main__":
    asyncio.run(test_usdm_verbose())
