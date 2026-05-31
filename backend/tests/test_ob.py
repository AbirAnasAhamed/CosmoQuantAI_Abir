import asyncio
import ccxt.pro as ccxtpro
import traceback

async def main():
    try:
        exchange = ccxtpro.kucoinfutures({'enableRateLimit': True})
        await exchange.load_markets()
        symbol = 'DOGE/USDT:USDT'
        orderbook = await exchange.watch_order_book(symbol, limit=20)
        print("Success")
        await exchange.close()
    except Exception as e:
        with open("error_log.txt", "w", encoding="utf-8") as f:
            f.write(str(e) + "\n" + traceback.format_exc())

if __name__ == "__main__":
    asyncio.run(main())
