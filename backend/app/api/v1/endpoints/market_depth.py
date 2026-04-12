from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from typing import Any
import json
import asyncio
import websockets
from app.services.market_depth_service import market_depth_service
from app.services.orderbook_snapshot_service import orderbook_snapshot_service
from app.helpers.orderbook_math import calculate_dynamic_wall_threshold
from datetime import datetime

router = APIRouter()

@router.get("/heatmap", response_model=Any)
async def get_order_book_heatmap(
    symbol: str = Query(..., description="Trading pair, e.g., 'BTC/USDT'"),
    exchange: str = Query("binance", description="Exchange name, e.g., 'binance'"),
    bucket_size: float = Query(50.0, description="Price bucket size for aggregation"),
    depth: int = Query(100, description="Depth of order book to fetch")
) -> Any:
    """
    Get aggregated order book data for heatmap visualization.
    """
    try:
        data = await market_depth_service.fetch_order_book_heatmap(
            symbol=symbol,
            exchange_id=exchange,
            depth=depth,
            bucket_size=bucket_size
        )
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/heatmap/historical", response_model=Any)
async def get_historical_order_book_heatmap(
    symbol: str = Query(..., description="Trading pair, e.g., 'BTC/USDT'"),
    exchange: str = Query("binance", description="Exchange name, e.g., 'binance'"),
    start_time: str = Query(..., description="ISO formated start time string"),
    end_time: str = Query(..., description="ISO formated end time string"),
    interval: str = Query("1m", description="Interval granularity")
) -> Any:
    """
    Get historically recorded aggregated order book data.
    """
    try:
        start_dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
        end_dt = datetime.fromisoformat(end_time.replace('Z', '+00:00'))
        
        data = await orderbook_snapshot_service.get_historical_snapshots(
            symbol=symbol,
            exchange=exchange,
            start_time=start_dt,
            end_time=end_dt,
            interval=interval
        )
        return {"snapshots": data}
    except ValueError as val_e:
        raise HTTPException(status_code=400, detail=f"Invalid date format: {val_e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
@router.get("/exchanges", response_model=list[str])
async def get_exchanges() -> Any:
    """List available exchanges."""
    return await market_depth_service.get_available_exchanges()

@router.get("/markets", response_model=list[str])
async def get_markets(
    exchange: str = Query(..., description="Exchange ID")
) -> Any:
    """List markets (symbols) for an exchange."""
    try:
        return await market_depth_service.get_exchange_markets(exchange)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/ohlcv", response_model=Any)
async def get_ohlcv(
    symbol: str = Query(..., description="Trading Pair"),
    exchange: str = Query(..., description="Exchange ID"),
    timeframe: str = Query("1h", description="Timeframe (1m, 1h, 1d)"),
    limit: int = Query(100, description="Number of candles")
) -> Any:
    """Get OHLCV data for chart."""
    try:
        return await market_depth_service.fetch_ohlcv(symbol, exchange, timeframe, limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/book", response_model=Any)
async def get_raw_order_book(
    symbol: str = Query(..., description="Trading Pair"),
    exchange: str = Query(..., description="Exchange ID"),
    limit: int = Query(100, description="Depth limit")
) -> Any:
    """Get raw order book data."""
    try:
        return await market_depth_service.fetch_raw_order_book(symbol, exchange, limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from app.core.redis import redis_manager
from app.services.market_data_streamer import market_data_streamer
import asyncio

@router.websocket("/ws/{exchange_id}/{symbol:path}")
async def websocket_market_depth(websocket: WebSocket, exchange_id: str, symbol: str):
    await websocket.accept()
    
    # Ensure background CCXT stream is running and publishing to Redis
    await market_data_streamer.start_streaming(exchange_id, symbol)
    
    redis = redis_manager.get_redis()
    if not redis:
        await websocket.close(code=1011, reason="Redis connection failed")
        return
        
    internal_exchange_id = exchange_id.lower()
    if internal_exchange_id == 'kucoin' and ':' in symbol:
        internal_exchange_id = 'kucoinfutures'
    elif internal_exchange_id == 'kraken' and ':' in symbol:
        internal_exchange_id = 'krakenfutures'
        
    channel_name = f"market_depth_stream:{internal_exchange_id}:{symbol}"
    pubsub = redis.pubsub()
    await pubsub.subscribe(channel_name)
    
    async def redis_listener():
        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    data = message["data"]
                    payload = json.loads(data)
                    if "error" in payload:
                        await websocket.close(code=1008, reason=payload["error"])
                        return
                    await websocket.send_text(data)
        except Exception:
            pass

    async def client_listener():
        try:
            while True:
                await websocket.receive_text()
        except Exception:
            pass

    redis_task = asyncio.create_task(redis_listener())
    client_task = asyncio.create_task(client_listener())
    
    done, pending = await asyncio.wait(
        [redis_task, client_task],
        return_when=asyncio.FIRST_COMPLETED
    )
    
    for task in pending:
        task.cancel()
        
    try:
        await pubsub.unsubscribe(channel_name)
        await pubsub.close()
    except Exception:
        pass
    try:
        await websocket.close()
    except Exception:
        pass
