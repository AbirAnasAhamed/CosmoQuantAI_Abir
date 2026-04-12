from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import logging
import asyncio
from app.services.liquidation_service import liquidation_service

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/candles")
async def get_candles(symbol: str, interval: str = "15m", limit: int = 50):
    """
    Get historical candle data (klines).
    """
    return await liquidation_service.get_klines(symbol, interval, limit)

@router.websocket("/ws/stream")
async def websocket_liquidation_stream(websocket: WebSocket, exchange: str = "binance", symbol: str = "BTC/USDT"):
    """
    WebSocket endpoint to stream real-time liquidation data.
    args:
        exchange: The exchange name (e.g., 'binance')
        symbol: The trading pair symbol to subscribe to (e.g., 'BTC/USDT').
    """
    await websocket.accept()
    logger.info(f"Client connected to Liquidation Stream for {exchange}:{symbol}")

    # Ensure symbol is uppercase for consistency
    target_symbol = symbol.upper()
    target_exchange = exchange.lower()

    # Subscribe to the requested exchange and symbol
    await liquidation_service.subscribe(target_exchange, target_symbol)

    async def send_to_client(data):
        try:
            # Filter messages: Only send data for the requested exchange and symbol
            # Note: in ccxt, symbols are often like 'BTC/USDT' or 'BTC/USDT:USDT'
            # The service returns the same symbol string asked for, so compare exact
            if data.get('symbol') == target_symbol and data.get('exchange') == target_exchange:
                await websocket.send_json(data)
        except Exception as e:
            logger.error(f"Error sending to client: {e}")
            raise e

    # Register the callback
    liquidation_service.register_callback(send_to_client)

    try:
        # Keep the connection alive
        while True:
            await websocket.receive_text()
            
    except WebSocketDisconnect:
        logger.info(f"Client disconnected from Liquidation Stream ({target_exchange}:{target_symbol})")
        if send_to_client in liquidation_service._callbacks:
            liquidation_service._callbacks.remove(send_to_client)
        await liquidation_service.unsubscribe(target_exchange, target_symbol)
            
    except Exception as e:
        logger.error(f"WebSocket Error: {e}")
        if send_to_client in liquidation_service._callbacks:
            liquidation_service._callbacks.remove(send_to_client)
        await liquidation_service.unsubscribe(target_exchange, target_symbol)
