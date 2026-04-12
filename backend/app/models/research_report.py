from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.sql import func
from app.db.base_class import Base

class ResearchReport(Base):
    __tablename__ = "research_reports"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    ticker = Column(String, index=True)
    publish_date = Column(DateTime(timezone=True))
    title = Column(String)
    summary = Column(Text)
    source_name = Column(String)
    report_link = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
