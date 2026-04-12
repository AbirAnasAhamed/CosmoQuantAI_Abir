from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api import deps
from app.api.v1.endpoints.grid_bot import get_real_api_credentials_by_id
from app.core.redis import redis_manager
from app.strategies.order_block_bot import OrderBlockBotTask
from typing import Dict, Any
import asyncio
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

# Local task registry
_local_ob_tasks: Dict[int, OrderBlockBotTask] = {}

class DummyOBBotModel:
    # Dummy mock model so we don't have to pollute the DB schema in this single task execution
    # Allows validation logic to work
    pass

@router.post("/{bot_id}/start")
async def start_ob_bot(
    bot_id: int,
    config: dict,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user)
):
    """
    Start an Order Block Bot
    `config` payload must contain: exchange, pair, trade_amount, is_paper_trading, api_key_id
    """
    redis = redis_manager.get_redis()
    
    status_val = await redis.get(f"obbot:status:{bot_id}")
    if status_val == "running":
        return {"status": "warning", "message": "Bot is already running."}
        
    is_paper = config.get("is_paper_trading", True)
    
    if not is_paper:
        api_key_id = config.get("api_key_id")
        if not api_key_id:
            raise HTTPException(status_code=400, detail="api_key_id required for real trading")
        key, secret = get_real_api_credentials_by_id(db, current_user.id, api_key_id)
        if not key:
            raise HTTPException(status_code=400, detail="Invalid API Key")
        config["apiKey"] = key
        config["apiSecret"] = secret
        
    await redis.set(f"obbot:status:{bot_id}", "running")
    
    bot_task = OrderBlockBotTask(bot_id, config)
    _local_ob_tasks[bot_id] = bot_task
    
    # Fire and forget start
    asyncio.create_task(bot_task.start())
    
    return {"status": "success", "message": f"Order Block Bot {bot_id} started."}

@router.post("/{bot_id}/stop")
async def stop_ob_bot(
    bot_id: int,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user)
):
    """
    Stop an Order Block Bot.
    """
    redis = redis_manager.get_redis()
    await redis.delete(f"obbot:status:{bot_id}")
    
    if bot_id in _local_ob_tasks:
        bot_task = _local_ob_tasks[bot_id]
        await bot_task.stop()
        del _local_ob_tasks[bot_id]
        return {"status": "success", "message": "Bot stopped locally."}
        
    return {"status": "success", "message": "Bot stop signal sent."}
