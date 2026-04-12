from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any
from app.services.ccxt_service import ccxt_service

router = APIRouter()

@router.get("/exchanges", response_model=List[Dict[str, Any]])
async def get_supported_exchanges():
    """
    Get list of supported exchanges.
    Returns a list of dicts with 'id', 'name', and 'popular' flag.
    """
    return await ccxt_service.get_exchanges()

@router.get("/pairs/{exchange_id}", response_model=List[str])
async def get_exchange_pairs(exchange_id: str):
    """
    Get active pairs/symbols for a specific exchange.
    Returns a list of symbol strings (e.g., "BTC/USDT").
    """
    try:
        if not exchange_id or not exchange_id.strip():
             raise HTTPException(status_code=400, detail="Exchange ID is required")
             
        return await ccxt_service.get_pairs(exchange_id)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"Exchange '{exchange_id}' not found or not supported")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
