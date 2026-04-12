from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Float, DateTime, UniqueConstraint, Index
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.sql import func
from app.db.base_class import Base

# 1. User Model
class User(Base):
    __tablename__ = "users"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    full_name = Column(String)
    hashed_password = Column(String)
    is_active = Column(Boolean, default=True)
    
    # New Fields
    is_pro = Column(Boolean, default=False)
    is_superuser = Column(Boolean, default=False) # এডমিন অ্যাক্সেসের জন্য এটি জরুরি
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Financials
    balance = Column(Float, default=25000.0)

    # Security
    allowed_ips = Column(JSON, default=[])
    is_ip_whitelist_enabled = Column(Boolean, default=False)
    
    # Profile
    avatar_url = Column(String, nullable=True)

    # Relationships
    api_keys = relationship("ApiKey", back_populates="owner")
    bots = relationship("Bot", back_populates="owner")
    portfolio_snapshots = relationship("PortfolioSnapshot", back_populates="owner")
    indicators = relationship("UserIndicator", back_populates="owner")
    arbitrage_bots = relationship("ArbitrageBot", back_populates="owner")
    
    # 👇 এই লাইনটি মিসিং ছিল, এটি যোগ করা হয়েছে:
    education_progress = relationship("UserEducationProgress", back_populates="user")
    grid_bots = relationship("GridBot", back_populates="owner")
    lead_lag_bots = relationship("LeadLagBot", back_populates="owner")

# 2. API Keys Model
class ApiKey(Base):
    __tablename__ = "api_keys"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String) # ✅ Added name field
    exchange = Column(String)
    api_key = Column(String)
    secret_key = Column(String)
    passphrase = Column(String, nullable=True)
    is_enabled = Column(Boolean, default=True)
    user_id = Column(Integer, ForeignKey("users.id"))

    owner = relationship("User", back_populates="api_keys")

# 3. Strategy Templates Model
class StrategyTemplate(Base):
    __tablename__ = "strategy_templates"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    description = Column(String)
    strategy_type = Column(String) 
    tags = Column(JSON)
    params = Column(JSON)

# 4. Market Data Model
class MarketData(Base):
    __tablename__ = "market_data"
    
    exchange = Column(String, primary_key=True)
    symbol = Column(String, primary_key=True)
    timeframe = Column(String, primary_key=True)
    timestamp = Column(DateTime, primary_key=True)
    
    open = Column(Float)
    high = Column(Float)
    low = Column(Float)
    close = Column(Float)
    volume = Column(Float)

    __table_args__ = (
        Index('idx_market_data_lookup', 'symbol', 'timeframe', 'timestamp'),
        {'extend_existing': True}
    )

# 👇 Imports (Education মডেলগুলোও ইম্পোর্ট করতে হবে)
from .bot import Bot
from .backtest import Backtest
from .portfolio import PortfolioSnapshot
from .indicator import UserIndicator
from .sentiment_history import SentimentHistory
from .trade import Trade
from .education import EducationResource, UserEducationProgress
from .arbitrage import ArbitrageBot
from .notification import NotificationSettings
from .grid import GridBot
from .whale_alert import WhaleAlert
from .analysis import AnalysisSignal
from .sentiment import SentimentPoll
from .options_activity import OptionTrade, OptionSentiment
from .analyst_rating import AnalystRating
from .research_report import ResearchReport
from .lead_lag import LeadLagBot, LeadLagTradeLog
from .orderbook_snapshot import OrderBookSnapshot
