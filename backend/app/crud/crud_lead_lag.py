from sqlalchemy.orm import Session
from app.models.lead_lag import LeadLagBot, LeadLagTradeLog
from app.schemas.lead_lag import LeadLagBotCreate, LeadLagBotUpdate, LeadLagTradeLogCreate
from typing import List, Optional

def get_lead_lag_bot(db: Session, bot_id: int, user_id: Optional[int] = None) -> Optional[LeadLagBot]:
    query = db.query(LeadLagBot).filter(LeadLagBot.id == bot_id)
    if user_id is not None:
        query = query.filter(LeadLagBot.user_id == user_id)
    return query.first()

def get_lead_lag_bots_by_user(db: Session, user_id: int, skip: int = 0, limit: int = 100) -> List[LeadLagBot]:
    return db.query(LeadLagBot).filter(LeadLagBot.user_id == user_id).offset(skip).limit(limit).all()

def create_lead_lag_bot(db: Session, bot: LeadLagBotCreate, user_id: int) -> LeadLagBot:
    db_bot = LeadLagBot(
        **bot.dict(),
        user_id=user_id
    )
    db.add(db_bot)
    db.commit()
    db.refresh(db_bot)
    return db_bot

def update_lead_lag_bot(db: Session, db_bot: LeadLagBot, bot_in: LeadLagBotUpdate) -> LeadLagBot:
    update_data = bot_in.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_bot, field, value)
    
    db.add(db_bot)
    db.commit()
    db.refresh(db_bot)
    return db_bot

def delete_lead_lag_bot(db: Session, db_bot: LeadLagBot) -> LeadLagBot:
    db.delete(db_bot)
    db.commit()
    return db_bot

def create_trade_log(db: Session, log_in: LeadLagTradeLogCreate) -> LeadLagTradeLog:
    db_log = LeadLagTradeLog(**log_in.dict())
    db.add(db_log)
    db.commit()
    db.refresh(db_log)
    return db_log

def get_trade_logs(db: Session, bot_id: int, skip: int = 0, limit: int = 100) -> List[LeadLagTradeLog]:
    return db.query(LeadLagTradeLog).filter(LeadLagTradeLog.bot_id == bot_id).order_by(LeadLagTradeLog.created_at.desc()).offset(skip).limit(limit).all()
