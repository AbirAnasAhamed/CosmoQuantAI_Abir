import ccxt.async_support as ccxt
import asyncio
import sys

# Set specific event loop policy for Windows if needed
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

async def test_okx():
    print("Testing OKX API Connection (No User-Agent)...", flush=True)
    exchange = ccxt.okx({
        'enableRateLimit': True,
    })
    
    try:
        symbol = 'BTC/USDT'
        print(f"Fetching trades for {symbol}...", flush=True)
        trades = await exchange.fetch_trades(symbol, limit=5)
        print(f"Success! Fetched {len(trades)} trades.", flush=True)
    except Exception as e:
        print(f"CAUGHT ERROR: {type(e).__name__}: {e}", flush=True)
    finally:
        await exchange.close()
        print("Exchange closed.", flush=True)

if __name__ == "__main__":
    try:
        asyncio.run(test_okx())
    except Exception as e:
        print(f"Main Loop Error: {e}", flush=True)
