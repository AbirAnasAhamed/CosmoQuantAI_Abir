from typing import List, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect # ✅ WebSocket ইম্পোর্ট যোগ করা হয়েছে
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from redis import asyncio as aioredis # ✅ Async Redis ইম্পোর্ট (pip install redis)
import json
import logging
import asyncio
from datetime import datetime

from app import models, schemas
from app.api import deps
from app.db.session import SessionLocal 
from app.tasks import run_live_bot_task
from app import utils
from app.models.trade import Trade
from app.schemas.trade import TradeResponse
from app.core.config import settings # ✅ সেটিংস ইম্পোর্ট
from fastapi import Request # ✅ Request ইম্পোর্ট যোগ করা হয়েছে



logger = logging.getLogger(__name__)


router = APIRouter()

# ✅ Heartbeat Helper
async def send_heartbeat(websocket: WebSocket, interval: int = 30):
    """
    Sends a ping message every `interval` seconds.
    """
    try:
        while True:
            await asyncio.sleep(interval)
            # Check if socket is still open? 
            # WebSocket.send_text will raise error if closed.
            await websocket.send_text(json.dumps({
                "type": "ping", 
                "timestamp": datetime.utcnow().timestamp()
            }))
    except Exception as e:
        # Expected when socket closes or other error
        pass


from pydantic import BaseModel

class EmergencySellRequest(BaseModel):
    sell_type: str # "market" or "limit"

class PanicRequest(BaseModel):
    target: str # "all", "losing", "strategy_type"
    value: str = None

