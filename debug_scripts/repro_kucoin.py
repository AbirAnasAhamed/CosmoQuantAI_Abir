import ccxt.async_support as ccxt
import asyncio
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test():
    # In market_depth_service.py, it uses kucofutures if symbol has ':'
    exchange = ccxt.kucoinfutures({'enableRateLimit': True})
    try:
        # Kucoin Futures symbols often look like DOGEUSDTM or XBTUSDTM
        # But CCXT might handle DOGE/USDT:USDT if load_markets is called
        print("Loading markets...")
        markets = await exchange.load_markets()
        
        symbol = 'DOGE/USDT:USDT'
        if symbol not in markets:
            print(f"{symbol} not in markets. Searching for something similar...")
            matches = [s for s in markets.keys() if 'DOGE' in s]
            print(f"DOGE matches: {matches}")
            if matches:
                symbol = matches[0]
        
        print(f"Fetching fetch_ohlcv for {symbol}")
        ohlcv = await exchange.fetch_ohlcv(symbol, timeframe='1m', limit=10)
        print(f"Successfully fetched {len(ohlcv)} candles")
        if ohlcv:
            print(f"First candle: {ohlcv[0]}")
            
    except Exception as e:
        print(f"Error: {type(e).__name__}: {e}")
    finally:
        await exchange.close()

if __name__ == "__main__":
    asyncio.run(test())
