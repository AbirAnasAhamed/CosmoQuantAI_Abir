from sqlalchemy.orm import Session
from app import models, schemas
from typing import List, Optional

def create_indicator(db: Session, indicator: schemas.IndicatorCreate, user_id: int):
    db_indicator = models.UserIndicator(
        **indicator.dict(),
        user_id=user_id
    )
    db.add(db_indicator)
    db.commit()
    db.refresh(db_indicator)
    return db_indicator

def get_indicators_by_user(db: Session, user_id: int) -> List[models.UserIndicator]:
    return db.query(models.UserIndicator).filter(models.UserIndicator.user_id == user_id).all()

def get_indicator(db: Session, indicator_id: int) -> Optional[models.UserIndicator]:
    return db.query(models.UserIndicator).filter(models.UserIndicator.id == indicator_id).first()

def delete_indicator(db: Session, indicator_id: int, user_id: int) -> bool:
    db_indicator = db.query(models.UserIndicator).filter(
        models.UserIndicator.id == indicator_id,
        models.UserIndicator.user_id == user_id
    ).first()
    if db_indicator:
        db.delete(db_indicator)
        db.commit()
        return True
    return False
