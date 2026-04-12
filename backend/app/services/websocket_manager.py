from typing import List, Dict
from fastapi import WebSocket

import logging

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        # active_connections: { "channel_id": [WebSocket1, WebSocket2] }
        # Channels can be "BTC/USDT" (market data) or "bot_123" (logs)
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, channel_id: str):
        await websocket.accept()
        if channel_id not in self.active_connections:
            self.active_connections[channel_id] = []
        self.active_connections[channel_id].append(websocket)
        # Changed to debug to avoid console spam on frequent reconnects
        logger.debug(f"🔌 Client connected to channel: {channel_id}")

    def disconnect(self, websocket: WebSocket, channel_id: str):
        if channel_id in self.active_connections:
            if websocket in self.active_connections[channel_id]:
                self.active_connections[channel_id].remove(websocket)
            if not self.active_connections[channel_id]:
                del self.active_connections[channel_id]

    async def broadcast(self, message: dict, channel_id: str):
        """Send message to a specific channel's subscribers"""
        if channel_id in self.active_connections:
            # Iterate over a copy to avoid modification during iteration issues
            for connection in self.active_connections[channel_id][:]:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    error_msg = str(e)
                    if "Cannot call \"send\" once a close message has been sent" in error_msg:
                        # Normal disconnection, just cleanup
                        self.disconnect(connection, channel_id)
                    else:
                        logger.error(f"⚠️ Error sending to WS: {error_msg}")
                        self.disconnect(connection, channel_id)
                    
    # Alias for backward compatibility if needed, or we can just update usages
    async def broadcast_to_symbol(self, symbol: str, message: dict):
        if symbol in self.active_connections:
            # কপি করে লুপ চালানো সেফ
            for connection in self.active_connections[symbol][:]:
                try:
                    await connection.send_json(message)
                except Exception:
                    self.disconnect(connection, symbol)

    # ✅ Unified Broadcast Method
    async def broadcast_status(self, task_type: str, task_id: str, status: str, progress: int, data: dict = None):
        """Unified method to broadcast task status to 'backtest' channel"""
        message = {
            "type": task_type,      # 'BACKTEST', 'DOWNLOAD', 'OPTIMIZE'
            "task_id": task_id,
            "status": status,       # 'processing', 'completed', 'failed'
            "progress": progress,
            "payload": data         # Result data (optional)
        }
        
        # Broadcast to 'backtest' channel which frontend will listen to
        await self.broadcast(message, "backtest")

    # ✅ Unified Market Data Broadcast
    async def broadcast_market_data(self, symbol: str, data_type: str, data: dict):
        """
        Broadcasts specific market data (ticker, depth, trade) to subscribers of that symbol.
        Message Format: { "type": "ticker", "data": {...} }
        """
        message = {
            "type": data_type,
            "data": data
        }
        await self.broadcast_to_symbol(symbol, message)

manager = ConnectionManager()
