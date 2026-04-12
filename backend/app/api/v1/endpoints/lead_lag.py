from fastapi import APIRouter, Depends, WebSocket, HTTPException, Query, status
from sqlalchemy.orm import Session
from app import models
from app.api import deps
from app.schemas.lead_lag import LeadLagBotCreate, LeadLagBotResponse, LeadLagBotUpdate, LeadLagTradeLogResponse
from app.crud.crud_lead_lag import (
    create_lead_lag_bot, get_lead_lag_bot, get_lead_lag_bots_by_user,
    update_lead_lag_bot, delete_lead_lag_bot, get_trade_logs
)
from app.core.redis import redis_manager
from typing import List
import logging
import asyncio
from app.services.lead_lag_engine import LeadLagEngine, run_lead_lag_bot

router = APIRouter()
logger = logging.getLogger(__name__)

# Local task registry
_local_lead_lag_tasks = {}

@router.post("/", response_model=LeadLagBotResponse)
async def create_bot(
    bot_in: LeadLagBotCreate,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    bot = create_lead_lag_bot(db=db, bot=bot_in, user_id=current_user.id)
    return bot

@router.get("/", response_model=List[LeadLagBotResponse])
async def list_bots(
    skip: int = 0, limit: int = 100,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    bots = get_lead_lag_bots_by_user(db=db, user_id=current_user.id, skip=skip, limit=limit)
    return bots

@router.get("/{bot_id}", response_model=LeadLagBotResponse)
async def get_bot(
    bot_id: int,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    bot = get_lead_lag_bot(db=db, bot_id=bot_id, user_id=current_user.id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    return bot

@router.put("/{bot_id}", response_model=LeadLagBotResponse)
async def update_bot(
    bot_id: int,
    bot_in: LeadLagBotUpdate,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    bot = get_lead_lag_bot(db=db, bot_id=bot_id, user_id=current_user.id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
        
    if bot.is_active:
        raise HTTPException(status_code=400, detail="Cannot update a running bot. Stop it first.")

    bot = update_lead_lag_bot(db=db, db_bot=bot, bot_in=bot_in)
    return bot

@router.post("/{bot_id}/start")
async def start_bot(
    bot_id: int,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    redis = redis_manager.get_redis()
    status_val = await redis.get(f"lead_lag_bot:status:{bot_id}")
    if status_val == "running":
        return {"status": "warning", "message": "Bot is already running."}

    bot = get_lead_lag_bot(db=db, bot_id=bot_id, user_id=current_user.id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    if not bot.is_paper_trading and not bot.api_key_id:
        raise HTTPException(status_code=400, detail="API Key required for real trading.")

    if bot_id in _local_lead_lag_tasks and not _local_lead_lag_tasks[bot_id].done():
        return {"status": "warning", "message": "Bot is already running locally."}

    task = asyncio.create_task(run_lead_lag_bot(bot_id, db))
    _local_lead_lag_tasks[bot_id] = task
    
    bot.is_active = True
    db.commit()
    
    return {"status": "success", "message": f"Lead-Lag Bot {bot_id} starting..."}

@router.post("/{bot_id}/stop")
async def stop_bot(
    bot_id: int,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    bot = get_lead_lag_bot(db=db, bot_id=bot_id, user_id=current_user.id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    bot.is_active = False
    db.commit()

    if bot_id in _local_lead_lag_tasks:
        task = _local_lead_lag_tasks[bot_id]
        if not task.done():
            task.cancel()
        del _local_lead_lag_tasks[bot_id]

    redis = redis_manager.get_redis()
    await redis.delete(f"lead_lag_bot:status:{bot_id}")

    return {"status": "success", "message": "Bot stopped."}

@router.get("/{bot_id}/logs", response_model=List[LeadLagTradeLogResponse])
async def get_logs(
    bot_id: int,
    skip: int = 0, limit: int = 50,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    bot = get_lead_lag_bot(db=db, bot_id=bot_id, user_id=current_user.id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
        
    logs = get_trade_logs(db=db, bot_id=bot_id, skip=skip, limit=limit)
    return logs
