from typing import Optional, Any, Dict
from pydantic import BaseModel
from datetime import datetime

# Shared properties
class IndicatorBase(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    base_type: Optional[str] = "indicator" # indicator, strategy
    parameters: Optional[Dict[str, Any]] = {}
    is_public: Optional[bool] = False

# Properties to receive on item creation
class IndicatorCreate(IndicatorBase):
    name: str
    code: str

# Properties to receive on item update
class IndicatorUpdate(IndicatorBase):
    pass

# Properties shared by models stored in DB
class IndicatorInDBBase(IndicatorBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# Properties to return to client
class IndicatorResponse(IndicatorInDBBase):
    pass
