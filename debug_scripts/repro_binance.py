import ccxt.async_support as ccxt
import asyncio
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test():
    exchange = ccxt.binance({'enableRateLimit': True, 'options': {'defaultType': 'future'}})
    try:
        symbol = 'DOGE/USDT:USDT'
        print(f"Fetching fetch_order_book for {symbol}")
        # The user was using limit=200
        ob = await exchange.fetch_order_book(symbol, limit=200)
        print("Successfully fetched order book")
        print(f"Bids: {len(ob['bids'])}, Asks: {len(ob['asks'])}")
        
        print(f"Fetching fetch_ticker for {symbol}")
        ticker = await exchange.fetch_ticker(symbol)
        print(f"Last price: {ticker['last']}")
    except Exception as e:
        print(f"Error: {type(e).__name__}: {e}")
    finally:
        await exchange.close()

if __name__ == "__main__":
    asyncio.run(test())
