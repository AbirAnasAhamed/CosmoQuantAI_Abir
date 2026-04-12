from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class GridBotBase(BaseModel):
    pair: str
    exchange: str
    lower_limit: float
    upper_limit: float
    grid_count: int
    amount_per_grid: float
    is_paper_trading: bool = True
    api_key_id: Optional[int] = None

class GridBotCreate(GridBotBase):
    pass

class GridBotUpdate(BaseModel):
    is_active: Optional[bool] = None
    lower_limit: Optional[float] = None
    upper_limit: Optional[float] = None
    grid_count: Optional[int] = None
    amount_per_grid: Optional[float] = None
    pair: Optional[str] = None
    exchange: Optional[str] = None
    is_paper_trading: Optional[bool] = None
    api_key_id: Optional[int] = None
    paper_balance_initial: Optional[float] = None

class GridBotResponse(GridBotBase):
    id: int
    user_id: int
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
