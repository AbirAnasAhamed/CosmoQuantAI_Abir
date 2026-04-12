from sqlalchemy import Column, Integer, String, Float, DateTime
from app.db.base_class import Base

class SentimentHistory(Base):
    __tablename__ = "sentiment_history"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, index=True, nullable=False)
    timeframe = Column(String, nullable=True)
    retail_score = Column(Float, nullable=True)
    smart_money_score = Column(Float, nullable=True)
    news_sentiment = Column(Float, nullable=True)
    price = Column(Float, nullable=True)
    timestamp = Column(DateTime, index=True, nullable=True)
