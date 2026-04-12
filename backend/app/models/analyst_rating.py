from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.sql import func
from app.db.base_class import Base

class AnalystRating(Base):
    __tablename__ = "analyst_ratings"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    ticker = Column(String, index=True)
    firm_name = Column(String)
    date = Column(DateTime(timezone=True))
    rating_action = Column(String)
    rating = Column(String)
    price_target = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
