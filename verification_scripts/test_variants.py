
import asyncio
import ccxt.async_support as ccxt

async def test_binance_variants():
    symbol = 'DOGE/USDT:USDT'
    
    print("\n--- Method 1: binance with defaultType: 'future' ---")
    exchange = ccxt.binance({
        'enableRateLimit': True,
        'options': {'defaultType': 'future'}
    })
    try:
        # ccxt documentation says for futures you should use the correct derivative class or set defaultType
        # but let's check what load_markets says
        markets = await exchange.load_markets()
        print(f"Bids (fetch_order_book): {len(await exchange.fetch_order_book(symbol, limit=5)['bids'])}")
    except Exception as e:
        print(f"Method 1 Failed: {e}")
    finally:
        await exchange.close()

    print("\n--- Method 2: binanceusdm (explicit class) ---")
    exchange = ccxt.binanceusdm({
        'enableRateLimit': True
    })
    try:
        markets = await exchange.load_markets()
        print(f"Bids (fetch_order_book): {len(await exchange.fetch_order_book(symbol, limit=5)['bids'])}")
    except Exception as e:
        print(f"Method 2 Failed: {e}")
    finally:
        await exchange.close()

if __name__ == "__main__":
    asyncio.run(test_binance_variants())