@router.get("/stats", response_model=Dict[str, Any])
def get_bot_stats(
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Get aggregated statistics for the user's bots.
    """
    # 1. Total Bots
    total_bots = db.query(models.Bot).filter(models.Bot.owner_id == current_user.id).count()
    
    # 2. Active Bots
    active_bots = db.query(models.Bot).filter(
        models.Bot.owner_id == current_user.id, 
        models.Bot.status == "active"
    ).count()
    
    # 3. Total PnL (Sum)
    total_pnl = db.query(func.sum(models.Bot.pnl)).filter(
        models.Bot.owner_id == current_user.id
    ).scalar() or 0.0
    
    # 4. Average Win Rate
    # Note: excluding bots with 0 win_rate might be desired, but for now we average all
    avg_win_rate = db.query(func.avg(models.Bot.win_rate)).filter(
        models.Bot.owner_id == current_user.id
    ).scalar() or 0.0

    return {
        "total_pnl": total_pnl,
        "average_win_rate": avg_win_rate,
        "active_bots": active_bots,
        "total_bots": total_bots
    }

@router.get("/", response_model=List[schemas.Bot])
def read_bots(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve bots belonging to the current user.
    """
    bots = db.query(models.Bot).filter(models.Bot.owner_id == current_user.id).offset(skip).limit(limit).all()
    
    # Calculate Equity History for each bot
    for bot in bots:
        # Fetch last 20 trades (Most recent first)
        trades = db.query(Trade).filter(Trade.bot_id == bot.id).order_by(Trade.opened_at.desc()).limit(20).all()
        
        if not trades:
            bot.equity_history = []
            continue

        # Backward Reconstruction Method
        # 1. Start with current total equity
        initial_cash = bot.trade_value or 0.0
        current_equity = initial_cash + (bot.pnl or 0.0)
        
        history = [current_equity]
        
        # 2. Reconstruct backwards
        for trade in trades:
            # Before this trade, equity was (current - trade.pnl)
            # trade.pnl might be None, handle safely
            t_pnl = trade.pnl or 0.0
            current_equity -= t_pnl
            history.insert(0, current_equity)
            
        bot.equity_history = history

    return bots

@router.post("/", response_model=schemas.Bot)
def create_bot(
    *,
    db: Session = Depends(deps.get_db),
    bot_in: schemas.BotCreate,
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Create new bot.
    """
    # ✅ ফিক্স: model_dump থেকে 'status' বাদ দেওয়া হয়েছে যাতে কনফ্লিক্ট না হয়
    bot_data = bot_in.model_dump(exclude={"status"}) 
    
    bot = models.Bot(
        **bot_data,
        owner_id=current_user.id,
        status="inactive" # ডিফল্ট স্ট্যাটাস সেট করা হচ্ছে
    )
    db.add(bot)
    db.commit()
    db.refresh(bot)
    return bot

@router.put("/{bot_id}", response_model=schemas.Bot)
async def update_bot(
    *,
    request: Request,
    db: Session = Depends(deps.get_db),
    bot_id: int,
    bot_in: schemas.BotUpdate,
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Update a bot configuration.
    """
    bot = db.query(models.Bot).filter(models.Bot.id == bot_id, models.Bot.owner_id == current_user.id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    
    update_data = bot_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(bot, field, value)
        
    db.add(bot)
    db.commit()
    db.refresh(bot)
    
    # NEW: If bot is active, try to apply config live
    if bot.status == "active" and hasattr(request.app.state, "bot_manager"):
        if "config" in update_data and update_data["config"]:
            await request.app.state.bot_manager.update_live_bot(bot_id, update_data["config"])
            
    return bot

@router.delete("/{bot_id}", response_model=schemas.Bot)
async def delete_bot(
    *,
    request: Request,
    db: Session = Depends(deps.get_db),
    bot_id: int,
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Delete a bot. If the bot is running, it force-stops the background task first.
    """
    bot = db.query(models.Bot).filter(models.Bot.id == bot_id, models.Bot.owner_id == current_user.id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
        
    try:
        # ✅ Safe Shutdown Protocol (Zombie Bot Protection)
        if hasattr(request.app.state, "bot_manager"):
            manager = request.app.state.bot_manager
            
            # 1. Cancel Open Orders (if bot is currently running in memory)
            if bot_id in manager.active_bots:
                bot_instance = manager.active_bots[bot_id]
                
                if bot_instance == "STARTING":
                    # Bot is still starting, hasn't placed orders yet. Just let the stop_bot handle to abort it.
                    logger.warning(f"⚠️ Bot {bot_id} is STARTING, cannot cancel specific exchange orders yet. Proceeding to force stop.")
                else:
                    # 🛡️ Institutional-Grade Exchange Locator (Handles Basic & WallHunter Architectures)
                    target_exchange = getattr(bot_instance, 'exchange', None)
                    if not target_exchange and hasattr(bot_instance, 'engine'):
                        target_exchange = getattr(bot_instance.engine, 'exchange', None)
                        
                    if target_exchange:
                        logger.info(f"🛑 specific-cancel: Cancelling orders for bot {bot_id} before deletion...")
                        try:
                            # Use getattr to safely fetch symbol (Spot/Futures might use 'symbol' or 'bot.market')
                            target_symbol = getattr(bot_instance, 'symbol', bot_instance.bot.market)
                            await target_exchange.cancel_all_orders(target_symbol)
                        except Exception as ex_cancel:
                            logger.error(f"❌ Failed to cancel orders for bot {bot_id}: {ex_cancel}")
                            logger.warning(f"⚠️ Proceeding with deletion despite order cancellation failure (Possible revoked API keys).")
            
            # 2. Force Stop (Will abort "STARTING" instances as well)
            await manager.stop_bot(bot_id, db)
        else:
            # Should not happen in normal operation if server is running correctly
            logger.warning("BotManager not initialized in app.state")

    except Exception as e:
        logger.error(f"Error stopping bot {bot_id} before deletion: {e}")
        # 🛑 FAIL-SAFE: We won't block deletion here anymore, because if it's already a zombie
        # or has invalid keys, blocking deletion traps the user.
        logger.warning(f"Proceeding with bot {bot_id} deletion despite stop failure.")
            
    db.delete(bot)
    db.commit()
    return bot

@router.post("/{bot_id}/action", response_model=schemas.Bot)
async def control_bot(
    *,
    request: Request,
    db: Session = Depends(deps.get_db),
    bot_id: int,
    action: str, # "start", "stop"
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Start or Stop a bot instance using Celery & Redis.
    """
    bot = db.query(models.Bot).filter(models.Bot.id == bot_id, models.Bot.owner_id == current_user.id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    
    r = utils.get_redis_client()
    task_key = f"bot_task:{bot_id}"

    if action == "start":
        if bot.status == "active":
            raise HTTPException(status_code=400, detail="Bot is already running")
            
        # ✅ BotManager Call
        result = await request.app.state.bot_manager.start_bot(bot_id, db)
        if result['status'] == 'error':
             raise HTTPException(status_code=500, detail=result['message'])
        
    elif action == "stop":
        # ✅ BotManager Call
        result = await request.app.state.bot_manager.stop_bot(bot_id, db)
        # Even if error, we might want to force status update?
        # But Manager updates DB.
        
    db.refresh(bot)
    return bot

@router.post("/{bot_id}/emergency_sell", response_model=Dict[str, Any])
async def emergency_sell_bot(
    *,
    request: Request,
    db: Session = Depends(deps.get_db),
    bot_id: int,
    sell_in: EmergencySellRequest,
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Emergency sell a bot's active position.
    """
    bot = db.query(models.Bot).filter(models.Bot.id == bot_id, models.Bot.owner_id == current_user.id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
        
    if bot.status != "active":
        raise HTTPException(status_code=400, detail="Bot is not currently active")
        
    if not hasattr(request.app.state, "bot_manager"):
         raise HTTPException(status_code=500, detail="BotManager not available")
         
    try:
        result = await request.app.state.bot_manager.emergency_sell_bot(bot_id, sell_in.sell_type)
        if result['status'] == 'error':
             raise HTTPException(status_code=500, detail=result['message'])
        return result
    except Exception as e:
        logger.error(f"Emergency sell failed for bot {bot_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{bot_id}/trades", response_model=List[TradeResponse])
def get_bot_trades(
    bot_id: int,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user),
):
    """
    Get trade history for a specific bot.
    """
    # 1. Check Bot (User Authenticated)
    bot = db.query(models.Bot).filter(models.Bot.id == bot_id, models.Bot.owner_id == current_user.id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
        
    # 2. Return Trade List
    trades = db.query(Trade).filter(Trade.bot_id == bot_id).order_by(Trade.opened_at.desc()).offset(skip).limit(limit).all()
    return trades

# ✅ নতুন WebSocket Endpoint: লাইভ লগ দেখার জন্য
@router.websocket("/{bot_id}/ws/logs")
async def websocket_bot_logs(
    websocket: WebSocket, 
    bot_id: int
):
    """
    Real-time logs for a specific bot via WebSocket & Redis Pub/Sub.
    URL: ws://localhost:8000/api/v1/bots/{bot_id}/ws/logs
    """
    await websocket.accept()
    
    # ✅ Use Global Redis Pool from app.state
    # Note: aioredis pool is attached to app.state.redis
    if not hasattr(websocket.app.state, "redis") or websocket.app.state.redis is None:
        logger.error("❌ Redis pool not initialized in app.state")
        await websocket.close(code=1011) # Internal Error
        return

    redis = websocket.app.state.redis
    pubsub = redis.pubsub()
    
    # নির্দিষ্ট বটের চ্যানেলে সাবস্ক্রাইব করা
    channel_name = f"bot_logs:{bot_id}"
    list_key = f"bot_logs_list:{bot_id}"
    
    # 🟢 Send Recent History First
    print(f"[WS LOGS] Connecting Bot {bot_id}...")
    try:
        # Use pool to get history
        recent_logs = await redis.lrange(list_key, 0, -1)
        print(f"[WS LOGS] Found {len(recent_logs)} historical logs for {bot_id}")
        for log_data in recent_logs:
             # Ensure string payload
             if isinstance(log_data, bytes):
                 log_text = log_data.decode("utf-8")
             else:
                 log_text = str(log_data)
             await websocket.send_text(log_text)
        print(f"[WS LOGS] Finished sending historical logs.")
    except Exception as e:
        logger.error(f"⚠️ History Log Error: {e}")
        print(f"[WS LOGS] History Error: {e}")

    print(f"[WS LOGS] Subscribing to channel {channel_name}...")
    await pubsub.subscribe(channel_name)
    
    try:
        # ✅ Start Heartbeat Task
        pinger_task = asyncio.create_task(send_heartbeat(websocket))

        print(f"[WS LOGS] Waiting for pubsub messages...")
        # Redis থেকে মেসেজ আসার জন্য অপেক্ষা এবং ফ্রন্টএন্ডে পাঠানো
        async for message in pubsub.listen():
            if message["type"] == "message":
                msg_data = message["data"]
                if isinstance(msg_data, bytes):
                    msg_text = msg_data.decode("utf-8")
                else:
                    msg_text = str(msg_data)
                
                await websocket.send_text(msg_text)
                print(f"[WS LOGS] Pushed Live Message.")
        
        print(f"[WS LOGS] pubsub.listen() exited loop unexpectedly!")
    except WebSocketDisconnect:
        logger.debug(f"🔌 Client disconnected from bot {bot_id} logs")
        print(f"[WS LOGS] Client disconnected normally.")
    except Exception as e:
        logger.error(f"⚠️ WebSocket Error: {e}")
        print(f"[WS LOGS] Fatal Error: {e}")
    finally:
        print(f"[WS LOGS] Cleaning up socket resources...")
        # কানেকশন বন্ধ হলে ক্লিনআপ - Just unsubscribe, do NOT close the shared redis pool!
        if 'pinger_task' in locals():
            pinger_task.cancel()
        await pubsub.unsubscribe(channel_name)
        await pubsub.close() 
        # await redis.close() # ❌ DO NOT CLOSE GLOBAL POOL

@router.post("/panic", response_model=Dict[str, Any])
async def panic_stop(
    *,
    request: Request,
    panic_in: PanicRequest,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Granular Panic Button: Stop bots based on specific criteria.
    Targets:
    - 'all': Stop ALL active bots.
    - 'losing': Stop bots with negative PnL.
    - 'strategy_type': Stop bots matching a specific strategy (e.g., 'grid_trading').
    """
    if not hasattr(request.app.state, "bot_manager"):
         raise HTTPException(status_code=500, detail="BotManager not available")
    
    manager = request.app.state.bot_manager
    stopped_count = 0
    message = ""

    # 1. Identify Bots to Stop
    bots_to_stop = []

    if panic_in.target == "all":
        # Emergency: Stop everything currently running in Memory
        # We use list(keys) to avoid runtime error if dict changes size
        bots_to_stop = list(manager.active_bots.keys())
        message = "Emergency Protocol: Stopping ALL active bots."

    elif panic_in.target == "losing":
        # Stop active bots that are losing money
        # We query DB for status='active' AND owner=user AND pnl < 0
        # But Manager knows what is actually running. Better to check running ones?
        # A bot might be 'active' in DB but crashed in Manager. 
        # Safer to intersect Manager.active_bots with DB criteria.
        
        active_ids = list(manager.active_bots.keys())
        if not active_ids:
             return {"message": "No active bots to panic stop.", "stopped_count": 0}

        losing_bots = db.query(models.Bot).filter(
            models.Bot.id.in_(active_ids),
            models.Bot.owner_id == current_user.id, # Security check
            models.Bot.pnl < 0
        ).all()
        
        bots_to_stop = [b.id for b in losing_bots]
        message = f"Stopping {len(bots_to_stop)} losing bots."

    elif panic_in.target == "strategy_type":
        if not panic_in.value:
            raise HTTPException(status_code=400, detail="Value required for strategy_type target")
            
        active_ids = list(manager.active_bots.keys())
        if not active_ids:
             return {"message": "No active bots to stop.", "stopped_count": 0}

        # Case-insensitive match on strategy name
        # We need to check how strategy is stored. It's a string in Bot model.
        # Assuming partial or exact match? Exact likely safer for "grid" vs "grid_v2".
        # Let's do ILIKE or standard ==
        
        target_bots = db.query(models.Bot).filter(
            models.Bot.id.in_(active_ids),
            models.Bot.owner_id == current_user.id,
            models.Bot.strategy == panic_in.value # Exact match, case sensitive? 
            # Often frontend sends "grid", backend might have "Grid Trading".
            # Let's assume frontend sends exact string found in DB or we do ilike.
            # For robustness: func.lower(models.Bot.strategy) == panic_in.value.lower()
        ).filter(func.lower(models.Bot.strategy) == panic_in.value.lower()).all()
        
        bots_to_stop = [b.id for b in target_bots]
        message = f"Stopping {len(bots_to_stop)} bots with strategy '{panic_in.value}'."
    
    else:
        raise HTTPException(status_code=400, detail="Invalid panic target")

    # 2. Execute Stop
    results = []
    for bot_id in bots_to_stop:
        try:
             # Ensure we only stop what we govern? 
             # The DB query already filtered by owner_id for losing/strategy.
             # For 'all', manager.active_bots might contain other users' bots?
             # Wait, BotManager is a Singleton! It contains ALL users' bots if the system is multi-tenant?
             # If multi-tenant, we MUST check owner_id for 'all' too!
             
             # SECURITY FIX for 'all':
             if panic_in.target == "all":
                 bot = db.query(models.Bot).filter(models.Bot.id == bot_id).first()
                 if not bot or bot.owner_id != current_user.id:
                     continue # Skip bots not owned by user
             
             res = await manager.stop_bot(bot_id, db)
             results.append(res)
             stopped_count += 1
        except Exception as e:
            logger.error(f"Panic stop failed for bot {bot_id}: {e}")
            results.append({"status": "error", "bot_id": bot_id, "message": str(e)})

    return {
        "message": message,
        "stopped_count": stopped_count,
        "details": results
    }

# ✅ Status WebSocket Endpoint
@router.websocket("/{bot_id}/ws/status")
async def websocket_bot_status(
    websocket: WebSocket, 
    bot_id: int
):
    """
    Real-time status updates (PnL, Price, Active State).
    URL: ws://localhost:8000/api/v1/bots/{bot_id}/ws/status
    """
    await websocket.accept()
    
    if not hasattr(websocket.app.state, "redis") or websocket.app.state.redis is None:
        logger.error("❌ Redis pool not initialized in app.state")
        await websocket.close(code=1011) 
        return

    redis = websocket.app.state.redis
    pubsub = redis.pubsub()
    channel_name = f"bot_status:{bot_id}"
    await pubsub.subscribe(channel_name)
    
    # ✅ Start Heartbeat Task
    pinger_task = asyncio.create_task(send_heartbeat(websocket))

    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                await websocket.send_text(message["data"])
    except WebSocketDisconnect:
        pass
    except Exception as e:
        # Silence common disconnect/close errors to prevent terminal spam
        if "send" not in str(e).lower() and "close" not in str(e).lower():
            logger.error(f"⚠️ Status WS Error: {e}")
    finally:
        if 'pinger_task' in locals():
            pinger_task.cancel()
        await pubsub.unsubscribe(channel_name)
        await pubsub.close()
        # await redis.close() # ❌ DO NOT CLOSE GLOBAL POOL
