"""
Verify Position Fetching and Pool Services
==========================================
"""

import asyncio
import sys
import os
import certifi
os.environ['SSL_CERT_FILE'] = certifi.where()

sys.path.insert(0, '/app')
os.environ.setdefault('DATABASE_URL', 'postgresql://cosmouser:secure_password_here@cosmoquant_db:5432/cosmoquant_db')

from app.services.manual_trade_service import manual_trade_service
from app.api.v1.endpoints.trading import OrderRequest
from app.db.session import SessionLocal
from app import models
from app.core.security import decrypt_key

# ---- কনফিগ ----
EXCHANGE_NAME = "mexc"
SYMBOL_SPOT = "DOGE/USDC"
SYMBOL_FUTURES = "DOGE/USDT:USDT"

def get_first_key_id() -> int:
    db = SessionLocal()
    try:
        user = db.query(models.User).first()
        key = db.query(models.ApiKey).filter(
            models.ApiKey.exchange == EXCHANGE_NAME,
            models.ApiKey.is_enabled == True
        ).first()
        if not key:
            print(f"❌ No active {EXCHANGE_NAME} API Key found!")
            sys.exit(1)
        return key.user_id, key.id
    finally:
        db.close()


async def verify():
    print("\n" + "="*50)
    print("   🔍 Verification Script: Position & Balance")
    print("="*50)
    
    user_id, key_id = get_first_key_id()
    
    db = SessionLocal()
    try:
        # ---- ১. Spot Check ----
        print(f"\n[1] Testing Spot Symbol: {SYMBOL_SPOT}")
        try:
            spot_bal = await manual_trade_service.get_fast_balance(db, user_id, key_id, SYMBOL_SPOT)
            print("   ✅ Spot Balance fetched!")
            print(f"      Base ({spot_bal['base']}): {spot_bal['base_free']}")
            print(f"      Quote ({spot_bal['quote']}): {spot_bal['quote_free']}")
            
            spot_pos = await manual_trade_service.get_active_position(db, user_id, key_id, SYMBOL_SPOT)
            print(f"   ✅ Spot Position fetched! Result: {spot_pos}")
        except Exception as e:
            print(f"   ❌ Spot Test Failed: {e}")

        # ---- ২. Futures Check ----
        print(f"\n[2] Testing Futures Symbol: {SYMBOL_FUTURES}")
        try:
            fut_bal = await manual_trade_service.get_fast_balance(db, user_id, key_id, SYMBOL_FUTURES)
            print("   ✅ Futures Balance fetched!")
            print(f"      Quote ({fut_bal['quote']}): {fut_bal['quote_free']}")
            
            fut_pos = await manual_trade_service.get_active_position(db, user_id, key_id, SYMBOL_FUTURES)
            print(f"   ✅ Futures Position fetched!")
            print(f"      Size: {fut_pos['amount']} | Side: {fut_pos['side'].upper()}")
        except Exception as e:
            print(f"   ❌ Futures Test Failed: {e}")
            
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(verify())
