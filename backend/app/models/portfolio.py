from sqlalchemy import Column, Integer, Float, DateTime, ForeignKey, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base_class import Base

class PortfolioSnapshot(Base):
    __tablename__ = "portfolio_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), index=True)
    
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    total_equity = Column(Float, nullable=False)
    cash_balance = Column(Float, nullable=False)
    invested_amount = Column(Float, default=0.0)
    
    # Optional: Breakdown of PnL at this moment
    total_pnl = Column(Float, default=0.0)

    owner = relationship("User", back_populates="portfolio_snapshots")
