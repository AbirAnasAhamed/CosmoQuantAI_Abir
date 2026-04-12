from fastapi import APIRouter, HTTPException, Depends
from app.services.on_chain_service import on_chain_service

router = APIRouter()

from app.services.exchange_flow_service import exchange_flow_service

@router.get("/exchange-flow")
async def get_exchange_flow_metrics():
    """
    Get Real-Time Exchange Inflow/Outflow calculated from the latest Ethereum block.
    Uses Etherscan API.
    """
    try:
        metrics = await exchange_flow_service.calculate_netflow()
        return metrics
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{symbol}")
async def get_on_chain_metrics(symbol: str):
    """
    Get On-Chain Exchange Inflow/Outflow metrics for a specific symbol.
    Returns calculated pressure status (Sell/Buy Pressure).
    """
    try:
        metrics = await on_chain_service.get_latest_metrics(symbol)
        return metrics
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

