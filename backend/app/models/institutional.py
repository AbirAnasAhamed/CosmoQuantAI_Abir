from sqlalchemy import Column, Integer, String, Float, Date, ForeignKey
from sqlalchemy.orm import relationship
from app.db.base_class import Base

class InstitutionalFund(Base):
    __tablename__ = "institutional_funds"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    manager = Column(String, index=True, nullable=True)
    cik = Column(String, unique=True, index=True, nullable=False)
    total_assets = Column(Float, nullable=True)
    filing_date = Column(Date, nullable=True)
    image_url = Column(String, nullable=True)

    holdings = relationship("FundHolding", back_populates="fund", cascade="all, delete-orphan")

class FundHolding(Base):
    __tablename__ = "fund_holdings"

    id = Column(Integer, primary_key=True, index=True)
    fund_id = Column(Integer, ForeignKey("institutional_funds.id"), nullable=False)
    ticker = Column(String, index=True, nullable=False)
    shares = Column(Float, nullable=False)
    value = Column(Float, nullable=False)
    percent_portfolio = Column(Float, nullable=True)
    date_reported = Column(Date, nullable=False)

    fund = relationship("InstitutionalFund", back_populates="holdings")
