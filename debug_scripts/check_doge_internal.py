import asyncio
from app.services.market_depth_service import market_depth_service

async def test():
    try:
        markets = await market_depth_service.get_exchange_markets('kucoin')
        doge = [m for m in markets if 'DOGE' in m]
        print(f"DOGE_SYMBOLS_START")
        for m in doge:
            print(m)
        print(f"DOGE_SYMBOLS_END")
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    asyncio.run(test())
