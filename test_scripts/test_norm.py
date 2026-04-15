
import asyncio
import ccxt.async_support as ccxt

async def test_normalization():
    # symbols_to_test = ['DOGE/USDT:USDT', 'DOGE/USDT']
    # If the user passes DOGE/USDT:USDT, maybe Binance Spot API is hit because CCXT doesn't recognize it as a valid spot symbol but also fails to route it to futures if the symbol looks 'wrong' to it.
    
    exchange = ccxt.binance({
        'enableRateLimit': True,
        'options': {'defaultType': 'future'}
    })
    
    try:
        print("Testing DOGE/USDT (standard) on Futures...")
        book = await exchange.fetch_order_book('DOGE/USDT', limit=5)
        print(f"Success! Bids: {len(book['bids'])}")
        
        print("\nTesting DOGEUSDT (no slash) on Futures...")
        book2 = await exchange.fetch_order_book('DOGEUSDT', limit=5)
        print(f"Success! Bids: {len(book2['bids'])}")
    except Exception as e:
        print(f"Failed: {e}")
    finally:
        await exchange.close()

if __name__ == "__main__":
    asyncio.run(test_normalization())
