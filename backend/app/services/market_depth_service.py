import ccxt.async_support as ccxt
import json
import logging
import math
import asyncio
from typing import Dict, List, Any, Optional
from app.core.config import settings
from app.core.redis import redis_manager

logger = logging.getLogger(__name__)

class MarketDepthService:
    """
    Service to fetch and aggregate order book data (Market Depth) for visualization.
    Implements caching using Redis to prevent rate limiting.
    """

    def __init__(self):
        self._exchanges: Dict[str, Any] = {}
        self._lock = asyncio.Lock()

    async def get_exchange_instance(self, exchange_id: str, symbol: Optional[str] = None):
        exchange_id = exchange_id.lower()
        
        # If the symbol looks like a futures symbol (contains ':'), we may need specific config
        is_futures = symbol and ':' in symbol
        
        if exchange_id == 'binance' and is_futures:
            cache_id = 'binance_futures'
        elif exchange_id == 'kucoin' and is_futures:
            cache_id = 'kucoinfutures'
        elif exchange_id == 'kraken' and is_futures:
            cache_id = 'krakenfutures'
        else:
            cache_id = exchange_id

        async with self._lock:
            if cache_id not in self._exchanges:
                # For Kucoin/Kraken Futures, use the dedicated class
                real_class_id = cache_id if cache_id in ['kucoinfutures', 'krakenfutures'] else exchange_id
                logger.info(f"Creating exchange instance for {cache_id} (class: {real_class_id})")
                exchange_class = getattr(ccxt, real_class_id, None)
                
                if not exchange_class:
                    logger.error(f"Exchange class '{real_class_id}' not found in CCXT async_support.")
                    raise ValueError(f"Exchange '{real_class_id}' not supported.")
                
                options = {
                    'enableRateLimit': True,
                    'options': {'adjustForTimeDifference': True}
                }
                
                if cache_id == 'binance_futures':
                    options['options'] = {'defaultType': 'swap'}  # 'swap' = USDⓈ-M (fapi.binance.com); 'future' = COIN-M (dapi.binance.com)
                    
                exchange = exchange_class(options)
                try:
                    logger.info(f"Loading markets for {cache_id} at initialization...")
                    await exchange.load_markets()
                except Exception as e:
                    logger.warning(f"Failed to load markets for {cache_id} during initialization: {e}")
                    
                self._exchanges[cache_id] = exchange
                
        return self._exchanges[cache_id]

    async def close_all_exchanges(self):
        for exchange in self._exchanges.values():
            await exchange.close()
        self._exchanges.clear()

    def _normalize_order_book_limit(self, exchange_id: str, limit: int) -> int:
        """
        Normalizes the order book limit based on exchange-specific requirements.
        """
        exchange_id = exchange_id.lower()
        
        if exchange_id == 'kucoin':
            # Kucoin supports: 20 or 100
            if limit <= 20: 
                return 20
            else: 
                return 100
        
        if exchange_id == 'binance':
            # Binance supports: 5, 10, 20, 50, 100, 500, 1000, 5000 (futures up to 1000)
            if limit <= 5: return 5
            elif limit <= 10: return 10
            elif limit <= 20: return 20
            elif limit <= 50: return 50
            elif limit <= 100: return 100
            elif limit <= 500: return 500
            else: return 1000

        if exchange_id == 'kraken':
            # Kraken supports: 10, 25, 100, 500, 1000
            if limit <= 10: return 10
            elif limit <= 25: return 25
            elif limit <= 100: return 100
            elif limit <= 500: return 500
            else: return 1000
        
        if exchange_id == 'htx':
            # HTX supports: 5, 10, 20, 150
            if limit <= 5: return 5
            elif limit <= 10: return 10
            elif limit <= 20: return 20
            else: return 150
            
        return limit

    async def fetch_order_book_heatmap(
        self, 
        symbol: str, 
        exchange_id: str = 'binance', 
        depth: int = 100, 
        bucket_size: float = 50.0
    ) -> Dict[str, Any]:
        """
        Fetches the order book and aggregates it into price buckets.
        
        Args:
            symbol (str): Trading pair, e.g., 'BTC/USDT'.
            exchange_id (str): Exchange name, e.g., 'binance'.
            depth (int): Number of order book levels to fetch.
            bucket_size (float): Price range for grouping orders.

        Returns:
            Dict[str, Any]: {
                "current_price": float,
                "bids": [{"price": float, "volume": float}, ...],
                "asks": [{"price": float, "volume": float}, ...],
                "symbol": str,
                "exchange": str
            }
        """
        # normalize inputs
        symbol = symbol.upper()
        exchange_id = exchange_id.lower()
        
        # 1. Check Cache
        cache_key = f"market_depth:{exchange_id}:{symbol}:{bucket_size}"
        redis = redis_manager.get_redis()
        
        if redis:
            cached_data = await redis.get(cache_key)
            if cached_data:
                return json.loads(cached_data)

        # 2. Fetch Live Data
        exchange = await self.get_exchange_instance(exchange_id, symbol)
        
        try:
            # Normalize limit for different exchanges
            depth = self._normalize_order_book_limit(exchange_id, depth)
                
            # Fetch Order Book
            order_book = await exchange.fetch_order_book(symbol, limit=depth)
            
            # Fetch Ticker for current price (or use mid price from order book)
            ticker = await exchange.fetch_ticker(symbol)
            current_price = ticker.get('last', 0.0)

            # 3. Aggregate Data
            aggregated_bids = self._aggregate_orders(order_book['bids'], bucket_size, is_bid=True)
            aggregated_asks = self._aggregate_orders(order_book['asks'], bucket_size, is_bid=False)
            
            result = {
                "symbol": symbol,
                "exchange": exchange_id,
                "current_price": current_price,
                "bids": aggregated_bids,
                "asks": aggregated_asks
            }

            # 4. Cache Result (5 seconds TTL)
            if redis:
                await redis.setex(cache_key, 5, json.dumps(result))

            return result

        except Exception as e:
            logger.error(f"Error fetching market depth for {symbol} on {exchange_id}: {e}")
            raise e

    def _aggregate_orders(self, orders: List[List[float]], bucket_size: float, is_bid: bool) -> List[Dict[str, float]]:
        """
        Groups orders into price buckets.
        
        Args:
            orders: List of [price, amount]
            bucket_size: Size of each price bucket
            is_bid: True if aggregating bids (round down), False for asks (round up)
            
        Returns:
            List of dictionaries with 'price' (bucket) and 'volume' (sum).
        """
        buckets = {}
        
        for level in orders:
            price, amount = level[0], level[1]
            if bucket_size > 0:
                # Group both bids and asks into uniform buckets to avoid artificial spreads
                # Floor division ensures everything snaps to the same grid
                bucket_price = math.floor(price / bucket_size) * bucket_size
            else:
                bucket_price = price
                
            # Avoid float precision issues for keys, using 8 decimals for altcoins
            bucket_price = round(bucket_price, 8)
            
            if bucket_price not in buckets:
                buckets[bucket_price] = 0.0
            buckets[bucket_price] += amount

        # Convert to list and sort
        sorted_buckets = [
            {"price": price, "volume": volume} 
            for price, volume in buckets.items()
        ]
        
        # Sort bids descending (highest price first), asks ascending (lowest price first)
        sorted_buckets.sort(key=lambda x: x['price'], reverse=is_bid)
        
        return sorted_buckets

    async def get_available_exchanges(self) -> List[str]:
        """
        Returns a list of all exchanges supported by CCXT.
        """
        # Filter for major exchanges to avoid overwhelming the UI, or return all
        # For now, let's return a curated list of popular ones + generic
        popular = ['binance', 'kraken', 'coinbase', 'kucoin', 'bybit', 'okx', 'bitfinex', 'gateio', 'htx', 'mexc']
        return popular

    async def get_exchange_markets(self, exchange_id: str) -> List[str]:
        """
        Returns a list of symbols for a given exchange.
        For Binance and Kucoin, it merges both Spot and Futures markets.
        """
        cache_key = f"markets:{exchange_id}"
        redis = redis_manager.get_redis()
        
        if redis:
            cached = await redis.get(cache_key)
            if cached:
                return json.loads(cached)

        symbols = []
        try:
            logger.info(f"Fetching markets for {exchange_id}...")
            # 1. Fetch Spot Markets
            spot_exchange = await self.get_exchange_instance(exchange_id)
            spot_markets = await spot_exchange.load_markets()
            symbols.extend(list(spot_markets.keys()))
            logger.info(f"Fetched {len(spot_markets)} spot markets for {exchange_id}")

            # 2. Fetch Futures Markets (if applicable)
            if exchange_id == 'binance':
                logger.info("Fetching Binance Futures markets...")
                futures_exchange = await self.get_exchange_instance('binance', symbol='BTC/USDT:USDT')
                futures_markets = await futures_exchange.load_markets()
                symbols.extend(list(futures_markets.keys()))
                logger.info(f"Fetched {len(futures_markets)} Binance futures markets")
            elif exchange_id == 'kucoin':
                logger.info("Fetching Kucoin Futures markets...")
                futures_exchange = await self.get_exchange_instance('kucoin', symbol='BTC/USDT:USDT')
                futures_markets = await futures_exchange.load_markets()
                symbols.extend(list(futures_markets.keys()))
                logger.info(f"Fetched {len(futures_markets)} Kucoin futures markets")
            elif exchange_id == 'kraken':
                logger.info("Fetching Kraken Futures markets...")
                try:
                    futures_exchange = await self.get_exchange_instance('kraken', symbol='BTC/USDT:USDT')
                    futures_markets = await futures_exchange.load_markets()
                    symbols.extend(list(futures_markets.keys()))
                    logger.info(f"Fetched {len(futures_markets)} Kraken futures markets")
                except Exception as e:
                    logger.error(f"Error fetching Kraken futures markets. It might be due to API accessibility or CCXT version: {e}")
            
            # Remove duplicates and sort
            symbols = sorted(list(set(symbols)))
            logger.info(f"Total merged markets for {exchange_id}: {len(symbols)}")

            # Cache for 1 hour as markets don't change often
            if redis:
                await redis.setex(cache_key, 3600, json.dumps(symbols))
            return symbols
        except Exception as e:
            logger.error(f"Error loading markets for {exchange_id}: {e}")
            raise e

    async def fetch_ohlcv(self, symbol: str, exchange_id: str, timeframe: str = '1h', limit: int = 100) -> List[Dict[str, Any]]:
        """
        Fetches OHLCV data for a symbol.
        """
        cache_key = f"ohlcv:{exchange_id}:{symbol}:{timeframe}"
        redis = redis_manager.get_redis()

        if redis:
            cached = await redis.get(cache_key)
            if cached:
                return json.loads(cached)

        exchange = await self.get_exchange_instance(exchange_id, symbol)
        try:
            # CCXT returns list of [timestamp, open, high, low, close, volume]
            ohlcv = await exchange.fetch_ohlcv(symbol, timeframe, limit=limit)
            
            # Format for Lightweight Charts: { time: seconds, open, high, low, close }
            formatted_data = []
            for candle in ohlcv:
                formatted_data.append({
                    "time": int(candle[0] / 1000), # Unix timestamp in seconds
                    "open": candle[1],
                    "high": candle[2],
                    "low": candle[3],
                    "close": candle[4],
                    "volume": candle[5]
                })

            # Decorate data with mathematical candlestick patterns
            from app.helpers.candlestick_patterns import attach_candlestick_patterns
            formatted_data = attach_candlestick_patterns(formatted_data)

            if redis:
                # Cache for timeframe duration (e.g. 1m -> 60s, 1h -> 3600s)
                # Simplified TTL: 10 seconds to allow fast Supertrend reaction for active candles
                await redis.setex(cache_key, 10, json.dumps(formatted_data))
            
            return formatted_data
        except Exception as e:
            logger.error(f"Error fetching OHLCV for {symbol}: {e}")
            raise e


    async def fetch_raw_order_book(self, symbol: str, exchange_id: str, limit: int = 100) -> Dict[str, Any]:
        """
        Fetches the raw order book from the exchange.
        """
        exchange = await self.get_exchange_instance(exchange_id, symbol)
        try:
            # Normalize limit for different exchanges
            limit = self._normalize_order_book_limit(exchange_id, limit)
            
            order_book = await exchange.fetch_order_book(symbol.upper(), limit=limit)
            return {
                "symbol": symbol.upper(),
                "exchange": exchange_id.lower(),
                "bids": [{"price": b[0], "size": b[1]} for b in order_book.get('bids', [])],
                "asks": [{"price": a[0], "size": a[1]} for a in order_book.get('asks', [])],
                "timestamp": order_book.get('timestamp'),
                "datetime": order_book.get('datetime')
            }
        except Exception as e:
            logger.error(f"Error fetching raw order book for {symbol} on {exchange_id}: {e}")
            raise e

market_depth_service = MarketDepthService()
