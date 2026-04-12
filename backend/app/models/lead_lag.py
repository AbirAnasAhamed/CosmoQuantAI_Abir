from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base_class import Base

class LeadLagBot(Base):
    __tablename__ = "lead_lag_bots"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Configuration
    name = Column(String, nullable=True)
    leader_pair = Column(String, nullable=False, default="BTC/USDT") 
    target_pair = Column(String, nullable=False) # e.g., "SOL/USDT"
    exchange = Column(String, nullable=False, default="binance")
    api_key_id = Column(Integer, ForeignKey("api_keys.id"), nullable=True) # Optional link to API Key for real trading
    
    # Trading Parameters
    timeframe = Column(String, default="15m")
    trade_size = Column(Float, nullable=False) # USDT amount
    take_profit_pct = Column(Float, nullable=False, default=10.0)
    stop_loss_pct = Column(Float, nullable=False, default=5.0)
    
    # Settings
    is_active = Column(Boolean, default=False)
    is_paper_trading = Column(Boolean, default=True, index=True)
    paper_balance = Column(Float, default=10000.0)
    
    # Status
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    status_reason = Column(String, nullable=True)

    # Metrics
    total_profit = Column(Float, default=0.0)

    # Relationships
    owner = relationship("User", back_populates="lead_lag_bots")
    api_key = relationship("ApiKey")
    orders = relationship("LeadLagTradeLog", back_populates="bot", cascade="all, delete-orphan")

class LeadLagTradeLog(Base):
    __tablename__ = "lead_lag_trade_logs"

    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(Integer, ForeignKey("lead_lag_bots.id"), nullable=False)
    order_id = Column(String, nullable=True) # Exchange order ID if real
    
    trigger_reason = Column(String, nullable=False) # e.g. "EMA Crossover"
    executed_pair = Column(String, nullable=False)
    side = Column(String, nullable=False) # 'buy' or 'sell'
    price = Column(Float, nullable=False)
    quantity = Column(Float, nullable=False)
    pnl = Column(Float, nullable=True)
    
    status = Column(String, nullable=False, default="filled") # 'filled', 'failed'
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    bot = relationship("LeadLagBot", back_populates="orders")
