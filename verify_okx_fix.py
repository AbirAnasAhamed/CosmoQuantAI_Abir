import ccxt.async_support as ccxt
import asyncio
import sys

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

async def test_okx_fix():
    print("Testing OKX API Connection (WITH User-Agent)...", flush=True)
    exchange = ccxt.okx({
        'enableRateLimit': True,
        'userAgent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    })
    
    try:
        symbol = 'BTC/USDT'
        print(f"Fetching trades for {symbol}...", flush=True)
        trades = await exchange.fetch_trades(symbol, limit=5)
        print(f"Success! Fetched {len(trades)} trades.", flush=True)
        for trade in trades:
            print(f"Trade: {trade['price']} {trade['amount']}", flush=True)
    except Exception as e:
        print(f"CAUGHT ERROR: {type(e).__name__}: {e}", flush=True)
    finally:
        await exchange.close()
        print("Exchange closed.", flush=True)

if __name__ == "__main__":
    try:
        asyncio.run(test_okx_fix())
    except Exception as e:
        print(f"Main Loop Error: {e}", flush=True)
