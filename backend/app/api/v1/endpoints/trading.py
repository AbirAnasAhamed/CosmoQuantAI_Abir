from fastapi import APIRouter, HTTPException, BackgroundTasks, Body, Depends
from typing import Optional
import ccxt.async_support as ccxt
import logging
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app import models, crud
from app.api import deps
from app.core.security import decrypt_key

router = APIRouter()
logger = logging.getLogger(__name__)


class AttachedTPConfig(BaseModel):
    enabled: bool
    mode: str  # 'percentage' or 'price'
    value: float
    order_type: str  # 'Limit' or 'Market'
    timeout_mins: float  # Background threshold for limit order monitor

class OrderRequest(BaseModel):
    symbol: str
    side: str # 'buy' or 'sell'
    type: str # 'market' or 'limit'
    amount: float
    price: Optional[float] = None
    exchange_id: str = 'binance'
    api_key_id: Optional[int] = None
    params: Optional[dict] = {}
    client_timestamp: Optional[int] = None
    attached_tp: Optional[AttachedTPConfig] = None

class ConnectionTestRequest(BaseModel):
    exchange_id: str
    api_key: str
    api_secret: str

class SORRequest(BaseModel):
    symbol: str
    amount: float
    side: str
    strategy: str # TWAP, VWAP
    duration_minutes: int
    exchange_id: str = "binance"
    params: Optional[dict] = {}

# --- Endpoints ---

@router.get("/news")
async def get_crypto_news():
    """Fetch latest crypto news"""
    from app.services.news_service import news_service 
    return await news_service.fetch_news()

@router.post("/test-connection")
async def test_exchange_connection(request: ConnectionTestRequest):
    """Test validity of API keys"""
    exchange_class = getattr(ccxt, request.exchange_id, None)
    if not exchange_class:
        raise HTTPException(status_code=400, detail="Unsupported exchange")
    
    try:
        exchange = exchange_class({
            'apiKey': request.api_key,
            'secret': request.api_secret,
            'enableRateLimit': True,
            'options': {
                'adjustForTimeDifference': True,
                'recvWindow': 60000 if request.exchange_id.lower() == 'mexc' else 10000
            }
        })
        
        # Try to fetch balance as a test
        await exchange.fetch_balance()
        await exchange.close()
        return {"status": "success", "message": "Connection Successful"}
        
    except Exception as e:
        if 'exchange' in locals():
            await exchange.close()
        raise HTTPException(status_code=400, detail=f"Connection Failed: {str(e)}")

@router.post("/order")
async def place_order(
    order: OrderRequest,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    """Place a REAL order on the exchange"""
    try:
        import time
        order._backend_start_time = time.perf_counter()
        
        from app.services.manual_trade_service import manual_trade_service
        return await manual_trade_service.place_manual_trade(db, current_user.id, order)
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Order placement failed: {e}")
        raise HTTPException(status_code=500, detail=f"Exchange Error: {str(e)}")

@router.get("/api-key-balance/{api_key_id}")
async def get_api_key_balance(
    api_key_id: int,
    symbol: str,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    """Fetch free margin balance mapped to a specific API key & symbol"""
    try:
        from app.services.manual_trade_service import manual_trade_service
        return await manual_trade_service.get_fast_balance(db, current_user.id, api_key_id, symbol)
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Balance fetch failed: {e}")
        raise HTTPException(status_code=500, detail=f"Balance Error: {str(e)}")

@router.get("/api-key-position/{api_key_id}")
async def get_api_key_position(
    api_key_id: int,
    symbol: str,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    """Fetch active position for a specific API key & symbol"""
    try:
        from app.services.manual_trade_service import manual_trade_service
        return await manual_trade_service.get_active_position(db, current_user.id, api_key_id, symbol)
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Position fetch failed: {e}")
        raise HTTPException(status_code=500, detail=f"Position Error: {str(e)}")

@router.post("/sor/preview")
async def preview_sor_order(
    request: SORRequest,
    current_user: models.User = Depends(deps.get_current_user)
):
    """
    Preview the split of a Smart Order (SOR).
    Does NOT execute trades.
    """
    try:
        from app.services.sor_engine import SOREngine
        schedule = SOREngine.route_order(
            symbol=request.symbol,
            total_quantity=request.amount,
            strategy_type=request.strategy,
            duration_minutes=request.duration_minutes,
            params=request.params
        )
        return {"schedule": schedule}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/sor/execute")
async def execute_sor_order(
    request: SORRequest,
    background_tasks: BackgroundTasks,
    current_user: models.User = Depends(deps.get_current_user)
):
    """
    Execute a Smart Order (SOR).
    Schedules child orders in the background.
    """
    # 1. Preview first to get the schedule
    try:
        from app.services.sor_engine import SOREngine
        from app.tasks import execute_sor_child_order
        
        schedule = SOREngine.route_order(
            symbol=request.symbol,
            total_quantity=request.amount,
            strategy_type=request.strategy,
            duration_minutes=request.duration_minutes,
            params=request.params
        )
        
        # 2. Schedule Tasks
        task_ids = []
        for child in schedule:
            # Calculate delay in seconds
            now = datetime.now()
            scheduled_time = child['scheduled_time']
            delay_seconds = (scheduled_time - now).total_seconds()
            
            if delay_seconds < 0: delay_seconds = 0
            
            # Queue Celery Task with Delay
            task = execute_sor_child_order.apply_async(
                args=[
                    current_user.id,
                    request.exchange_id,
                    request.symbol,
                    request.side,
                    child['quantity'],
                    None, # Price (MARKET for SOR usually)
                    'market' 
                ],
                countdown=delay_seconds
            )
            task_ids.append(task.id)
            
        return {
            "message": f"Successfully scheduled {len(task_ids)} child orders.",
            "strategy": request.strategy,
            "total_amount": request.amount,
            "task_ids": task_ids
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
