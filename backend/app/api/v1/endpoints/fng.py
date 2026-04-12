from fastapi import APIRouter
from app.services.fng_service import FearAndGreedService

router = APIRouter()

@router.get("/latest", response_model=dict)
async def get_latest_fng_index():
    """
    Get the latest Crypto Fear & Greed Index.
    """
    return await FearAndGreedService.fetch_latest_index()
