from sqlalchemy import Column, Integer, String, DateTime, Index
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
