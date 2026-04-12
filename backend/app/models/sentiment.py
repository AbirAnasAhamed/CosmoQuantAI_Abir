from sqlalchemy import Column, Integer, Float, DateTime, String
from sqlalchemy.sql import func
from app.db.base_class import Base




class SentimentPoll(Base):
    __tablename__ = "sentiment_poll"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=True) # Modified to allow null for IP-only votes if needed, though user_id is preferred
    symbol = Column(String, index=True)  # Added symbol column
    vote_type = Column(String)  # 'bullish' or 'bearish'
    ip_address = Column(String, index=True, nullable=True) # Added ip_address column
    timestamp = Column(DateTime(timezone=True), server_default=func.now())


class InfluencerTrack(Base):
    __tablename__ = "influencer_track"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    handle = Column(String, index=True)
    platform = Column(String)  # 'Twitter', 'YouTube'
    last_sentiment = Column(String)  # 'Bullish', 'Bearish'
    reliability_score = Column(Float)
    last_updated = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class SocialDominance(Base):
    __tablename__ = "social_dominance"

    id = Column(Integer, primary_key=True, index=True)
    asset = Column(String, index=True)  # 'BTC', 'ETH', 'SOL'
    dominance_percentage = Column(Float)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

