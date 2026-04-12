from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class TradeBase(BaseModel):
    symbol: str
    side: str
    entry_price: float
    quantity: float
    status: str  # OPEN, CLOSED

class TradeCreate(TradeBase):
    bot_id: int

class TradeResponse(TradeBase):
    id: int
    exit_price: Optional[float] = None
    pnl: float
    pnl_percent: float
    opened_at: datetime
    closed_at: Optional[datetime] = None

    class Config:
        from_attributes = True # Pydantic v2
