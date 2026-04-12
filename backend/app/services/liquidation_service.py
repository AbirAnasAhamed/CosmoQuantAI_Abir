import asyncio
import json
import logging
import time
from typing import Optional, Dict, Any, Callable, Awaitable, Set

import ccxt.pro as ccxtpro  # type: ignore
from ccxt.base.errors import NotSupported, ExchangeNotAvailable, InvalidNonce, NetworkError  # type: ignore

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class LiquidationService:
    """
    Service to fetch real-time liquidation data using CCXT Pro WebSockets.
    Supports dynamic subscription to specific exchange and symbol streams.
    """
    def __init__(self):
        """
        Initialize the LiquidationService.
        """
        self._running = False
        self._callbacks: list[Callable[[Dict[str, Any]], Awaitable[None]]] = []
        
        # Track active subscriptions and exchanges
        self._active_subscriptions: Dict[str, asyncio.Task] = {}
        self._sub_counts: Dict[str, int] = {} # Track number of subscribers per sub_id
        self._exchanges: Dict[str, ccxtpro.Exchange] = {}
        self._lock = asyncio.Lock()

    def register_callback(self, callback: Callable[[Dict[str, Any]], Awaitable[None]]):
        """
        Register a callback function to receive liquidation data.
        """
        self._callbacks.append(callback)

    async def _broadcast(self, data: Dict[str, Any]):
        """
        Broadcast the liquidation data to registered callbacks.
        """
        for callback in self._callbacks:
            try:
                await callback(data)
            except Exception as e:
                logger.error(f"Error in callback: {e}")

    async def _get_exchange(self, exchange_id: str) -> ccxtpro.Exchange:
        """
        Get or initialize a CCXT Pro exchange instance.
        """
        if exchange_id not in self._exchanges:
            try:
                # Dynamically instantiate the exchange
                exchange_class = getattr(ccxtpro, exchange_id)
                options = {}
                
                # Binance needs defaultType = 'future' or 'delivery' to get liquidations usually
                if exchange_id == 'binance':
                    # ccxt prefers using explicitly binanceusdm or passing options
                    options['defaultType'] = 'future'
                    
                self._exchanges[exchange_id] = exchange_class({
                    'enableRateLimit': True,
                    'newUpdates': True, # Retrieve only new data on watch calls
                    'options': options
                })
            except AttributeError:
                logger.error(f"Exchange {exchange_id} not found in ccxt.pro")
                raise ValueError(f"Exchange {exchange_id} not supported.")
                
        return self._exchanges[exchange_id]

    async def subscribe(self, exchange_id: str, symbol: str):
        """
        Subscribe to specific symbol liquidation streams on a specific exchange.
        """
        if not exchange_id:
            exchange_id = 'binance'

        sub_id = f"{exchange_id}:{symbol}"
        
        async def watch_loop(exchange: ccxtpro.Exchange, sym: str):
            logger.info(f"Started CCXT watch_liquidations loop for {exchange.id} {sym}")
            while self._running:
                try:
                    # Depending on CCXT version and exchange, it might return a list or dict
                    liquidations = await exchange.watch_liquidations(sym)
                    
                    if not isinstance(liquidations, list):
                        liquidations = [liquidations]
                        
                    for liq in liquidations:
                        # Map CCXT structure to our frontend structure
                        side = liq.get('side', '') 
                        # In CCXT, side is usually the direction of the trade that caused liquidation.
                        # Usually, if a long is liquidated, it's a SELL order. If a short is liquidated, it's a BUY order.
                        # Safely handle potential None values gracefully
                        price = liq.get('price')
                        price = float(price) if price is not None else 0.0
                        
                        amount = liq.get('amount')
                        amount = float(amount) if amount is not None else 0.0
                        
                        contracts = liq.get('contracts')
                        contracts = float(contracts) if contracts is not None else 0.0
                        
                        contractSize = liq.get('contractSize')
                        contractSize = float(contractSize) if contractSize is not None else 1.0
                        
                        quoteValue = liq.get('quoteValue')
                        quoteValue = float(quoteValue) if quoteValue is not None else 0.0

                        usd_value = quoteValue or (price * amount)
                        if usd_value == 0:
                            # Try contracts * contractSize * price
                            usd_value = contracts * contractSize * price
                        
                        liq_type = "Long Liquidation" if side.lower() == "sell" else "Short Liquidation"
                        if not side:
                            liq_type = "Long Liquidation" # Fallback
                            
                        processed_data = {
                            "exchange": exchange.id,
                            "symbol": sym, # The symbol string
                            "side": side.upper() if side else "",
                            "type": liq_type,
                            "price": price,
                            "quantity": amount or contracts,
                            "usd_value": usd_value,
                            "timestamp": int(liq.get('timestamp') or int(time.time() * 1000)),
                            "time_iso": liq.get('datetime') or time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime())
                        }
                        
                        await self._broadcast(processed_data)
                except NotSupported as e:
                    logger.error(f"{exchange.id} {sym} does not support watch_liquidations: {e}")
                    # Stop the loop if explicit not supported
                    break
                except (ExchangeNotAvailable, NetworkError, InvalidNonce) as e:
                    logger.warning(f"Connection issue for {exchange.id} {sym}: {e}. Retrying in 5s...")
                    await asyncio.sleep(5)
                except Exception as e:
                    logger.error(f"Error watching {exchange.id} {sym}: {e}")
                    await asyncio.sleep(5)
            
            logger.info(f"Stopped CCXT watch_liquidations loop for {exchange.id} {sym}")

        async with self._lock:
            # Update counter
            self._sub_counts[sub_id] = self._sub_counts.get(sub_id, 0) + 1
            
            if sub_id not in self._active_subscriptions:
                try:
                    exchange = await self._get_exchange(exchange_id)
                    
                    # Validate symbol exists on the exchange
                    await exchange.load_markets()
                    if symbol not in exchange.markets:
                        logger.error(f"Symbol {symbol} not found on {exchange_id}")
                        self._sub_counts[sub_id] -= 1 # Rollback counter
                        return

                    task = asyncio.create_task(watch_loop(exchange, symbol))
                    self._active_subscriptions[sub_id] = task
                    logger.info(f"Subscribed to: {sub_id} (New task started)")
                except Exception as e:
                    logger.error(f"Failed to subscribe to {sub_id}: {e}")
                    # Rollback counter if task failed to start
                    if sub_id in self._sub_counts:
                        self._sub_counts[sub_id] -= 1
                        if self._sub_counts[sub_id] <= 0:
                            self._sub_counts.pop(sub_id)

    async def unsubscribe(self, exchange_id: str, symbol: str):
        """
        Unsubscribe from specific symbol liquidation streams.
        """
        if not exchange_id:
            exchange_id = 'binance'

        sub_id = f"{exchange_id}:{symbol}"
        async with self._lock:
            if sub_id in self._sub_counts:
                self._sub_counts[sub_id] -= 1
                logger.info(f"Unsubscribed listener from {sub_id}. Remaining: {self._sub_counts[sub_id]}")
                
                if self._sub_counts[sub_id] <= 0:
                    self._sub_counts.pop(sub_id, None)
                    task = self._active_subscriptions.pop(sub_id, None)
                    if task:
                        task.cancel()
                        logger.info(f"Stopped background task for: {sub_id}")

    async def get_klines(self, symbol: str, interval: str = '15m', limit: int = 50) -> list[Dict[str, Any]]:
        """
        Fetch historical klines (candles) using CCXT REST API.
        Default to Binance for klines if exchange not specifically tied here.
        This maintains backward compatibility.
        """
        try:
            exchange = await self._get_exchange('binance')
            raw_data = await exchange.fetch_ohlcv(symbol, timeframe=interval, limit=limit)
            formatted_data = []
            for d in raw_data:
                formatted_data.append({
                    "time": d[0],
                    "open": float(d[1]),
                    "high": float(d[2]),
                    "low": float(d[3]),
                    "close": float(d[4]),
                    "volume": float(d[5])
                })
            return formatted_data
        except Exception as e:
            logger.error(f"Error fetching klines via CCXT for {symbol}: {e}")
            return []

    async def start(self):
        """
        Start the background service (in CCXT Pro, the watch methods run their own loops,
        so we just keep the service active).
        """
        self._running = True
        logger.info("LiquidationService started via CCXT Pro")
        while self._running:
            await asyncio.sleep(1)

    async def stop(self):
        """
        Stop the service and close connections.
        """
        self._running = False
        async with self._lock:
            for sub_id, task in self._active_subscriptions.items():
                task.cancel()
                logger.info(f"Cancelled task for {sub_id}")
            self._active_subscriptions.clear()
            
            for exchange_id, exchange in self._exchanges.items():
                await exchange.close()
                logger.info(f"Closed exchange connection for {exchange_id}")
            self._exchanges.clear()
        logger.info("LiquidationService stopped.")

# Global Singleton Instance
liquidation_service = LiquidationService()
