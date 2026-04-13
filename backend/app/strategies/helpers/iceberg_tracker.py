import time
from collections import deque
import logging

logger = logging.getLogger(__name__)

class IcebergTracker:
    """
    Detects Hidden Walls / Iceberg orders by tracking the dissonance between 
    high market trade volumes (Tape) and limit order depth (Orderbook) at a specific price level.
    """
    def __init__(self, window_seconds: int = 5, min_absorbed_vol: float = 100000.0, price_variance_pct: float = 0.05):
        self.window_seconds = window_seconds
        self.min_absorbed_vol = min_absorbed_vol
        # e.g. 0.05 means 0.05% tolerance (0.0005 multiplier)
        self.price_variance_pct = price_variance_pct / 100.0
        
        # Stores (timestamp, price, amount_quote, side)
        self.trades = deque()
        
        # Current orderbook snapshot (top 20 levels usually)
        self.current_orderbook = {'bids': {}, 'asks': {}}

    def update_orderbook(self, bids: list, asks: list):
        """
        bids, asks: list of [price, amount_base]
        Updates the internal state to check limit logic
        """
        # Take the top 20 or so
        self.current_orderbook['bids'] = {float(p): float(v) for p, v in bids[:30]}
        self.current_orderbook['asks'] = {float(p): float(v) for p, v in asks[:30]}
        
    def add_trade(self, price: float, amount_base: float, side: str):
        """
        side: 'buy' matches with short/sell (hits asks)
              'sell' matches with long/buy (hits bids)
        """
        now = time.time()
        amount_quote = price * amount_base
        self.trades.append((now, price, amount_quote, side.lower()))
        self._cleanup(now)
        
    def _cleanup(self, now: float):
        while self.trades and (now - self.trades[0][0]) > self.window_seconds:
            self.trades.popleft()
            
    def check_for_iceberg(self, expected_side: str, current_price: float) -> dict:
        """
        Checks if an iceberg order is defending the expected_side.
        expected_side == 'buy' : We are looking for limit buyers absorbing massive market sells.
        expected_side == 'sell': We are looking for limit sellers absorbing massive market buys.
        """
        now = time.time()
        self._cleanup(now)
        
        if not self.trades or not self.current_orderbook.get('bids'):
            return {}
            
        volume_at_price = {}
        for t_time, t_price, t_amt, t_side in self.trades:
            # expected_side 'buy' wants to intercept market 'sell'
            target_trade_side = 'sell' if expected_side == 'buy' else 'buy'
            
            if t_side == target_trade_side:
                # Group by close proximity to account for slight slippage
                found_key = None
                for p in volume_at_price.keys():
                    if abs(p - t_price) / p <= self.price_variance_pct:
                        found_key = p
                        break
                
                key = found_key if found_key else t_price
                volume_at_price[key] = volume_at_price.get(key, 0) + t_amt
                
        for price_level, total_hit_vol in volume_at_price.items():
            if total_hit_vol >= self.min_absorbed_vol:
                # High volume traded. Check if the limit order is still defending it.
                target_book = self.current_orderbook['bids'] if expected_side == 'buy' else self.current_orderbook['asks']
                
                limit_vol_remaining_quote = 0.0
                for limit_p, limit_v in target_book.items():
                    if abs(limit_p - price_level) / limit_p <= self.price_variance_pct:
                        limit_vol_remaining_quote += (limit_p * limit_v)
                
                # Check if price actually broke through it.
                # If we are looking for a 'buy' iceberg, the current price should not be significantly below the iceberg price.
                is_price_defended = False
                if expected_side == 'buy':
                    is_price_defended = current_price >= (price_level * (1.0 - (self.price_variance_pct * 2)))
                else:
                    is_price_defended = current_price <= (price_level * (1.0 + (self.price_variance_pct * 2)))
                
                if is_price_defended:
                    logger.info(f"💎 ICEBERG DETECTED: Side={expected_side}, Level={price_level}, Vol Hit=${total_hit_vol:,.2f}, Limit Left=${limit_vol_remaining_quote:,.2f}")
                    return {
                        "iceberg_detected": True,
                        "side": expected_side,
                        "price": price_level,
                        "absorbed_vol": total_hit_vol,
                        "limit_vol_remaining": limit_vol_remaining_quote
                    }
        return {}

    def update_params(self, window_seconds: int = None, min_absorbed_vol: float = None):
        if window_seconds is not None:
            self.window_seconds = window_seconds
            logger.info(f"IcebergTracker: window_seconds updated to {self.window_seconds}")
        if min_absorbed_vol is not None:
            self.min_absorbed_vol = min_absorbed_vol
            logger.info(f"IcebergTracker: min_absorbed_vol updated to {self.min_absorbed_vol}")
