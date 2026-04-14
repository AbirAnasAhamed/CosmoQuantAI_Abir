import asyncio
import os
import sys

# Set path and DB explicitly
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
os.environ['DATABASE_URL'] = 'postgresql://cosmouser:secure_password_here@localhost:5432/cosmoquant_db'

from app.db.session import SessionLocal
from app.services.manual_trade_service import manual_trade_service
from app import models

async def test():
    db = SessionLocal()
    try:
        # Find the first key
        key = db.query(models.ApiKey).first()
        if not key:
            print('No API Keys found in DB')
            return
        
        print(f"Testing with API Key ID: {key.id}, Exchange: {key.exchange}")
        res = await manual_trade_service.get_fast_balance(db, key.user_id, key.id, 'DOGE/USDT:USDT')
        print('SUCCESS:', res)
    except Exception as e:
        import traceback
        print('ERROR:', type(e), str(e))
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test())
