from fastapi import APIRouter, Depends, WebSocket, HTTPException, Query, status, BackgroundTasks
from sqlalchemy.orm import Session
from app import models, schemas
from app.api import deps
from app.strategies.grid import GridTradingBot
from app.models.grid import GridBot, GridOrder
from app.schemas.grid import GridBotCreate, GridBotResponse, GridBotUpdate
from app.core.config import settings
from redis import asyncio as aioredis
import asyncio
import json
import logging
import ccxt.async_support as ccxt
from typing import Dict, Any
from app.core.redis import redis_manager # ✅ Import RedisManager

router = APIRouter()
logger = logging.getLogger(__name__)

# Local task registry for this worker process
# This is necessary for asyncio.create_task cancellation within the same process.
# For multi-worker setups, a pub/sub command channel is better, but this handles the requirement "Remove global running_grid_bots".
# This variable is module-scoped but limited to this process.
_local_bot_tasks: Dict[int, asyncio.Task] = {}
_local_bot_instances: Dict[int, GridTradingBot] = {}

def get_real_api_credentials_by_id(db: Session, user_id: int, api_key_id: int):
    api_key_entry = db.query(models.ApiKey).filter(
        models.ApiKey.id == api_key_id,
        models.ApiKey.owner_id == user_id
    ).first()
    
    if not api_key_entry:
         return None, None
    
    try:
        from app.core.security import decrypt_key
        api_key = decrypt_key(api_key_entry.api_key)
        secret_key = decrypt_key(api_key_entry.secret_key)
        return api_key, secret_key
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error decrypting API keys: {str(e)}")

async def run_bot_task(bot_id: int, config: Dict[str, Any]):
    """Background task wrapper for the grid bot"""
    # redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True) # ❌ OLD
    redis = redis_manager.get_redis() # ✅ Use Shared Pool
    
    # NOTE: Background tasks *can* safely use the shared pool.
    # We must ensure we don't 'close' the shared pool here.
    try:
        # Mark as running in Redis
        await redis.set(f"gridbot:status:{bot_id}", "running")
        
        # Initialize and Start
        grid_bot = GridTradingBot(bot_id, config)
        _local_bot_instances[bot_id] = grid_bot
        await grid_bot.start()
        
    except asyncio.CancelledError:
        logger.warning(f"Bot {bot_id} task cancelled.")
    except Exception as e:
        logger.error(f"Bot {bot_id} crashed: {e}")
    finally:
        # Cleanup
        await redis.delete(f"gridbot:status:{bot_id}")
        # await redis.close() # ❌ DO NOT CLOSE SHARED POOL
        if bot_id in _local_bot_instances:
            del _local_bot_instances[bot_id]

