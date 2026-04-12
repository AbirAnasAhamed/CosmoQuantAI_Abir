from typing import Any, List, Dict
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app import schemas, models
from app.crud import indicator as crud_indicator
from app.api import deps

router = APIRouter()

@router.post("/", response_model=schemas.IndicatorResponse)
def create_indicator(
    *,
    db: Session = Depends(deps.get_db),
    indicator_in: schemas.IndicatorCreate,
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Create new indicator.
    """
    indicator = crud_indicator.create_indicator(db=db, indicator=indicator_in, user_id=current_user.id)
    return indicator

@router.get("/", response_model=List[schemas.IndicatorResponse])
def read_indicators(
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve indicators.
    """
    indicators = crud_indicator.get_indicators_by_user(db=db, user_id=current_user.id)
    return indicators

@router.delete("/{id}", response_model=Dict[str, str])
def delete_indicator(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Delete an indicator.
    """
    success = crud_indicator.delete_indicator(db=db, indicator_id=id, user_id=current_user.id)
    if not success:
        raise HTTPException(status_code=404, detail="Indicator not found")
    return {"message": "Indicator deleted successfully"}


@router.get("/templates", response_model=List[schemas.IndicatorBase])
def get_templates() -> Any:
    """
    Get default Pine Script templates.
    """
    templates = [
        {
            "name": "Simple Moving Average (SMA)",
            "code": """//@version=5
indicator("Simple Moving Average", overlay=true)
length = input(14, "Length")
source = input(close, "Source")
avg = ta.sma(source, length)
plot(avg, color=color.blue)
""",
            "base_type": "indicator",
            "parameters": {"length": 14, "source": "close"}
        },
        {
            "name": "Relative Strength Index (RSI)",
            "code": """//@version=5
indicator("RSI", overlay=false)
length = input(14, "RSI Length")
rsi = ta.rsi(close, length)
plot(rsi, color=color.purple)
hline(70, "Overbought", color=color.red)
hline(30, "Oversold", color=color.green)
""",
            "base_type": "indicator",
            "parameters": {"length": 14}
        }
    ]
    return templates
