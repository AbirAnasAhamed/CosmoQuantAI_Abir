from fastapi import APIRouter, HTTPException
from typing import Any
from app.services.regime_service import RegimeService
from app.schemas.regime import RegimeResponse

router = APIRouter()

@router.get("/regime", response_model=RegimeResponse)
def get_market_regime() -> Any:
    """
    Get the current market regime, trend score, and volatility score.
    Uses Hidden Markov Models (HMM) on BTC/USDT data.
    """
    try:
        service = RegimeService()
        result = service.execute()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
