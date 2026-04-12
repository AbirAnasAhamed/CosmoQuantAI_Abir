from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base_class import Base
import enum

class EducationResource(Base):
    __tablename__ = "education_resources"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True, nullable=False)
    description = Column(Text, nullable=True)
    type = Column(String, default="Article") # Article, Video, Course
    category = Column(String, index=True, default="General") 
    
    # "Zero to Hero" leveling
    level = Column(String, index=True, nullable=True) # e.g., "Level 1", "Level 2"
    track_order = Column(Integer, default=0) # For sorting (1, 2, 3...)

    # For automation
    source = Column(String, index=True, nullable=True)
    link = Column(String, unique=True, nullable=False)
    image_url = Column(String, nullable=True)
    published_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Impact Analysis
    impact_level = Column(String, default="LOW") # 'HIGH', 'MEDIUM', 'LOW'
    impact_score = Column(Integer, default=0) # 0-100

    
    progress_records = relationship("UserEducationProgress", back_populates="resource")

class UserEducationProgress(Base):
    __tablename__ = "user_education_progress"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    resource_id = Column(Integer, ForeignKey("education_resources.id"))
    is_completed = Column(Boolean, default=False)
    
    user = relationship("User", back_populates="education_progress")
    resource = relationship("EducationResource", back_populates="progress_records")
