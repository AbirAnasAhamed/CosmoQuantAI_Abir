from sqlalchemy import Column, Integer, String, Float, DateTime, JSON
from sqlalchemy.sql import func
from app.db.base_class import Base

class AnalysisSignal(Base):
    """
    Stores detected market signals like Bullish Divergence.
    """
    __tablename__ = "analysis_signals"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, index=True, nullable=False)
    pattern_name = Column(String, index=True, nullable=False) # e.g. "Bullish Divergence"
    
    # Signal Strength / Metrics
    signal_strength = Column(Float, default=0.0) # Normalized score 0-100 or raw magnitude
    
    # Specifics for Divergence
    volume_change_pct = Column(Float) # e.g. 25.0 (%)
    price_change_pct = Column(Float)  # e.g. -0.5 (%)
    
    # Metadata for flexibility
    meta_data = Column(JSON, default={}) # {"lookback": "24h", "sources_count": 50}
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
