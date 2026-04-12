import asyncio
import json
import logging
import websockets
from app.utils import get_redis_client

logger = logging.getLogger(__name__)

class BinanceLiquidationStream:
    def __init__(self):
        # We use the futures all-market liquidation stream
        self.url = "wss://fstream.binance.com/ws/!forceOrder@arr"
        self.redis = get_redis_client()
        self.running = False
        self._task = None

    async def start(self):
        if self.running:
            return
        logger.info("🟢 Starting Binance Liquidation Stream...")
        self.running = True
        self._task = asyncio.create_task(self._listen_loop())

    async def stop(self):
        self.running = False
        if self._task:
             self._task.cancel()
        logger.info("🔴 Stopped Binance Liquidation Stream.")

    async def _listen_loop(self):
        reconnect_delay = 1
        while self.running:
            try:
                async with websockets.connect(self.url) as websocket:
                    logger.info("🔗 Connected to Binance Liquidation WebSocket")
                    reconnect_delay = 1 # Reset delay on successful connection
                    while self.running:
                        try:
                            message = await asyncio.wait_for(websocket.recv(), timeout=60)
                            await self._handle_message(message)
                        except asyncio.TimeoutError:
                            # Send ping to keep connection alive
                            pong_waiter = await websocket.ping()
                            await asyncio.wait_for(pong_waiter, timeout=10)
            except Exception as e:
                if self.running:
                    logger.error(f"WebSocket Error: {e}. Reconnecting in {reconnect_delay}s...")
                    await asyncio.sleep(reconnect_delay)
                    reconnect_delay = min(reconnect_delay * 2, 60)
                
    async def _handle_message(self, message):
        try:
            data = json.loads(message)
            # data Structure for !forceOrder:
            # {
            #  "e":"forceOrder",    # Event Type
            #  "E":1568014460893,   # Event Time
            #  "o":{
            #       "s":"BTCUSDT",      # Symbol
            #       "S":"SELL",         # Side
            #       "o":"LIMIT",        # Order Type
            #       "f":"IOC",          # Time in Force
            #       "q":"0.014",        # Original Quantity
            #       "p":"9910",         # Price
            #       "ap":"9910",        # Average Price
            #       "X":"FILLED",       # Order Status
            #       "l":"0.014",        # Order Last Filled Quantity
            #       "z":"0.014",        # Order Filled Accumulated Quantity
            #       "T":1568014460893,  # Order Trade Time
            #   }
            # }
            
            if data.get("e") == "forceOrder":
                order_info = data.get("o", {})
                symbol = order_info.get("s")
                side = "short" if order_info.get("S") == "BUY" else "long" # If order side is BUY, a short was liquidated
                price = float(order_info.get("ap", order_info.get("p", 0)))
                qty = float(order_info.get("q", 0))
                amount = price * qty
                
                # Format symbol to match CCXT format (e.g., BTCUSDT -> BTC/USDT)
                # This is a simple heuristic. It might need refinement for other asset classes.
                if symbol.endswith("USDT"):
                    formatted_symbol = f"{symbol[:-4]}/USDT"
                else:
                    formatted_symbol = symbol 
                    
                payload = {
                    "symbol": formatted_symbol,
                    "side": side,
                    "price": price,
                    "qty": qty,
                    "amount": amount,
                    "timestamp": data.get("E")
                }
                
                # Publish to global stream
                channel = f"stream:liquidations:{formatted_symbol}"
                self.redis.publish(channel, json.dumps(payload))
                
                # Useful for debugging, but might be too spammy for all markets if uncommented
                # if amount > 10000:
                #     logger.debug(f"Published Liq: {formatted_symbol} | {side.upper()} | ${amount:,.2f} @ {price}")
                
        except Exception as e:
            logger.error(f"Error handling liq message: {e}")

# Global singleton
liquidation_stream = BinanceLiquidationStream()
