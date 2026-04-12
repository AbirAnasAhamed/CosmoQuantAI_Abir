from pydantic import BaseModel
from datetime import datetime
from typing import Optional

# OptionTrade Schemas
class OptionTradeBase(BaseModel):
    ticker: str
    underlying_price: float
    strike_price: float
    expiry_date: str
    option_type: str
    premium: float
    size: int
    open_interest: int
    sentiment: str

class OptionTradeCreate(OptionTradeBase):
    pass

class OptionTrade(OptionTradeBase):
    id: int
    timestamp: datetime

    class Config:
        from_attributes = True

# OptionSentiment Schemas
class OptionSentimentBase(BaseModel):
    symbol: str
    put_call_ratio: float
    sentiment_score: float
    timeframe: str

class OptionSentimentCreate(OptionSentimentBase):
    pass

class OptionSentiment(OptionSentimentBase):
    id: int
    timestamp: datetime

    class Config:
        from_attributes = True
