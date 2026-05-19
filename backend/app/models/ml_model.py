from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Enum, Integer, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from app.db.base_class import Base

class ModelStatus(str, enum.Enum):
    PROCESSING = "Processing"
    READY = "Ready"
    ERROR = "Error"

class CustomMLModel(Base):
    __tablename__ = "custom_ml_models"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    model_type = Column(String, nullable=False) # e.g. LSTM, ARIMA, Random Forest
    active_version_id = Column(String, ForeignKey("model_versions.id", use_alter=True, name="fk_active_version_id"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    is_auto_retrain = Column(Integer, default=0) # 0 = False, 1 = True (Using Integer for SQLite compatibility if needed, or Boolean)
    retrain_interval_hours = Column(Integer, default=6)
    data_lookback_hours = Column(Float, default=6.0)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    versions = relationship("ModelVersion", back_populates="model", cascade="all, delete-orphan", foreign_keys="ModelVersion.model_id")
    user = relationship("User", back_populates="custom_models")


class ModelVersion(Base):
    __tablename__ = "model_versions"

    id = Column(String, primary_key=True, index=True)
    model_id = Column(String, ForeignKey("custom_ml_models.id", ondelete="CASCADE"), nullable=False)
    version = Column(Float, nullable=False)
    file_path = Column(String, nullable=False)
    upload_date = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(Enum(ModelStatus), default=ModelStatus.PROCESSING)
    description = Column(String, nullable=True)
    accuracy = Column(Float, nullable=True)
    f1_score = Column(Float, nullable=True)
    latency = Column(Float, nullable=True)
    explainability = Column(JSON, nullable=True)
    dataset_path = Column(String, nullable=True) # For DVC
    metadata_path = Column(String, nullable=True) # For custom uploaded metadata.json

    model = relationship("CustomMLModel", back_populates="versions", foreign_keys=[model_id])
