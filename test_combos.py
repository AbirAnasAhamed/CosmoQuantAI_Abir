
import asyncio
import ccxt.async_support as ccxt

async def test_combos():
    combos = [
        ('binance', 'DOGE/USDT', 'future'),
        ('binance', 'DOGE/USDT:USDT', 'future'),
        ('binance', 'DOGE/USDT', 'swap'),
        ('binance', 'DOGEUSDT', 'future'),
    ]
    
    for ex_id, sym, dtype in combos:
        print(f"\n--- Testing {ex_id} | {sym} | {dtype} ---")
        exchange = getattr(ccxt, ex_id)({
            'enableRateLimit': True,
            'options': {'defaultType': dtype}
        })
        try:
            # Try to load markets first to see if the whole API is down or just the symbol
            print("Loading markets...")
            await exchange.load_markets()
            print("Markets Loaded!")
            
            # Now try book
            book = await exchange.fetch_order_book(sym, limit=5)
            print(f"Book Success! Bids: {len(book['bids'])}")
        except Exception as e:
            print(f"Failed: {e}")
        finally:
            await exchange.close()

if __name__ == "__main__":
    asyncio.run(test_combos())
