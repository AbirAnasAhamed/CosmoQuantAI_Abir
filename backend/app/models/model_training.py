from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Enum, Integer, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.db.base_class import Base

class TrainingStatus(str, enum.Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"

class ModelTrainingJob(Base):
    __tablename__ = "model_training_jobs"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    symbol = Column(String, nullable=False)
    timeframe = Column(String, nullable=False)
    algorithm = Column(String, nullable=False)
    
    status = Column(Enum(TrainingStatus), default=TrainingStatus.PENDING, nullable=False)
    progress = Column(Float, default=0.0) # 0.0 to 100.0
    
    config = Column(JSON, nullable=True) # stores epochs, indicators, etc.
    logs = Column(JSON, default=list) # array of strings or dicts
    
    output_model_id = Column(String, ForeignKey("custom_ml_models.id", ondelete="SET NULL"), nullable=True)
    
    error_message = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", backref="training_jobs")
    output_model = relationship("CustomMLModel")
