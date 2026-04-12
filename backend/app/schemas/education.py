from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class EducationResourceBase(BaseModel):
    title: str
    description: Optional[str] = None
    type: str
    category: str
    level: Optional[str] = None
    link: str
    image_url: Optional[str] = None

class EducationResource(EducationResourceBase):
    id: int
    # পরিবর্তন: published_at কে Optional করা হয়েছে যাতে NULL থাকলেও এরর না দেয়
    published_at: Optional[datetime] = None
    class Config:
        from_attributes = True

class ProgressUpdate(BaseModel):
    resource_id: int
    is_completed: bool
