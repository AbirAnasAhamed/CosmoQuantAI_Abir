from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.sql import func
from app.db.base_class import Base

class OptionTrade(Base):
    __tablename__ = "option_trades"

    id = Column(Integer, primary_key=True, index=True)
    ticker = Column(String, index=True)  # e.g., BTC-29MAR24-60000-C
    underlying_price = Column(Float)
    strike_price = Column(Float)
    expiry_date = Column(String)  # Storing as string for flexibility, or could use Date
    option_type = Column(String)  # 'Call' or 'Put'
    premium = Column(Float)  # Cost of trade
    size = Column(Integer)  # Number of contracts
    open_interest = Column(Integer)
    sentiment = Column(String)  # 'Bullish' or 'Bearish'
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

class OptionSentiment(Base):
    __tablename__ = "option_sentiment"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, index=True)
    put_call_ratio = Column(Float)
    sentiment_score = Column(Float)  # Aggregated score
    timeframe = Column(String)  # e.g., '1h', '24h'
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
