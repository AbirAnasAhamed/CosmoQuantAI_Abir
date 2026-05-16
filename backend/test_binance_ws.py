import asyncio
import ccxt.pro as ccxtpro
import logging

logging.basicConfig(level=logging.INFO)

async def test_binance_ws():
    print("🚀 Initializing CCXT Pro Binance Client...")
    exchange = ccxtpro.binance({
        'enableRateLimit': True,
        'options': {'defaultType': 'spot'}
    })

    symbol = 'BTC/USDT'
    print(f"📡 Subscribing to {symbol} websockets...")

    async def watch_trades():
        try:
            print("[Trades] Waiting for trade updates...")
            # Watch trades 3 times
            for i in range(3):
                trades = await exchange.watch_trades(symbol)
                if trades:
                    latest = trades[-1]
                    print(f"✅ [Trades {i+1}/3] Got {len(trades)} trades. Latest Price: {latest.get('price')} at {latest.get('datetime')}")
        except Exception as e:
            print(f"❌ [Trades] Error: {e}")

    async def watch_order_book():
        try:
            print("[OrderBook] Waiting for orderbook updates...")
            # Watch orderbook 3 times
            for i in range(3):
                ob = await exchange.watch_order_book(symbol)
                if ob and 'bids' in ob and 'asks' in ob:
                    top_bid = ob['bids'][0][0] if ob['bids'] else None
                    top_ask = ob['asks'][0][0] if ob['asks'] else None
                    print(f"✅ [OrderBook {i+1}/3] Top Bid: {top_bid} | Top Ask: {top_ask}")
                await asyncio.sleep(1) # wait a bit before fetching next
        except Exception as e:
            print(f"❌ [OrderBook] Error: {e}")

    try:
        await asyncio.gather(watch_trades(), watch_order_book())
        print("🎉 Websocket Test Completed Successfully!")
    except Exception as e:
        print(f"❌ Critical Error during test: {e}")
    finally:
        await exchange.close()

if __name__ == "__main__":
    asyncio.run(test_binance_ws())
