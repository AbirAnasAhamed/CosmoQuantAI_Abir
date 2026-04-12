from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base_class import Base

class GridBot(Base):
    __tablename__ = "grid_bots"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Configuration
    pair = Column(String, nullable=False) # e.g., "BTC/USDT"
    exchange = Column(String, nullable=False) # e.g., "binance"
    api_key_id = Column(Integer, ForeignKey("api_keys.id"), nullable=True) # Optional link to API Key
    
    # Grid Parameters
    lower_limit = Column(Float, nullable=False)
    upper_limit = Column(Float, nullable=False)
    grid_count = Column(Integer, nullable=False)
    amount_per_grid = Column(Float, nullable=False) # USDT per level
    
    # Settings
    is_paper_trading = Column(Boolean, default=True, index=True)
    is_active = Column(Boolean, default=False)
    
    # Paper Trading Wallet
    paper_balance_initial = Column(Float, default=0.0)
    paper_balance_current = Column(Float, default=0.0)
    paper_asset_quantity = Column(Float, default=0.0)
    
    # Status
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    status_reason = Column(String, nullable=True)

    # Metrics
    total_profit = Column(Float, default=0.0)
    unrealized_profit = Column(Float, default=0.0)
    current_cycle_count = Column(Integer, default=0)

    # Relationship
    owner = relationship("User", back_populates="grid_bots")
    api_key = relationship("ApiKey")
    orders = relationship("GridOrder", back_populates="bot", cascade="all, delete-orphan")

class GridOrder(Base):
    __tablename__ = "grid_orders"

    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(Integer, ForeignKey("grid_bots.id"), nullable=False)
    order_id = Column(String, nullable=False) # Exchange order ID
    price = Column(Float, nullable=False)
    quantity = Column(Float, nullable=False)
    side = Column(String, nullable=False) # 'buy' or 'sell'
    status = Column(String, nullable=False, default="open") # 'open', 'filled', 'cancelled'
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    bot = relationship("GridBot", back_populates="orders")
