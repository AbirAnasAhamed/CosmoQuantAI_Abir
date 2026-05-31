
import asyncio
import ccxt.async_support as ccxt

async def test_urls():
    exchange = ccxt.binance({
        'enableRateLimit': True,
        'options': {'defaultType': 'future'}
    })
    
    print("\n--- Testing Binance Futures (v4.5.36) ---")
    print(f"Base URLs: {exchange.urls}")
    
    try:
        # Load markets uses the public API
        print("\nLoading markets...")
        await exchange.load_markets()
        print("Success!")
    except Exception as e:
        print(f"Failed: {e}")
        # Try to see where it failed
        if hasattr(exchange, 'last_http_response'):
            print(f"Status: {exchange.last_http_status}")
            print(f"Response: {exchange.last_http_response}")
    finally:
        await exchange.close()

if __name__ == "__main__":
    asyncio.run(test_urls())
