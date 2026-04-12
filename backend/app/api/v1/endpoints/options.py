from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Dict
import asyncio
import logging

from app.api import deps
from app.models.options_activity import OptionTrade, OptionSentiment
from app.schemas.options_schema import OptionTrade as OptionTradeSchema
from app.services.websocket_manager import manager

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/stats", response_model=Dict[str, float])
def get_options_stats(
    db: Session = Depends(deps.get_db)
):
    """
    Get today's aggregated option stats.
    """
    # Calculate Put/Call Ratio and Sentiments from today's trades
    # For MVP, we aggregate all time or last 24h
    # Assuming timestamp field exists
    
    total_trades = db.query(OptionTrade).count()
    bullish_trades = db.query(OptionTrade).filter(OptionTrade.sentiment == "Bullish").count()
    bearish_trades = db.query(OptionTrade).filter(OptionTrade.sentiment == "Bearish").count()
    
    total_premium = db.query(func.sum(OptionTrade.premium)).scalar() or 0.0
    
    return {
        "total_trades": total_trades,
        "bullish_count": bullish_trades,
        "bearish_count": bearish_trades,
        "total_premium": total_premium,
        "put_call_ratio": bearish_trades / bullish_trades if bullish_trades > 0 else 0
    }

@router.get("/history", response_model=List[OptionTradeSchema])
def get_options_history(
    limit: int = 100,
    db: Session = Depends(deps.get_db)
):
    """
    Get updated list of unusual trades.
    """
    trades = db.query(OptionTrade).order_by(OptionTrade.timestamp.desc()).limit(limit).all()
    return trades

@router.websocket("/live")
async def websocket_options_feed(websocket: WebSocket):
    """
    WebSocket endpoint for real-time unusual options alerts.
    """
    await manager.connect(websocket, "options_live")
    try:
        while True:
            # Heartbeat to keep connection alive
            await asyncio.sleep(30)
            await websocket.send_json({"type": "heartbeat"})
    except WebSocketDisconnect:
        manager.disconnect(websocket, "options_live")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket, "options_live")
