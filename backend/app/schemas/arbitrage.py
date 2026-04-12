from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ArbitrageBotBase(BaseModel):
    strategy: str
    pair: str
    exchange_a: str
    api_key_a_label: Optional[str] = None
    exchange_b: str
    api_key_b_label: Optional[str] = None
    min_spread: float = 0.5
    trade_amount: float = 0.0
    mode: str = "manual"
    is_paper_trading: bool = True # Default to Paper Mode
    auto_balance: bool = False # Auto-Rebalance Portfolio at Start
    trailing_stop_percentage: float = 0.0
    sor_threshold: float = 1000.0 # Smart Order Routing Threshold
    sor_enabled: bool = False

class ArbitrageBotCreate(ArbitrageBotBase):
    pass

class ArbitrageBotUpdate(ArbitrageBotBase):
    is_active: Optional[bool] = None

class ArbitrageBotResponse(ArbitrageBotBase):
    id: int
    user_id: int
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
