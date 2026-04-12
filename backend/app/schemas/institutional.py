from pydantic import BaseModel
from typing import List, Optional
from datetime import date

# Holding Schema
class FundHoldingBase(BaseModel):
    ticker: str
    shares: float
    value: float
    percent_portfolio: Optional[float] = None
    date_reported: Optional[date] = None

class FundHolding(FundHoldingBase):
    id: int
    fund_id: int

    class Config:
        from_attributes = True

# Fund Schema
class InstitutionalFundBase(BaseModel):
    name: str
    manager: Optional[str] = None
    cik: str
    total_assets: Optional[float] = None
    filing_date: Optional[date] = None
    image_url: Optional[str] = None

class InstitutionalFund(InstitutionalFundBase):
    id: int
    holdings: List[FundHolding] = []

    class Config:
        from_attributes = True

# Analytics Schemas
class TopMover(BaseModel):
    ticker: str
    total_value: float
    fund_count: int

class PortfolioStats(BaseModel):
    total_holdings_count: int
    top_holdings: List[dict] # simplified dict for now
