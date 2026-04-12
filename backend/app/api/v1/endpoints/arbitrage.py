from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, HTTPException, Query, status
from sqlalchemy.orm import Session
from app import models, schemas
from app.api import deps
from app.services.arbitrage_engine import ArbitrageBotInstance, running_arbitrage_bots
from app.models.arbitrage import ArbitrageBot
from app.schemas.arbitrage import ArbitrageBotCreate, ArbitrageBotResponse
from app.core.config import settings
from redis import asyncio as aioredis
import json
import asyncio

from app.core.redis import redis_manager # ✅ Import RedisManager

router = APIRouter()

def get_real_api_credentials(db: Session, user_id: int, exchange: str, label: str):
    """
    Helper function to fetch decrypted API keys from DB.
    """
    # Fetch by user_id, exchange, and label (mapped to ApiKey.name)
    api_key_entry = db.query(models.ApiKey).filter(
        models.ApiKey.user_id == user_id,
        models.ApiKey.exchange == exchange,
        models.ApiKey.name == label  # Matching label to ApiKey.name
    ).first()
    
    if not api_key_entry:
         raise HTTPException(status_code=400, detail=f"API Key '{label}' for '{exchange}' not found. Please add it in Settings.")
    
    # Decrypt keys
    try:
        from app.core.security import decrypt_key
        api_key = decrypt_key(api_key_entry.api_key)
        secret_key = decrypt_key(api_key_entry.secret_key)
        return api_key, secret_key
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error decrypting API keys: {str(e)}")


@router.post("/start", response_model=ArbitrageBotResponse)
async def start_arbitrage_bot(
    config: ArbitrageBotCreate,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    """
    Start the Arbitrage Engine & Save Config to DB.
    """
    user_id = current_user.id
    
    # 1. Check & Stop existing bot if running
    if user_id in running_arbitrage_bots:
        await running_arbitrage_bots[user_id].stop()
    
    # 2. Get Real API Keys from DB (Only if NOT Paper Trading)
    key_a_pub, key_a_sec = "", ""
    key_b_pub, key_b_sec = "", ""

    if not config.is_paper_trading:
        key_a_pub, key_a_sec = get_real_api_credentials(db, user_id, config.exchange_a, config.api_key_a_label)
        key_b_pub, key_b_sec = get_real_api_credentials(db, user_id, config.exchange_b, config.api_key_b_label)

    # 3. Save/Update Config in DB
    # Check if a bot entry already exists for this user to avoid duplicates
    bot_entry = db.query(ArbitrageBot).filter(ArbitrageBot.user_id == user_id).first()
    if not bot_entry:
        bot_entry = ArbitrageBot(**config.dict(), user_id=user_id)
        db.add(bot_entry)
    else:
        # Update existing entry
        for key, value in config.dict().items():
            setattr(bot_entry, key, value)
    
    bot_entry.is_active = True
    db.commit()
    db.refresh(bot_entry)

    # 4. Prepare Engine Config
    engine_config = config.dict()
    engine_config.update({
        'apiKeyA_public': key_a_pub,
        'apiKeyA_secret': key_a_sec,
        'apiKeyB_public': key_b_pub,
        'apiKeyB_secret': key_b_sec
    })

    # 5. Start Engine
    bot_instance = ArbitrageBotInstance(user_id, engine_config)
    running_arbitrage_bots[user_id] = bot_instance
    
    asyncio.create_task(bot_instance.start())

    return bot_entry

@router.post("/stop")
async def stop_arbitrage_bot(
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    """
    Stop the engine and update DB status.
    """
    user_id = current_user.id
    
    # Stop Memory Instance
    if user_id in running_arbitrage_bots:
        await running_arbitrage_bots[user_id].stop()
        del running_arbitrage_bots[user_id]
    
    # Update DB Status
    bot_entry = db.query(ArbitrageBot).filter(ArbitrageBot.user_id == user_id).first()
    if bot_entry:
        bot_entry.is_active = False
        db.commit()
    
    return {"status": "success", "message": "Engine Stopped"}

@router.websocket("/ws/logs")
async def websocket_arbitrage_logs(
    websocket: WebSocket,
    token: str = Query(None), 
    db: Session = Depends(deps.get_db)
):
    await websocket.accept()
    
    user_id = None
    if token:
        from app.core import security
        from app import crud
        payload = security.verify_token(token)
        if payload:
            email = payload.get("sub")
            if email:
                user = crud.get_user_by_email(db, email=email)
                if user:
                    user_id = user.id
    
    if not user_id:
        # Invalid token or no token
        print("WS Auth Failed")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    redis = redis_manager.get_redis() # ✅ Shared
    pubsub = redis.pubsub()
    await pubsub.subscribe(f"arbitrage:logs:{user_id}")
    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                await websocket.send_text(message["data"])
    except Exception:
        print("WS Disconnected")
    finally:
        await pubsub.unsubscribe(f"arbitrage:logs:{user_id}")
        await pubsub.close()
        # await redis.close() # ❌ DO NOT CLOSE
