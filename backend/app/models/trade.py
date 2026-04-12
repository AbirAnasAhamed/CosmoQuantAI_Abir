from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base_class import Base

class Trade(Base):
    __tablename__ = "trades"

    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(Integer, ForeignKey("bots.id"))
    
    symbol = Column(String, index=True)
    side = Column(String) # 'BUY' (Long) or 'SELL' (Short)
    
    entry_price = Column(Float)
    exit_price = Column(Float, nullable=True)
    quantity = Column(Float)
    
    status = Column(String, default="OPEN") # 'OPEN', 'CLOSED'
    
    pnl = Column(Float, default=0.0) # Profit/Loss
    pnl_percent = Column(Float, default=0.0)
    
    opened_at = Column(DateTime(timezone=True), server_default=func.now())
    closed_at = Column(DateTime(timezone=True), nullable=True)

    # Relationship
    bot = relationship("Bot", back_populates="trades")
