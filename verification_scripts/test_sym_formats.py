
import asyncio
import ccxt.async_support as ccxt

async def test_symbol_formats():
    exchange = ccxt.binanceusdm({
        'enableRateLimit': True,
        'verbose': True
    })
    
    symbols = ['DOGEUSDT', 'DOGE/USDT', 'DOGE/USDT:USDT']
    
    print("\n--- Testing Various Symbol Formats on Binance USDM ---")
    for sym in symbols:
        print(f"\n>>> TESTING SYMBOL: {sym} <<<")
        try:
            # fetch_ticker is usually more lenient than load_markets
            await exchange.fetch_ticker(sym)
            print(f"SUCCESS for {sym}!")
        except Exception as e:
            print(f"FAILED for {sym}: {e}")
            
    await exchange.close()

if __name__ == "__main__":
    asyncio.run(test_symbol_formats())
