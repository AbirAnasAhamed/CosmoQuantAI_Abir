
import asyncio
import ccxt.async_support as ccxt
import json

async def test_debug_response():
    exchange = ccxt.binanceusdm({
        'enableRateLimit': True,
    })
    
    print("\n--- Debugging Binance USDM 400 Response ---")
    try:
        # We know load_markets fails, so let's try to get the response
        await exchange.load_markets()
    except Exception as e:
        print(f"Error Type: {type(e).__name__}")
        print(f"Error Message: {e}")
        # CCXT exceptions usually have the original response in .text or .body
        if hasattr(e, 'response'):
             print(f"Response Body: {e.response}")
        
    finally:
        await exchange.close()

if __name__ == "__main__":
    asyncio.run(test_debug_response())
