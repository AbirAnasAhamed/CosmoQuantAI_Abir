from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import logging
import asyncio
from app.services.god_mode_liquidation_service import god_mode_service

router = APIRouter()
logger = logging.getLogger(__name__)

@router.websocket("/ws/god-mode")
async def websocket_god_mode_stream(websocket: WebSocket, symbol: str = "BTC/USDT"):
    """
    Advanced WebSocket endpoint for the God Mode Dashboard.
    Streams consolidated multi-exchange analytics and mathematical heuristics.
    """
    await websocket.accept()
    logger.info(f"Client connected to God Mode Stream for {symbol}")
    
    target_symbol = symbol.upper()
    
    # Start the background pipeline if not already running for this symbol
    asyncio.create_task(god_mode_service.start(target_symbol))
    
    async def send_to_client(data):
        try:
            if data.get("symbol") == target_symbol:
                await websocket.send_json(data)
        except Exception as e:
            logger.error(f"Error sending to client in God Mode: {e}")
            raise e
            
    god_mode_service.register_callback(send_to_client)
    
    try:
        while True:
            # We don't necessarily expect incoming messages, but we keep the connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        logger.info(f"Client disconnected from God Mode Stream")
        god_mode_service.remove_callback(send_to_client)
    except Exception as e:
        logger.error(f"God Mode WebSocket Error: {e}")
        god_mode_service.remove_callback(send_to_client)
