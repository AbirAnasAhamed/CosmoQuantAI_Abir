import ccxt.async_support as ccxt
import asyncio
import logging
import sys

# Configure logging to stdout
handler = logging.StreamHandler(sys.stdout)
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
handler.setFormatter(formatter)
logger = logging.getLogger()
logger.setLevel(logging.INFO)
logger.addHandler(handler)

async def test_binance():
    print("\n" + "="*50)
    print("STARTING BINANCE FUTURES TEST")
    print("="*50)
    exchange = ccxt.binance({'enableRateLimit': True, 'options': {'defaultType': 'future'}})
    try:
        symbol = 'DOGE/USDT:USDT'
        print(f"DEBUG: Fetching order book for {symbol}...")
        ob = await exchange.fetch_order_book(symbol, limit=200)
        print(f"RESULT: Success! Bids={len(ob['bids'])}, Asks={len(ob['asks'])}")
        
        print(f"DEBUG: Fetching ticker for {symbol}...")
        ticker = await exchange.fetch_ticker(symbol)
        print(f"RESULT: Ticker Last={ticker['last']}")
    except Exception as e:
        print(f"RESULT: FAILURE - {type(e).__name__}: {str(e)}")
    finally:
        await exchange.close()

async def test_kucoin():
    print("\n" + "="*50)
    print("STARTING KUCOIN FUTURES TEST")
    print("="*50)
    exchange = ccxt.kucoinfutures({'enableRateLimit': True})
    try:
        symbol = 'DOGE/USDT:USDT'
        print("DEBUG: Loading markets to verify symbol...")
        markets = await exchange.load_markets()
        if symbol not in markets:
            print(f"DEBUG: {symbol} NOT in markets.")
            matches = [s for s in markets.keys() if 'DOGE' in s]
            print(f"DEBUG: Similar symbols found: {matches}")
            if matches:
                symbol = matches[0]
                print(f"DEBUG: Switching to {symbol}")
        
        print(f"DEBUG: Fetching OHLCV for {symbol}...")
        ohlcv = await exchange.fetch_ohlcv(symbol, timeframe='1m', limit=10)
        print(f"RESULT: Success! Fetched {len(ohlcv)} candles.")
        
        print(f"DEBUG: Fetching order book for {symbol}...")
        ob = await exchange.fetch_order_book(symbol, limit=20)
        print(f"RESULT: Success! Bids={len(ob['bids'])}, Asks={len(ob['asks'])}")
    except Exception as e:
        print(f"RESULT: FAILURE - {type(e).__name__}: {str(e)}")
    finally:
        await exchange.close()

async def main():
    await test_binance()
    await test_kucoin()
    print("\n" + "="*50)
    print("TESTS COMPLETED")
    print("="*50)

if __name__ == "__main__":
    asyncio.run(main())
