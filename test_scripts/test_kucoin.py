
import asyncio
import ccxt.async_support as ccxt

async def test_kucoin():
    symbol = 'DOGE/USDT:USDT'
    exchange = ccxt.kucoin({
        'enableRateLimit': True,
    })
    
    print("\n--- Testing Kucoin Futures ---")
    try:
        # await exchange.load_markets()
        print(f"Fetching order book for {symbol}...")
        book = await exchange.fetch_order_book(symbol, limit=5)
        print(f"SUCCESS! Bids: {len(book['bids'])}")
    except Exception as e:
        print(f"FAILED: {e}")
    finally:
        await exchange.close()

if __name__ == "__main__":
    asyncio.run(test_kucoin())
