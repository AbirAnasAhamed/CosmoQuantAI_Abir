from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, Date
from sqlalchemy.sql import func
from app.db.base_class import Base

class InsiderFiling(Base):
    __tablename__ = "insider_filings"

    id = Column(Integer, primary_key=True, index=True)
    ticker = Column(String, index=True, nullable=False)
    insider_name = Column(String, nullable=False)
    insider_role = Column(String, nullable=True)
    transaction_type = Column(String, nullable=False)  # Buy/Sell
    transaction_date = Column(Date, nullable=False)
    shares = Column(Float, nullable=False)
    share_price = Column(Float, nullable=False)
    total_value = Column(Float, nullable=False)
    
    # এটি ম্যানুয়াল এন্ট্রি নাকি API থেকে আসা রিয়েল ডেটা তা বোঝার জন্য
    is_manual = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
