import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path('/app').resolve()))
from app.db.database import SessionLocal
from app.models.bots import Bot
from app.services.ccxt_service import ExchangeService

async def test_kucoin_margin():
    db = SessionLocal()
    # Find the active kucoin bot
    bot = db.query(Bot).filter(Bot.exchange == 'kucoin', Bot.market == 'DOGE/USDT:USDT').first()
    if not bot:
        print("Bot not found!")
        return

    exchange_service = ExchangeService()
    public_ex, private_ex = await exchange_service.init_exchange(bot.exchange, bot.owner_id)
    
    print(f"Testing Margin for {bot.market} on {bot.exchange}")
    
    try:
        print("1. Attempting set_margin_mode('cross')")
        # Notice we don't pass marginMode in params! That was my previous fix!
        # Wait, CCXT handles marginMode casing natively for Kucoin, passing it in params overrides it and breaks it
        # Try exactly what we patched in wall_hunter_futures.py:
        res = await private_ex.set_margin_mode('cross', bot.market)
        print("Success!", res)
    except Exception as e:
        print(f"FAILED set_margin_mode: {e}")
        
    try:
        print("\n2. Attempting set_leverage(10, {'marginMode': 'cross'})")
        res2 = await private_ex.set_leverage(10, bot.market, {'marginMode': 'cross'})
        print("Success!", res2)
    except Exception as e:
        print(f"FAILED set_leverage: {e}")

    await private_ex.close()
    await public_ex.close()
    db.close()

if __name__ == "__main__":
    asyncio.run(test_kucoin_margin())
