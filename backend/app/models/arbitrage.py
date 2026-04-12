from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base_class import Base

class ArbitrageBot(Base):
    __tablename__ = "arbitrage_bots"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Configuration
    strategy = Column(String, default="Spatial Arbitrage")
    pair = Column(String, nullable=False) # e.g., "BTC/USDT"
    
    # Exchange Info
    exchange_a = Column(String, nullable=False) # e.g., "binance"
    api_key_a_label = Column(String, nullable=True) # Profile Name used to find real key (Nullable for Paper Trading)
    
    exchange_b = Column(String, nullable=False) # e.g., "kraken"
    api_key_b_label = Column(String, nullable=True) # Nullable for Paper Trading
    
    # Settings
    min_spread = Column(Float, default=0.5)
    trade_amount = Column(Float, default=0.0) # Trade size in USDT
    mode = Column(String, default="manual") # 'auto' or 'manual'
    is_paper_trading = Column(Boolean, default=True)
    auto_balance = Column(Boolean, default=False)
    trailing_stop_percentage = Column(Float, default=0.0)
    sor_threshold = Column(Float, default=1000.0) # Smart Order Routing trigger threshold
    sor_enabled = Column(Boolean, default=False) # Master Toggle for SOR
    
    # Status
    is_active = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationship
    owner = relationship("User", back_populates="arbitrage_bots")
