
import asyncio
import json
import logging
import time
import websockets
import aiohttp
import ccxt.async_support as ccxt
from typing import Dict, List, Set, Any, Optional

logger = logging.getLogger(__name__)

class SharedMarketStream:
    """
    Manages a single WebSocket connection for a specific symbol and timeframe.
    Multiple bots can subscribe to this stream.
    """
    def __init__(self, exchange_id: str, symbol: str, timeframe: str):
        self.exchange_id = exchange_id.lower()
        self.symbol = symbol
        self.timeframe = timeframe
        self.ws_url: Optional[str] = None
        self.subscribers: Set[Any] = set() # Set of AsyncBotInstance objects
        self.is_running = False
        self.last_price = 0.0
        self.last_update = 0.0
        self.ping_interval = None
        
        # Connection management
        self._task = None
        
    async def subscribe(self, bot_instance):
        """Add a bot instance to subscribers."""
        self.subscribers.add(bot_instance)
        logger.info(f"Bot {bot_instance.bot.id} subscribed to stream {self.symbol} ({self.timeframe})")
        # If this is the first subscriber, start the stream
        if not self.is_running:
            await self.start()
            
    async def unsubscribe(self, bot_instance):
        """Remove a bot instance from subscribers."""
        if bot_instance in self.subscribers:
            self.subscribers.remove(bot_instance)
            logger.info(f"Bot {bot_instance.bot.id} unsubscribed from stream {self.symbol}")
            
        # If no subscribers left, stop the stream
        if not self.subscribers:
            await self.stop()

    async def start(self):
        """Start the background WebSocket task."""
        if self.is_running:
            return
            
        self.is_running = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info(f"Started Shared Stream for {self.symbol} ({self.exchange_id})")

    async def stop(self):
        """Stop the background task."""
        self.is_running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._task = None
        logger.info(f"Stopped Shared Stream for {self.symbol}")

    def _notify_subscribers(self, price: float, candle_data: dict = None):
        """Notify all subscribers with new data."""
        self.last_price = price
        self.last_update = time.time()
        
        for bot in list(self.subscribers):
            try:
                # We call process_tick directly on the bot instance
                # This assumes AsyncBotInstance has a non-blocking process_tick method
                asyncio.create_task(bot.process_tick(price, candle_data))
            except Exception as e:
                logger.error(f"Error notifying bot {bot.bot.id}: {e}")

    async def _run_loop(self):
        """Main WebSocket Loop."""
        while self.is_running:
            try:
                # 1. Get URL
                if not self.ws_url:
                    self.ws_url, self.ping_interval = await self._get_ws_url()
                    
                if not self.ws_url:
                    logger.warning(f"Could not get WS URL for {self.symbol}, retrying in 5s...")
                    await asyncio.sleep(5)
                    continue

                # 2. Connect
                logger.info(f"Connecting to {self.ws_url} for {self.symbol}...")
                async with websockets.connect(self.ws_url, ping_interval=None) as ws:
                    
                    # KuCoin requires explicit subscribe message
                    if 'kucoin' in self.exchange_id:
                        await self._send_kucoin_subscription(ws)

                    last_ping = time.time()

                    while self.is_running:
                        try:
                            msg = await asyncio.wait_for(ws.recv(), timeout=2.0)
                            await self._process_message(msg)
                        except asyncio.TimeoutError:
                            # Handle Ping
                            if self.ping_interval and (time.time() - last_ping > self.ping_interval):
                                try:
                                    await ws.send(json.dumps({"id": int(time.time() * 1000), "type": "ping"}))
                                    last_ping = time.time()
                                except: pass
                            continue
                        except Exception as e:
                            logger.error(f"WS Recv Error: {e}")
                            break
            except Exception as e:
                logger.error(f"Stream Loop Error ({self.symbol}): {e}")
                await asyncio.sleep(5)
                self.ws_url = None # Force re-negotiation

    async def _get_ws_url(self):
        """Get WebSocket URL (Copied logic from LiveBotEngine)."""
        symbol_clean = self.symbol.replace('/', '').lower()
        
        if 'binance' in self.exchange_id:
            return f"wss://stream.binance.com:9443/ws/{symbol_clean}@kline_{self.timeframe}", None
            
        elif 'kucoin' in self.exchange_id:
            return await self._negotiate_kucoin_token()
            
        return None, None

    async def _negotiate_kucoin_token(self):
        """Negotiate KuCoin Public Token."""
        try:
            url = "https://api.kucoin.com/api/v1/bullet-public"
            async with aiohttp.ClientSession() as session:
                async with session.post(url) as response:
                    if response.status == 200:
                        data = await response.json()
                        if data['code'] == '200000':
                            token = data['data']['token']
                            endpoint = data['data']['instanceServers'][0]['endpoint']
                            ping = int(data['data']['instanceServers'][0].get('pingInterval', 18000)) / 1000
                            return f"{endpoint}?token={token}", ping
        except Exception as e:
            logger.error(f"KuCoin Negotiation Error: {e}")
        return None, None

    async def _send_kucoin_subscription(self, ws):
        """Send KuCoin Subscribe Message."""
        # Map timeframe to KuCoin format
        tf_map = {'1m': '1min', '5m': '5min', '15m': '15min', '30m': '30min', '1h': '1hour', '4h': '4hour', '1d': '1day'}
        k_tf = tf_map.get(self.timeframe, self.timeframe)
        
        topic = f"/market/candles:{self.symbol.replace('/', '-')}_{k_tf}"
        sub_msg = {
            "id": int(time.time() * 1000),
            "type": "subscribe",
            "topic": topic,
            "privateChannel": False,
            "response": True
        }
        await ws.send(json.dumps(sub_msg))

    async def _process_message(self, message):
        """Process incoming WebSocket message."""
        try:
            data = json.loads(message)
            # DEBUG: Trace incoming WS messages
            # print(f"DEBUG WS MSG ({self.symbol}): {data.get('type', 'unknown')}")
            
            close_price = 0.0
            candle = None

            # Binance
            if 'k' in data and 's' in data:
                kline = data['k']
                close_price = float(kline['c'])
                candle = kline # Passing raw kline for now, can normalize later

            # KuCoin
            elif data.get('type') == 'message' and 'candles' in data.get('data', {}):
                c_data = data['data']['candles']
                close_price = float(c_data[2])
                candle = c_data

            if close_price > 0:
                self._notify_subscribers(close_price, candle)
                
        except Exception as e:
            pass # Silent fail for hearbeats/ack messages
