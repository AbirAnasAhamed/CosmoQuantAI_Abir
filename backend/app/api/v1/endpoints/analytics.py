from typing import Any, Optional, List
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from datetime import datetime
import asyncio
import json

from app.api import deps
from app import models
from app.schemas.analytics import PerformanceMetrics, CorrelationRequest, CorrelationResponse, RollingCorrelationPoint
from app.services.analytics import analytics_service
from app.services.market_analysis_service import market_analysis_service
from app.services.websocket_manager import manager

router = APIRouter()

@router.get("/performance", response_model=PerformanceMetrics)
def get_performance_metrics(
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user),
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
) -> Any:
    """
    Get performance analytics (Sharpe Ratio, Max Drawdown, Win Rate) for current user only.
    """
    return analytics_service.calculate_performance_metrics(
        db=db,
        owner_id=current_user.id,
        start_date=start_date,
        end_date=end_date
    )


@router.post("/correlation-matrix", response_model=CorrelationResponse)
def get_correlation_matrix(
    request: CorrelationRequest,
    db: Session = Depends(deps.get_db)
) -> Any:
    """
    Calculate correlation matrix and cointegration for a list of assets.
    """
    try:
        if not request.symbols or len(request.symbols) < 2:
            raise HTTPException(status_code=400, detail="At least two symbols are required.")
            
        result = market_analysis_service.get_correlation_data(
            symbols=request.symbols,
            timeframe=request.timeframe
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/correlation/rolling", response_model=List[RollingCorrelationPoint])
def get_rolling_correlation(
    symbol_a: str,
    symbol_b: str,
    timeframe: str = "1h",
    window: int = 30,
    db: Session = Depends(deps.get_db)
) -> Any:
    """
    Get rolling correlation history between two assets.
    """
    try:
        return market_analysis_service.get_rolling_correlation(
            symbol_a=symbol_a,
            symbol_b=symbol_b,
            timeframe=timeframe,
            window=window
        )
    except Exception as e:
        print(f"Error calculating rolling correlation: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# IMPORTANT: Using router.websocket, not app.websocket
# The path here is RELATIVE to the router's prefix.
# If api_router includes this with prefix="/analytics", then url is /api/v1/analytics/ws/correlation
@router.websocket("/ws/correlation")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket, "correlation_feed")
    try:
        symbols = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'ADA/USDT', 'XRP/USDT', 'BNB/USDT']
        
        last_alert_time = {} # Track last alert timestamp per pair
        
        while True:
            try:
                data = market_analysis_service.get_correlation_data(symbols, "1h")

                # --- SIMULATION FOR VERIFICATION (REMOVE IN PROD) ---
                # Force a high Z-Score for BTC-ETH to verify alerts
                if 'cointegrated_pairs' in data and len(data['cointegrated_pairs']) > 0:
                     # Find or inject a pair for testing
                     found_test_pair = False
                     for pair in data['cointegrated_pairs']:
                         if (pair['asset_a'] == 'BTC/USDT' and pair['asset_b'] == 'ETH/USDT') or \
                            (pair['asset_a'] == 'ETH/USDT' and pair['asset_b'] == 'BTC/USDT'):
                             pair['z_score'] = 2.5  # Forced High Deviation
                             pair['p_value'] = 0.01 # Forced Cointegration
                             found_test_pair = True
                             break
                     
                     # If not found (e.g. no cointegration normally), mock one for the list
                     if not found_test_pair:
                         data['cointegrated_pairs'].append({
                             'asset_a': 'BTC/USDT',
                             'asset_b': 'ETH/USDT',
                             'p_value': 0.01,
                             'z_score': 2.5,
                             'spread': 0.0, # Dummy
                             'model_params': {} # Dummy
                         })
                # ----------------------------------------------------
                
                await websocket.send_json({
                    "type": "update",
                    "data": data
                })

                # Check for alerts with Throttling
                if 'cointegrated_pairs' in data:
                    current_time = datetime.now().timestamp()
                    for pair in data['cointegrated_pairs']:
                        pair_key = f"{pair['asset_a']}-{pair['asset_b']}"
                        
                        # Alert Condition: Z-Score > 2.0
                        if abs(pair['z_score']) > 2.0:
                            # Check Cooldown (e.g., 60 seconds)
                            if pair_key not in last_alert_time or (current_time - last_alert_time[pair_key] > 60):
                                await websocket.send_json({
                                    "type": "alert",
                                    "pair": pair_key,
                                    "message": f"High Cointegration Signal! {pair['asset_a']}/{pair['asset_b']} Z-Score: {pair['z_score']:.2f}"
                                })
                                last_alert_time[pair_key] = current_time
                
                await asyncio.sleep(2)
            except WebSocketDisconnect:
                print("Client disconnected normally in loop.")
                break
            except RuntimeError as e:
                if "send" in str(e) and "close" in str(e):
                    print("Client disconnected (RuntimeError) in loop.")
                    break
                print(f"RuntimeError in correlation loop: {e}")
                await asyncio.sleep(5)
            except Exception as e:
                print(f"Error in correlation loop: {e}")
                await asyncio.sleep(5) 
                
    except WebSocketDisconnect:
        manager.disconnect(websocket, "correlation_feed")
    except Exception as e:
        print(f"WebSocket endpoint error: {e}")
        manager.disconnect(websocket, "correlation_feed")  # Ensure cleanup
