
import asyncio
import ccxt.async_support as ccxt
import json

async def test_exchange(exchange_id, symbol, options={}):
    print(f"\n--- Testing {exchange_id} with {symbol} and options={options} ---")
    exchange_class = getattr(ccxt, exchange_id)
    exchange = exchange_class({
        'enableRateLimit': True,
        **options
    })
    
    try:
        print("Fetching order book...")
        order_book = await exchange.fetch_order_book(symbol, limit=10)
        print("Success!")
        print(f"Bids: {len(order_book.get('bids', []))}")
    except Exception as e:
        print(f"Caught Exception: {type(e).__name__}: {str(e)}")
    finally:
        await exchange.close()

async def reproduce():
    # Test 1: binance with future options
    await test_exchange('binance', 'DOGE/USDT:USDT', {'options': {'defaultType': 'future'}})
    
    # Test 2: binance with swap options (just to compare)
    await test_exchange('binance', 'DOGE/USDT:USDT', {'options': {'defaultType': 'swap'}})

if __name__ == "__main__":
    asyncio.run(reproduce())
