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


# --- Schemas ---
class OrderRequest(BaseModel):
    symbol: str
    side: str # 'buy' or 'sell'
    type: str # 'market' or 'limit'
    amount: float
    price: Optional[float] = None
    exchange_id: str = 'binance'

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
    
    # ১. ব্যবহারকারীর API Key খুঁজে বের করা
    api_key_record = db.query(models.ApiKey).filter(
        models.ApiKey.user_id == current_user.id,
        models.ApiKey.exchange == order.exchange_id,
        models.ApiKey.is_enabled == True
    ).first()

    if not api_key_record:
        raise HTTPException(status_code=404, detail=f"No active API key found for {order.exchange_id}")

    exchange = None
    try:
        # ২. সিক্রেট কি ডিক্রিপ্ট করা এবং এক্সচেঞ্জ সেটআপ
        decrypted_secret = decrypt_key(api_key_record.secret_key)
        exchange_class = getattr(ccxt, order.exchange_id, None)
        
        if not exchange_class:
             raise HTTPException(status_code=400, detail="Unsupported exchange")

        exchange_config = {
            'apiKey': api_key_record.api_key,
            'secret': decrypted_secret,
            'enableRateLimit': True,
            'options': {
                'adjustForTimeDifference': True,
                'recvWindow': 60000 if order.exchange_id.lower() == 'mexc' else 10000
            }
        }
        
        if hasattr(api_key_record, 'passphrase') and api_key_record.passphrase:
            try:
                exchange_config['password'] = decrypt_key(api_key_record.passphrase)
            except Exception:
                exchange_config['password'] = api_key_record.passphrase

        exchange = exchange_class(exchange_config)

        # ৩. অর্ডার প্লেস করা
        response = None
        if order.type.lower() == 'market':
            response = await exchange.create_market_order(order.symbol, order.side, order.amount)
        elif order.type.lower() == 'limit':
            if not order.price:
                raise HTTPException(status_code=400, detail="Price is required for limit orders")
            response = await exchange.create_limit_order(order.symbol, order.side, order.amount, order.price)
        else:
             raise HTTPException(status_code=400, detail="Invalid order type")

        return {
            "id": response['id'],
            "symbol": response['symbol'],
            "status": response.get('status', 'open'),
            "side": response['side'],
            "amount": response['amount'],
            "price": response.get('price') or response.get('average'),
            "message": "Order placed successfully"
        }

    except Exception as e:
        logger.error(f"Order placement failed: {e}")
        raise HTTPException(status_code=500, detail=f"Exchange Error: {str(e)}")
    
    finally:
        if exchange:
            await exchange.close()

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
