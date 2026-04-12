from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class LeadLagBotBase(BaseModel):
    name: Optional[str] = None
    leader_pair: str = "BTC/USDT"
    target_pair: str
    exchange: str = "binance"
    api_key_id: Optional[int] = None
    timeframe: str = "15m"
    trade_size: float
    take_profit_pct: float = 10.0
    stop_loss_pct: float = 5.0
    is_paper_trading: bool = True
    paper_balance: float = 10000.0

class LeadLagBotCreate(LeadLagBotBase):
    pass

class LeadLagBotUpdate(BaseModel):
    name: Optional[str] = None
    target_pair: Optional[str] = None
    trade_size: Optional[float] = None
    take_profit_pct: Optional[float] = None
    stop_loss_pct: Optional[float] = None
    is_active: Optional[bool] = None
    is_paper_trading: Optional[bool] = None
    api_key_id: Optional[int] = None
    paper_balance: Optional[float] = None

class LeadLagBotResponse(LeadLagBotBase):
    id: int
    user_id: int
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    total_profit: float

    class Config:
        from_attributes = True

class LeadLagTradeLogBase(BaseModel):
    bot_id: int
    trigger_reason: str
    executed_pair: str
    side: str
    price: float
    quantity: float
    pnl: Optional[float] = None
    status: str

class LeadLagTradeLogCreate(LeadLagTradeLogBase):
    order_id: Optional[str] = None

class LeadLagTradeLogResponse(LeadLagTradeLogBase):
    id: int
    order_id: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
