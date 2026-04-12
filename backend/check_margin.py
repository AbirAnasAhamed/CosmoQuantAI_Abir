import asyncio
import ccxt.async_support as ccxt
import inspect

async def main():
    exchange = ccxt.kucoinfutures()
    print("set_margin_mode signature:", inspect.signature(exchange.set_margin_mode))
    print("set_leverage signature:", inspect.signature(exchange.set_leverage))
    
    print("\nset_margin_mode source:")
    print(inspect.getsource(exchange.set_margin_mode))
    
    print("\nset_leverage source:")
    print(inspect.getsource(exchange.set_leverage))

if __name__ == "__main__":
    asyncio.run(main())
