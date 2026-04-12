from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base_class import Base

class Backtest(Base):
    __tablename__ = "backtests"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"))
    
    strategy = Column(String)
    symbol = Column(String)
    timeframe = Column(String)
    
    start_date = Column(DateTime)
    end_date = Column(DateTime)
    
    initial_cash = Column(Float)
    final_equity = Column(Float)
    profit_percent = Column(Float)
    max_drawdown = Column(Float)
    win_rate = Column(Float)
    sharpe_ratio = Column(Float)
    
    status = Column(String, default="PENDING") # PENDING, COMPLETED, FAILED
    task_id = Column(String, unique=True, index=True) # Celery Task ID
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    owner = relationship("User")
