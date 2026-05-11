from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Any
from datetime import datetime

class ModelVersionBase(BaseModel):
    version: float
    description: Optional[str] = None

class ModelVersionCreate(ModelVersionBase):
    pass

class ModelVersionResponse(ModelVersionBase):
    id: str
    model_id: str
    file_path: str
    upload_date: datetime
    status: str
    accuracy: Optional[float] = None
    f1_score: Optional[float] = None
    latency: Optional[float] = None
    explainability: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)

class CustomMLModelBase(BaseModel):
    name: str
    model_type: str

class CustomMLModelCreate(CustomMLModelBase):
    pass

class CustomMLModelUpdate(BaseModel):
    active_version_id: str

class CustomMLModelResponse(CustomMLModelBase):
    id: str
    active_version_id: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    versions: List[ModelVersionResponse] = []

    model_config = ConfigDict(from_attributes=True)
