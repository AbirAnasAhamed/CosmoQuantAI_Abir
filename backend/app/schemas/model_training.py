from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
from app.models.model_training import TrainingStatus

class TrainingJobCreate(BaseModel):
    symbol: str
    timeframe: str
    algorithm: str
    config: Dict[str, Any]

class TrainingJobResponse(BaseModel):
    id: str
    user_id: int
    symbol: str
    timeframe: str
    algorithm: str
    status: TrainingStatus
    progress: float
    config: Optional[Dict[str, Any]] = None
    logs: List[Any]
    output_model_id: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True
