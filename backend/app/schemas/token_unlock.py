from typing import Optional, List, Any, Dict
from pydantic import BaseModel
from datetime import datetime

# Shared properties
class TokenUnlockBase(BaseModel):
    symbol: str
    token_name: Optional[str] = None
    unlock_date: datetime
    amount: float
    amount_usd: float
    circulating_supply_pct: Optional[float] = None
    vesting_schedule: Optional[List[Dict[str, Any]]] = None
    allocations: Optional[List[Dict[str, Any]]] = None
    impact_score: Optional[float] = None
    ai_summary: Optional[str] = None
    is_verified: Optional[bool] = False

# Properties to receive on creation
class TokenUnlockCreate(TokenUnlockBase):
    pass

# Properties to return to client
class TokenUnlockResponse(TokenUnlockBase):
    id: int

    class Config:
        from_attributes = True

# Request schema for AI analysis
class UnlockAnalysisRequest(BaseModel):
    event_id: int
