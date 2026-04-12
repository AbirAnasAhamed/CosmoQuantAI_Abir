from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.whale_alert import WhaleAlert
from app.api import deps
from typing import List
from pydantic import BaseModel
from datetime import datetime

router = APIRouter()

class WhaleAlertSchema(BaseModel):
    symbol: str
    volume: float
    price: float
    timestamp: datetime
    exchange: str

    class Config:
        from_attributes = True

@router.get("/recent", response_model=List[WhaleAlertSchema])
def get_recent_alerts(
    db: Session = Depends(deps.get_db),
    limit: int = 10
):
    """
    Get recent whale alerts.
    """
    alerts = db.query(WhaleAlert).order_by(WhaleAlert.timestamp.desc()).limit(limit).all()
    return alerts

class ThresholdUpdate(BaseModel):
    amount_usd: float

@router.post("/threshold")
def set_whale_threshold(data: ThresholdUpdate):
    """
    Set the minimum USD threshold for whale alerts.
    """
    from app.services.chain_service import ChainService
    success = ChainService.set_whale_threshold(data.amount_usd)
    return {"success": success, "threshold": data.amount_usd}

@router.get("/threshold")
def get_whale_threshold():
    """
    Get the current whale alert threshold in USD.
    """
    from app.services.chain_service import ChainService
    val = ChainService.get_whale_threshold()
    return {"threshold": val}
