import asyncio
import ccxt.pro as ccxtpro

async def main():
    exchange = ccxtpro.kucoinfutures()
    await exchange.load_markets()
    market = exchange.markets['DOGE/USDT:USDT']
    print("Contract Size:", market.get('contractSize'))
    print("Amount Precision:", market['precision']['amount'])
    await exchange.close()

if __name__ == "__main__":
    asyncio.run(main())
