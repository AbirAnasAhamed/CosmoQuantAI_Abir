import asyncio
import logging
import math
from typing import Dict, Any, List

import ccxt.pro as ccxtpro

logger = logging.getLogger(__name__)

class AdvancedOrderbookService:
    """
    Modular Background Service for High-Performance Level-2 Orderbook Processing.
    Handles Liquidity Zones, Leverage Estimation, and AI Trajectory Prediction.
    """
    def __init__(self, symbol: str):
        self.symbol = symbol
        self._running = False
        self._active_tasks = []
        self.exchanges: Dict[str, ccxtpro.Exchange] = {}
        
        # Configuration
        self.num_zones = 3
        self.min_vol = 0.0
        
        # State for stabilization
        self._ema_red_force = 0.0
        self._ema_green_force = 0.0
        self._current_direction = None
        
        # Real-time state that other services (like GodMode) can consume
        self.state = {
            "symbol": symbol,
            "magnet_zones": [],
            "ai_trajectory": None,
            "bid_weight": 0,
            "ask_weight": 0,
            "imbalance": 0.0
        }
        
    async def _init_exchange(self, ex_id: str) -> ccxtpro.Exchange:
        if ex_id not in self.exchanges:
            options = {'defaultType': 'swap'} if ex_id == 'binance' else {'defaultType': 'linear'}
            ex_class = getattr(ccxtpro, ex_id)
            self.exchanges[ex_id] = ex_class({
                'enableRateLimit': True,
                'newUpdates': True,
                'options': options
            })
        return self.exchanges[ex_id]
        
    def update_config(self, num_zones: int, min_vol: float):
        self.num_zones = num_zones
        self.min_vol = min_vol
        logger.info(f"[{self.symbol}] Orderbook config updated: num_zones={num_zones}, min_vol={min_vol}")

    def _estimate_leverage(self, current_price: float, zone_price: float) -> str:
        """Estimates the liquidation leverage based on mathematical distance from current price."""
        distance_pct = abs(current_price - zone_price) / current_price * 100
        if distance_pct <= 1.0:
            return "100x"
        elif distance_pct <= 2.0:
            return "50x"
        elif distance_pct <= 5.0:
            return "20x"
        else:
            return "10x"

    def _calculate_liquidity_zones(self, orderbook: dict, current_price: float) -> List[dict]:
        """Calculates heavy liquidity accumulation zones from raw bids and asks."""
        zones = []
        
        bids = orderbook.get('bids', [])
        asks = orderbook.get('asks', [])
        
        # Helper to group raw orders into 0.2% price bins
        def _bin_orders(orders, is_ask=False):
            bins = {}
            for price, amount in orders:
                if current_price == 0: continue
                
                # Filter out immediate noise: Ignore orders within 0.5% of current price.
                # Liquidation pools are usually further away, while immediate orders are just normal market depth.
                if abs(price - current_price) / current_price < 0.005:
                    continue
                    
                # Calculate nearest 0.2% bin
                bin_step = current_price * 0.002
                bin_price = round(price / bin_step) * bin_step
                bins[bin_price] = bins.get(bin_price, 0) + amount
            return bins
            
        bid_bins = _bin_orders(bids, is_ask=False)
        ask_bins = _bin_orders(asks, is_ask=True)
        
        # Filter bins by minimum volume threshold
        filtered_bid_bins = {p: v for p, v in bid_bins.items() if v >= self.min_vol}
        filtered_ask_bins = {p: v for p, v in ask_bins.items() if v >= self.min_vol}
        
        # Find top N highest volume bid bins (Long Liquidity)
        top_bids = sorted(filtered_bid_bins.items(), key=lambda x: x[1], reverse=True)[:self.num_zones]
        # Find top N highest volume ask bins (Short Liquidity)
        top_asks = sorted(filtered_ask_bins.items(), key=lambda x: x[1], reverse=True)[:self.num_zones]
        
        # Calculate max volume to normalize intensity (0-100)
        max_vol = max([v for _, v in top_bids + top_asks] + [1])
        
        for price, vol in top_asks:
            zones.append({
                "price": round(price, 2) if price > 10 else round(price, 5),
                "intensity": min(100, round((vol / max_vol) * 100)),
                "leverage": self._estimate_leverage(current_price, price),
                "type": "SHORT"
            })
            
        for price, vol in top_bids:
            zones.append({
                "price": round(price, 2) if price > 10 else round(price, 5),
                "intensity": min(100, round((vol / max_vol) * 100)),
                "leverage": self._estimate_leverage(current_price, price),
                "type": "LONG"
            })
            
        return zones

    def _calculate_ai_trajectory(self, orderbook: dict, zones: List[dict], current_price: float):
        """
        AI Smart Money Hunt Predictor: Evaluates visible zones to predict liquidity hunting direction.
        It calculates a Distance-Weighted Force for Red (Short) and Green (Long) zones.
        """
        if current_price <= 0 or not zones:
            self.state["ai_trajectory"] = None
            return

        red_force = 0.0
        green_force = 0.0
        
        # Get funding rate if available
        funding_rate = self.state.get("funding_rate", 0.0)
        # Multiplier: e.g. FR of 0.0010 (0.1%) -> 1.1 (10% boost to the opposite side)
        fr_multiplier = 1.0 + (abs(funding_rate) * 100)

        for z in zones:
            # Distance in percentage. Using max 0.01 to prevent division by zero if price exactly matches
            distance_pct = max(0.01, abs(current_price - z['price']) / current_price * 100)
            strength = z['intensity'] / distance_pct
            
            if z['type'] == 'SHORT':
                # If Funding Rate is Negative (Market is heavily Short), Smart Money hunts UP (Red zones)
                if funding_rate < 0:
                    strength *= fr_multiplier
                red_force += strength
            elif z['type'] == 'LONG':
                # If Funding Rate is Positive (Market is heavily Long), Smart Money hunts DOWN (Green zones)
                if funding_rate > 0:
                    strength *= fr_multiplier
                green_force += strength

        self.state["bid_weight"] = round(green_force, 2)
        self.state["ask_weight"] = round(red_force, 2)

        # 1. EMA Smoothing (Alpha = 0.1 for ~10 tick moving average)
        alpha = 0.1
        if self._ema_red_force == 0.0 and self._ema_green_force == 0.0:
            self._ema_red_force = red_force
            self._ema_green_force = green_force
        else:
            self._ema_red_force = (alpha * red_force) + ((1 - alpha) * self._ema_red_force)
            self._ema_green_force = (alpha * green_force) + ((1 - alpha) * self._ema_green_force)

        smoothed_red = self._ema_red_force
        smoothed_green = self._ema_green_force

        trajectory = None
        if smoothed_red > 0 or smoothed_green > 0:
            total_force = smoothed_red + smoothed_green
            red_ratio = smoothed_red / total_force
            green_ratio = smoothed_green / total_force

            # 2. Hysteresis Logic
            HYSTERESIS_THRESHOLD = 0.52
            BASE_THRESHOLD = 0.501
            target_direction = self._current_direction

            if self._current_direction == "UP":
                # Only flip to DOWN if green strongly overtakes red
                if green_ratio > HYSTERESIS_THRESHOLD:
                    target_direction = "DOWN"
            elif self._current_direction == "DOWN":
                # Only flip to UP if red strongly overtakes green
                if red_ratio > HYSTERESIS_THRESHOLD:
                    target_direction = "UP"
            else:
                # No current direction, use base threshold
                if red_ratio > BASE_THRESHOLD:
                    target_direction = "UP"
                elif green_ratio > BASE_THRESHOLD:
                    target_direction = "DOWN"

            # 3. Generate Trajectory based on stable direction
            if target_direction == "UP":
                imbalance = min(99, max(0, (red_ratio - 0.5) * 500)) + 10
                short_zones = [z for z in zones if z['type'] == 'SHORT']
                if short_zones:
                    target_zone = max(short_zones, key=lambda x: x['intensity'])
                    trajectory = {
                        "direction": "UP",
                        "target_price": target_zone['price'],
                        "confidence": min(99, round(imbalance))
                    }
            elif target_direction == "DOWN":
                imbalance = min(99, max(0, (green_ratio - 0.5) * 500)) + 10
                long_zones = [z for z in zones if z['type'] == 'LONG']
                if long_zones:
                    target_zone = max(long_zones, key=lambda x: x['intensity'])
                    trajectory = {
                        "direction": "DOWN",
                        "target_price": target_zone['price'],
                        "confidence": min(99, round(imbalance))
                    }

        self._current_direction = trajectory["direction"] if trajectory else None
        self.state["imbalance"] = round(abs(smoothed_red - smoothed_green), 2)
        self.state["ai_trajectory"] = trajectory

    async def _watch_orderbook_loop(self):
        """Continuously fetches Level-2 Orderbook and runs heavy calculations in background."""
        exchange = await self._init_exchange('binance')
        logger.info(f"AdvancedOrderbookService: Started live orderbook stream for {self.symbol}")
        
        # Add limit to watch_order_book call directly if exchange allows, else we slice later
        limit = 100 
        
        while self._running:
            try:
                # CCXT watch_order_book handles websocket management internally
                orderbook = await exchange.watch_order_book(self.symbol, limit)
                
                # We need current price to base our calculations on
                # Approximation: Mid price between top bid and ask
                if orderbook['bids'] and orderbook['asks']:
                    top_bid = orderbook['bids'][0][0]
                    top_ask = orderbook['asks'][0][0]
                    current_price = (top_bid + top_ask) / 2
                    
                    # Run intensive background calculations
                    zones = self._calculate_liquidity_zones(orderbook, current_price)
                    self.state["magnet_zones"] = zones
                    self._calculate_ai_trajectory(orderbook, zones, current_price)
                    
            except ccxtpro.NetworkError as e:
                logger.warning(f"Orderbook network err: {e}")
                await asyncio.sleep(2)
            except Exception as e:
                logger.error(f"Orderbook calc err: {e}")
                await asyncio.sleep(2)

    async def _fetch_funding_rate_loop(self):
        """Periodically fetches the funding rate to determine retail sentiment."""
        exchange = await self._init_exchange('binance')
        while self._running:
            try:
                # CCXT async REST API for funding rate
                funding = await exchange.fetch_funding_rate(self.symbol)
                if funding and 'fundingRate' in funding:
                    self.state["funding_rate"] = float(funding['fundingRate'])
            except Exception as e:
                logger.error(f"Funding rate fetch err: {e}")
            
            # Fetch every 60 seconds
            await asyncio.sleep(60)

    async def start(self):
        if self._running:
            return
        self._running = True
        logger.info(f"Advanced Orderbook Pipeline starting for {self.symbol}")
        self._active_tasks.append(asyncio.create_task(self._watch_orderbook_loop()))
        self._active_tasks.append(asyncio.create_task(self._fetch_funding_rate_loop()))

    async def stop(self):
        self._running = False
        for task in self._active_tasks:
            task.cancel()
        for name, ex in self.exchanges.items():
            await ex.close()
        self._active_tasks.clear()
        self.exchanges.clear()
        logger.info("Advanced Orderbook Pipeline stopped.")

_ob_instances = {}
def get_orderbook_service(symbol: str) -> AdvancedOrderbookService:
    if symbol not in _ob_instances:
        _ob_instances[symbol] = AdvancedOrderbookService(symbol)
    return _ob_instances[symbol]
