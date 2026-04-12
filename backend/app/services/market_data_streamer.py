import asyncio
import json
import logging
import ccxt.pro as ccxtpro
from typing import Dict, Set

from app.core.redis import redis_manager
from app.helpers.orderbook_math import calculate_dynamic_wall_threshold

logger = logging.getLogger(__name__)

class MarketDataStreamer:
    """
    Singleton class to manage background CCXT WebSocket connections 
    and publish market depth data to Redis Pub/Sub.
    """
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(MarketDataStreamer, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._active_streams: Set[str] = set()
        self._exchange_instances: Dict[str, ccxtpro.Exchange] = {}
        self._tasks: Dict[str, asyncio.Task] = {}
        self._lock = asyncio.Lock()
        self._initialized = True

    async def start_streaming(self, exchange_id: str, symbol: str):
        """Starts streaming order book data for a given exchange and symbol if not already running."""
        # For Kucoin/Kraken Futures, we need to use specific exchange IDs internally if the symbol has ':'
        internal_exchange_id = exchange_id.lower()
        if internal_exchange_id == 'kucoin' and ':' in symbol:
            internal_exchange_id = 'kucoinfutures'
        elif internal_exchange_id == 'kraken' and ':' in symbol:
            internal_exchange_id = 'krakenfutures'
            
        stream_key = f"{internal_exchange_id}:{symbol}"
        if stream_key in self._active_streams:
            return

        self._active_streams.add(stream_key)
        
        # Start the background tasks
        task_ob = asyncio.create_task(self._stream_order_book(internal_exchange_id, symbol, stream_key))
        task_trades = asyncio.create_task(self._stream_trades(internal_exchange_id, symbol, stream_key))
        self._tasks[stream_key] = [task_ob, task_trades]

    async def _get_exchange_instance(self, exchange_id: str, symbol: str) -> ccxtpro.Exchange:
        # Resolve to specific futures class if needed
        is_futures = ':' in symbol
        if exchange_id.lower() == 'kucoin' and is_futures:
            exchange_id = 'kucoinfutures'
        elif exchange_id.lower() == 'kraken' and is_futures:
            exchange_id = 'krakenfutures'
            
        async with self._lock:
            if exchange_id not in self._exchange_instances:
                exchange_class = getattr(ccxtpro, exchange_id.lower(), None)
                if not exchange_class:
                    raise ValueError(f"Exchange {exchange_id} not supported")
                
                exchange = exchange_class({'enableRateLimit': True})
                try:
                    await exchange.load_markets()
                except Exception as e:
                    logger.warning(f"Streamer failed to load markets for {exchange_id}: {e}")
                    
                self._exchange_instances[exchange_id] = exchange
                
        return self._exchange_instances[exchange_id]
        
    def _normalize_order_book_limit(self, exchange_id: str, limit: int) -> int:
        """Normalizes the order book limit based on exchange-specific requirements."""
        exchange_id = exchange_id.lower()
        if 'kucoin' in exchange_id: # Covers 'kucoin' and 'kucoinfutures'
            if limit <= 20: return 20
            else: return 100
        
        if 'binance' in exchange_id:
            # Binance supports: 5, 10, 20, 50, 100, 500, 1000, 5000 (futures up to 1000)
            if limit <= 5: return 5
            elif limit <= 10: return 10
            elif limit <= 20: return 20
            elif limit <= 50: return 50
            elif limit <= 100: return 100
            elif limit <= 500: return 500
            else: return 1000

        if 'kraken' in exchange_id: # Supports: 10, 25, 100, 500, 1000
            if limit <= 10: return 10
            elif limit <= 25: return 25
            elif limit <= 100: return 100
            elif limit <= 500: return 500
            else: return 1000
        if 'htx' in exchange_id:
            if limit <= 5: return 5
            elif limit <= 10: return 10
            elif limit <= 20: return 20
            else: return 150
            
        if 'bitfinex' in exchange_id:
            if limit <= 25: return 25
            else: return 100
            
        return limit

    async def _stream_order_book(self, exchange_id: str, symbol: str, stream_key: str):
        logger.info(f"🚀 Starting background CCXT stream for {stream_key}")
        redis = redis_manager.get_redis()
        channel = f"market_depth_stream:{exchange_id}:{symbol}"
        
        try:
            exchange = await self._get_exchange_instance(exchange_id, symbol)
        except Exception as e:
            logger.error(f"Failed to initialize exchange {exchange_id} for {symbol}: {e}")
            self._active_streams.discard(stream_key)
            return

        while stream_key in self._active_streams:
            try:
                depth_limit = self._normalize_order_book_limit(exchange_id, 50)
                
                # CCXT watch_order_book handles the WS connection gracefully behind the scenes
                orderbook = await exchange.watch_order_book(symbol.upper(), limit=depth_limit)

                bids = []
                bid_total = 0
                for bid in orderbook.get('bids', []):
                    price = float(bid[0])
                    size = float(bid[1])
                    bid_total += size
                    bids.append({"price": price, "size": size, "total": bid_total})
                    
                asks = []
                ask_total = 0
                for ask in orderbook.get('asks', []):
                    price = float(ask[0])
                    size = float(ask[1])
                    ask_total += size
                    asks.append({"price": price, "size": size, "total": ask_total})
                
                wall_threshold = calculate_dynamic_wall_threshold(bids, asks)
                
                walls = []
                for ask in asks:
                    if ask["size"] >= wall_threshold:
                        walls.append({"price": ask["price"], "type": "sell", "size": ask["size"]})
                for bid in bids:
                    if bid["size"] >= wall_threshold:
                        walls.append({"price": bid["price"], "type": "buy", "size": bid["size"]})
                        
                current_price = 0
                if asks and bids:
                    current_price = (asks[0]["price"] + bids[0]["price"]) / 2
                
                payload = {
                    "type": "orderbook",
                    "bids": bids,
                    "asks": asks,
                    "walls": walls,
                    "currentPrice": current_price
                }
                
                # Publish to Redis
                if redis:
                    await redis.publish(channel, json.dumps(payload))
                
            except Exception as e:
                logger.error(f"Error watching orderbook {symbol} on {exchange_id}: {e}")
                if "does not have market symbol" in str(e).lower() or "bad symbol" in str(e).lower():
                    logger.error(f"Invalid symbol {symbol} for exchange {exchange_id}")
                    if redis:
                        await redis.publish(channel, json.dumps({"error": f"Invalid symbol {symbol} or exchange error"}))
                    break
                    
                await asyncio.sleep(5) # Backoff before reconnecting
                
        # Cleanup
        self._active_streams.discard(stream_key)
        logger.info(f"🛑 Stopped background CCXT stream for {stream_key}")

    async def _stream_trades(self, exchange_id: str, symbol: str, stream_key: str):
        logger.info(f"🚀 Starting background CCXT trades stream for {stream_key}")
        redis = redis_manager.get_redis()
        channel = f"market_depth_stream:{exchange_id}:{symbol}"
        
        try:
            exchange = await self._get_exchange_instance(exchange_id, symbol)
        except Exception as e:
            logger.error(f"Failed to initialize exchange {exchange_id} for {symbol} trades: {e}")
            return

        while stream_key in self._active_streams:
            try:
                trades = await exchange.watch_trades(symbol.upper())
                
                if trades:
                    recent_volume = sum([float(t.get('amount', 0)) for t in trades])
                    last_price = float(trades[-1].get('price', 0))
                    
                    payload = {
                        "type": "trade",
                        "currentPrice": last_price,
                        "recentVolume": recent_volume
                    }
                    
                    if redis:
                        await redis.publish(channel, json.dumps(payload))
            except Exception as e:
                logger.error(f"Error watching trades {symbol} on {exchange_id}: {e}")
                await asyncio.sleep(5)


    async def stop_streaming(self, stream_key: str):
        """Stops a specific market data stream and cleans up its tasks."""
        if stream_key not in self._active_streams:
            return

        logger.info(f"🛑 Stopping stream: {stream_key}")
        self._active_streams.discard(stream_key)

        # Cancel associated tasks
        if stream_key in self._tasks:
            for task in self._tasks[stream_key]:
                if not task.done():
                    task.cancel()
            del self._tasks[stream_key]
            
        # Clean up exchange connection if no other streams are active for this exchange
        try:
            exchange_id = stream_key.split(':')[0]
            prefix = f"{exchange_id}:"
            remaining = any(k.startswith(prefix) for k in self._active_streams)
            
            if not remaining and exchange_id in self._exchange_instances:
                exchange = self._exchange_instances.pop(exchange_id)
                await exchange.close()
                logger.info(f"🔌 Closed CCXT exchange instance for {exchange_id} as no streams remain.")
        except Exception as e:
            logger.error(f"Error while cleaning up exchange connection for {stream_key}: {e}")

    async def stop_all(self):
        """Stops all running streams and closes exchange instances."""
        self._active_streams.clear()
        
        # Cancel all tasks
        for task_list in self._tasks.values():
            for task in task_list:
                task.cancel()
            
        # Close all exchange instances
        for exchange in self._exchange_instances.values():
            try:
                await exchange.close()
            except Exception as e:
                logger.error(f"Error closing exchange instance: {e}")
                
        self._exchange_instances.clear()
        self._tasks.clear()

market_data_streamer = MarketDataStreamer()
