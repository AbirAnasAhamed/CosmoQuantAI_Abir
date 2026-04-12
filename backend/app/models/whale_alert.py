from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.sql import func
from app.db.base_class import Base

class WhaleAlert(Base):
    __tablename__ = "whale_alerts"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, index=True)
    volume = Column(Float)
    price = Column(Float)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    exchange = Column(String, default="binance")
