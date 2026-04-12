from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional

class InsiderFilingBase(BaseModel):
    ticker: str
    insider_name: str
    insider_role: Optional[str] = None
    transaction_type: str
    transaction_date: date
    shares: float
    share_price: float
    
class InsiderFilingCreate(InsiderFilingBase):
    is_manual: bool = True

class InsiderFiling(InsiderFilingBase):
    id: int
    total_value: float
    is_manual: bool
    created_at: datetime

    class Config:
        from_attributes = True
