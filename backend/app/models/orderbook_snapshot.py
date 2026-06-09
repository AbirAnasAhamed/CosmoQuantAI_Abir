from sqlalchemy import Column, Integer, String, DateTime, Index, Float
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.sql import func
from app.db.base_class import Base

class OrderBookSnapshot(Base):
    __tablename__ = "orderbook_snapshots"
    __table_args__ = (
        Index('idx_orderbook_snapshot_lookup', 'symbol', 'exchange', 'timestamp'),
        {'extend_existing': True}
    )

    id = Column(Integer, primary_key=True, index=True)
    exchange = Column(String, index=True, nullable=False)
    symbol = Column(String, index=True, nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True, nullable=False)
    
    # We will store the aggregated orderbook directly as JSON to save space and query time
    bids = Column(JSON, nullable=False)  # [{"price": 60000, "volume": 1.5}, ...]
    asks = Column(JSON, nullable=False)  # [{"price": 60005, "volume": 2.0}, ...]
    
    # Pre-computed Micro-structural Features for ML
    obi = Column(Float, nullable=True) # Order Book Imbalance (scaled or float depending on db, we can use Float)
    spread = Column(Float, nullable=True) 
    microprice = Column(Float, nullable=True)

    # Hybrid Deep live trade features
    trade_count = Column(Integer, default=0)
    buy_volume = Column(Float, default=0.0)
    sell_volume = Column(Float, default=0.0)
    trade_price = Column(Float, nullable=True)
