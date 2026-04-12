import time
from collections import deque
import logging

logger = logging.getLogger(__name__)

class AbsorptionTracker:
    """
    Modular helper to track trade delta and detect absorption near walls.
    This avoids overlapping with other bot logic and can be used by both 
    Spot and Futures bots.
    """
    def __init__(self, window_seconds: float = 10.0, threshold: float = 50000.0):
        self.window_seconds = window_seconds
        self.threshold = threshold
        # Stores (timestamp, price, amount_quote, side)
        self.trades = deque()
        self.current_delta = 0.0

    def add_trade(self, price: float, amount_base: float, side: str):
        """
        Add a market trade and update the delta.
        side: 'buy' for market buy (hits ask), 'sell' for market sell (hits bid)
        """
        now = time.time()
        amount_quote = price * amount_base
        
        # side 'buy' increases delta (aggressive buyers)
        # side 'sell' decreases delta (aggressive sellers)
        delta_contribution = amount_quote if side.lower() == 'buy' else -amount_quote
        
        self.trades.append((now, price, amount_quote, side.lower()))
        self.current_delta += delta_contribution
        
        # Cleanup old trades outside the window
        self._cleanup(now)

    def _cleanup(self, now: float):
        while self.trades and (now - self.trades[0][0]) > self.window_seconds:
            old_trade = self.trades.popleft()
            old_delta_contribution = old_trade[2] if old_trade[3] == 'buy' else -old_trade[2]
            self.current_delta -= old_delta_contribution

    def get_current_delta(self) -> float:
        now = time.time()
        self._cleanup(now)
        return self.current_delta

    def is_absorption_detected(self, wall_side: str) -> bool:
        """
        Detects if current delta indicates 'Absorption' against a wall of type wall_side.
        - wall_side 'sell' (Ask Wall): We need positive delta (market buys/aggressive buyers)
        - wall_side 'buy' (Bid Wall): We need negative delta (market sells/aggressive sellers)
        """
        delta = self.get_current_delta()
        
        # For an ASK wall (wall_side='sell'), we need positive delta (market buys hitting the ask)
        if wall_side == 'sell' and delta >= self.threshold:
            return True
            
        # For a BID wall (wall_side='buy'), we need negative delta (market sells hitting the bid)
        if wall_side == 'buy' and delta <= -self.threshold:
            return True
            
        return False

    def reset(self):
        self.trades.clear()
        self.current_delta = 0.0

    def update_params(self, window_seconds: float = None, threshold: float = None):
        if window_seconds is not None:
            self.window_seconds = window_seconds
            logger.info(f"AbsorptionTracker: Updated window to {window_seconds}s")
        if threshold is not None:
            self.threshold = threshold
            logger.info(f"AbsorptionTracker: Updated threshold to ${threshold}")
