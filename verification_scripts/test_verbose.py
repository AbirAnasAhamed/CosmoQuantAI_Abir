
import asyncio
import ccxt.async_support as ccxt
import json

async def test_verbose():
    params = {
        'enableRateLimit': True,
        'options': {'defaultType': 'future'},
        'verbose': True
    }
    exchange = ccxt.binance(params)
    
    print("\n--- Testing Binance Futures (VERBOSE) ---")
    try:
        # fetch_order_book usually doesn't need load_markets for standard symbols
        print("\nFetching DOGE/USDT Order Book...")
        book = await exchange.fetch_order_book('DOGE/USDT', limit=5)
        print("\nSUCCESS!")
    except Exception as e:
        print(f"\nFAILED: {e}")
    finally:
        await exchange.close()

if __name__ == "__main__":
    asyncio.run(test_verbose())
