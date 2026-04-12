from sqlalchemy import Column, Integer, Float, String, DateTime
from sqlalchemy.sql import func
from app.db.base_class import Base

class OnChainMetric(Base):
    __tablename__ = "on_chain_metric"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, index=True)
    exchange_inflow_volume = Column(Float)
    exchange_outflow_volume = Column(Float)
    net_flow_status = Column(String)  # 'accumulation' or 'distribution'
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