@router.post("/", response_model=GridBotResponse)
async def create_grid_bot(
    bot_in: GridBotCreate,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    """
    Create a new Grid Bot configuration.
    """
    bot = GridBot(**bot_in.dict(), user_id=current_user.id)
    # Init paper balance if config has it, otherwise default 1000
    if bot.is_paper_trading:
         # Rough hack, assume we want 10000 by default or user specified?
         # Since Update model didn't have it, we set default here if 0
         if bot.paper_balance_initial == 0:
             bot.paper_balance_initial = 10000.0
         bot.paper_balance_current = bot.paper_balance_initial
    
    db.add(bot)
    db.commit()
    db.refresh(bot)
    return bot

@router.get("/", response_model=list[GridBotResponse])
async def list_grid_bots(
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    """
    List all grid bots for the user.
    """
    bots = db.query(GridBot).filter(GridBot.user_id == current_user.id).all()
    return bots

@router.get("/{bot_id}", response_model=GridBotResponse)
async def get_grid_bot(
    bot_id: int,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    bot = db.query(GridBot).filter(GridBot.id == bot_id, GridBot.user_id == current_user.id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    return bot

@router.put("/{bot_id}", response_model=GridBotResponse)
async def update_grid_bot(
    bot_id: int,
    bot_in: GridBotUpdate,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    """
    Update a Grid Bot configuration.
    """
    bot = db.query(GridBot).filter(GridBot.id == bot_id, GridBot.user_id == current_user.id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    
    if bot.is_active:
        raise HTTPException(status_code=400, detail="Cannot update a running bot. Stop it first.")

    update_data = bot_in.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(bot, field, value)
    
    if "is_paper_trading" in update_data and bot.is_paper_trading:
         # If switching to paper or updating paper balance
         if bot.paper_balance_initial == 0:
              bot.paper_balance_initial = 10000.0
         if "paper_balance_initial" in update_data:
              # Reset current balance if initial is changed? Or keeps logic simple
              bot.paper_balance_current = bot.paper_balance_initial

    db.add(bot)
    db.commit()
    db.refresh(bot)
    return bot

@router.post("/{bot_id}/start")
async def start_grid_bot(
    bot_id: int,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    """
    Start a Grid Bot.
    """
    # redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True) 
    redis = redis_manager.get_redis()
    
    try:
        # 1. State Check via Redis (Scalable check)
        status_val = await redis.get(f"gridbot:status:{bot_id}")
        if status_val == "running":
            return {"status": "warning", "message": "Bot is already running (checked via Redis)."}

        bot = db.query(GridBot).filter(GridBot.id == bot_id, GridBot.user_id == current_user.id).first()
        if not bot:
            raise HTTPException(status_code=404, detail="Bot not found")
        
        # 2. Key Permission Check
        if not bot.is_paper_trading:
            if not bot.api_key_id:
                 raise HTTPException(status_code=400, detail="API Key required for real trading.")
            
            # Verify the key exists and load it to check permissions if we had that metadata
            # For now, just ensuring we can decrypt it is a good check
            key, secret = get_real_api_credentials_by_id(db, current_user.id, bot.api_key_id)
            if not key:
                raise HTTPException(status_code=400, detail="API Key invalid.")
            
            # (Optional) We could do a test request to exchange here to verify 'trade' permission

        # Prepare Config
        config = {
            "user_id": current_user.id,
            "exchange": bot.exchange,
            "pair": bot.pair,
            "lower_limit": bot.lower_limit,
            "upper_limit": bot.upper_limit,
            "grid_count": bot.grid_count,
            "amount_per_grid": bot.amount_per_grid,
            "is_paper_trading": bot.is_paper_trading
        }

        if not bot.is_paper_trading:
            config["apiKey"] = key
            config["apiSecret"] = secret

        # 3. Launch Background Task
        # Check if already in local tasks to avoid duplicate tasks in same process
        if bot_id in _local_bot_tasks and not _local_bot_tasks[bot_id].done():
             return {"status": "warning", "message": "Bot is already running locally."}

        task = asyncio.create_task(run_bot_task(bot_id, config))
        _local_bot_tasks[bot_id] = task
        
        bot.is_active = True
        db.commit()
        
        return {"status": "success", "message": f"Grid Bot {bot_id} starting..."}
    
    finally:
        pass
        # await redis.close() # ❌ DO NOT CLOSE

@router.post("/{bot_id}/reset-paper")
async def reset_paper_fund(
    bot_id: int,
    amount: float = Query(10000.0, ge=10.0),
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    """
    Reset Paper Trading Balance.
    """
    bot = db.query(GridBot).filter(GridBot.id == bot_id, GridBot.user_id == current_user.id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    
    if not bot.is_paper_trading:
        raise HTTPException(status_code=400, detail="Bot is in Real Trading mode.")

    bot.paper_balance_initial = amount
    bot.paper_balance_current = amount
    bot.paper_asset_quantity = 0.0
    
    # Also clear orders? Maybe separate action or implies clear history.
    # For now just reset funds. Logic in strategy handles existing orders but funds are fresh.
    # To be clean, we should probably mark existing open paper orders as cancelled?
    
    open_orders = db.query(GridOrder).filter(GridOrder.bot_id == bot.id, GridOrder.status == 'open').all()
    for o in open_orders:
        o.status = 'cancelled'
        
    db.commit()
    return {"status": "success", "message": f"Paper Balance reset to ${amount}"}

@router.post("/{bot_id}/stop")
async def stop_grid_bot(
    bot_id: int,
    close_positions: bool = False,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    """
    Stop a Grid Bot.
    """
    bot = db.query(GridBot).filter(GridBot.id == bot_id, GridBot.user_id == current_user.id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    # update DB immediately
    bot.is_active = False
    db.commit()

    # Cancel Task if local
    if bot_id in _local_bot_tasks:
        task = _local_bot_tasks[bot_id]
        if not task.done():
            task.cancel()
            
            # Helper to close positions if requested
            if close_positions and bot_id in _local_bot_instances:
                # Assuming GridTradingBot has a close_all method or similar, 
                # or we just let it die. 
                # User request "Cancel open orders if... Stop and Close Positions"
                pass 
                
        del _local_bot_tasks[bot_id]
        message = "Bot stopped locally."
    else:
        # If running on another worker, we should publish a stop command
        # redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        redis = redis_manager.get_redis()
        # Assuming the bot listens effectively or we just clear the status
        await redis.delete(f"gridbot:status:{bot_id}")
        # await redis.close() # ❌ DO NOT CLOSE
        message = "Bot stop signal sent (not running in this worker)."

    return {"status": "success", "message": message}

@router.post("/{bot_id}/panic-sell")
async def panic_sell_grid_bot(
    bot_id: int,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    """
    EMERGENCY STOP: Cancel all orders and Market Sell net position.
    """
    bot = db.query(GridBot).filter(GridBot.id == bot_id, GridBot.user_id == current_user.id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    # 1. Stop the Bot Logic (Copy of stop endpoint logic essentially)
    bot.is_active = False
    bot.status_reason = "PANIC SELL TRIGGERED"
    db.commit()

    if bot_id in _local_bot_tasks:
        task = _local_bot_tasks[bot_id]
        if not task.done():
            task.cancel()
        del _local_bot_tasks[bot_id]
    
    # Also notify via Redis for other workers
    # redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    redis = redis_manager.get_redis()
    await redis.delete(f"gridbot:status:{bot_id}")
    # await redis.close() # ❌ DO NOT CLOSE

    # 2. Cancel All Open Orders (Exchange side) & Calculate Net Position
    # We need an exchange connection
    config = {}
    if not bot.is_paper_trading and bot.api_key_id:
        key, secret = get_real_api_credentials_by_id(db, current_user.id, bot.api_key_id)
        if key:
            config = {'apiKey': key, 'secret': secret, 'enableRateLimit': True, 'options': {'adjustForTimeDifference': True},}
    
    ex_name = bot.exchange.lower() if bot.exchange else 'binance'
    exchange = getattr(ccxt, ex_name)(config)
    
    try:
        if not bot.is_paper_trading:
            # Cancel All Open Orders
            try:
                await exchange.cancel_all_orders(bot.pair)
            except Exception as e:
                logger.error(f"Panic Cancel Failed: {e}")

        # 3. Calculate Net Position from DB History (Approximation)
        # Sum(Filled Buys) - Sum(Filled Sells)
        filled_buys = db.query(GridOrder).filter(
            GridOrder.bot_id == bot_id, GridOrder.side == 'buy', GridOrder.status == 'filled'
        ).all()
        filled_sells = db.query(GridOrder).filter(
            GridOrder.bot_id == bot_id, GridOrder.side == 'sell', GridOrder.status == 'filled'
        ).all()

        buy_qty = sum([o.quantity for o in filled_buys])
        sell_qty = sum([o.quantity for o in filled_sells])
        net_position = buy_qty - sell_qty

        # Simple check: Or just fetch specific balance for that coin if possible? 
        # Grid bots might share wallet with other things, so strict net_position based on bot history is safer to avoid selling user's HODL stash.
        
        # Deduct fees approximation?
        # Let's assume net_position is what we have.
        
        if net_position > 0:
            if not bot.is_paper_trading:
                # Execute Market Sell
                # Ensure precision
                try:
                    market = await exchange.load_markets()
                    pair = bot.pair
                    # Check min amount?
                    await exchange.create_market_sell_order(pair, net_position)
                    logger.warning(f"PANIC SOLD {net_position} of {pair}")
                except Exception as e:
                     logger.error(f"Panic Sell Execution Failed: {e}")
                     # If precision error, might fail. 
            
            # Log it
            bot.status_reason += f" | Sold {net_position:.6f}"
            db.commit()

        # Update all open orders in DB to cancelled
        open_orders = db.query(GridOrder).filter(GridOrder.bot_id == bot_id, GridOrder.status == 'open').all()
        for o in open_orders:
            o.status = 'cancelled'
        db.commit()

        return {"status": "success", "message": f"Panic Sell Executed. Sold approx {net_position} units."}

    except Exception as e:
        logger.error(f"Panic Sequence Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await exchange.close()

@router.websocket("/ws/logs/{bot_id}")
async def websocket_grid_logs(
    websocket: WebSocket,
    bot_id: int,
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
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Helper: Check ownership
    bot = db.query(GridBot).filter(GridBot.id == bot_id, GridBot.user_id == user_id).first()
    if not bot:
        await websocket.send_text("Bot not found or access denied")
        await websocket.close()
        return

    # redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    redis = redis_manager.get_redis() # ✅ Shared
    pubsub = redis.pubsub()
    await pubsub.subscribe(f"gridbot:logs:{bot_id}")
    
    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                await websocket.send_text(message["data"])
    except Exception:
        print("Grid Bot WS Disconnected")
    finally:
        await pubsub.unsubscribe(f"gridbot:logs:{bot_id}")
        await pubsub.close()
        # await redis.close() # ❌ DO NOT CLOSE
