from datetime import datetime
from typing import Optional
from pydantic import BaseModel

# SentimentPoll Schemas
class SentimentPollBase(BaseModel):
    user_id: Optional[int] = None
    symbol: str = "BTC/USDT" # Default to BTC/USDT if not provided to avoid breaking existing frontend
    vote_type: str  # 'bullish' or 'bearish'

class SentimentPollCreate(SentimentPollBase):
    pass

class SentimentPoll(SentimentPollBase):
    id: int
    timestamp: datetime

    class Config:
        from_attributes = True

# InfluencerTrack Schemas
class InfluencerTrackBase(BaseModel):
    name: str
    handle: str
    platform: str
    last_sentiment: Optional[str] = None
    reliability_score: Optional[float] = None

class InfluencerTrackCreate(InfluencerTrackBase):
    pass

class InfluencerTrack(InfluencerTrackBase):
    id: int
    last_updated: datetime

    class Config:
        from_attributes = True

# SocialDominance Schemas
class SocialDominanceBase(BaseModel):
    asset: str
    dominance_percentage: float

class SocialDominanceCreate(SocialDominanceBase):
    pass

class SocialDominance(SocialDominanceBase):
    id: int
    timestamp: datetime

    class Config:
        from_attributes = True

# SentimentHistory Schema
class SentimentHistory(BaseModel):
    id: int
    symbol: str
    price: Optional[float] = None
    smart_money_score: Optional[float] = None
    retail_score: Optional[float] = None
    news_sentiment: Optional[float] = None
    timestamp: datetime

    class Config:
        from_attributes = True
