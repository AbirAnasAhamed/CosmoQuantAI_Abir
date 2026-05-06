import numpy as np
from datetime import datetime, timezone

class VWAPSDTracker:
    """
    Live incremental calculator for Anchored VWAP and its Standard Deviation Bands.
    Optimized for high-frequency trading bots.
    """
    def __init__(self, anchor='Daily', mult1=1.0, mult2=2.0, mult3=3.0):
        self.anchor = anchor
        self.mult1 = mult1
        self.mult2 = mult2
        self.mult3 = mult3
        
        self.reset()
        
    def reset(self):
        self.cum_vol = 0.0
        self.cum_pv = 0.0
        self.cum_p2v = 0.0
        self.current_anchor_id = None
        
        self.vwap = 0.0
        self.std_dev = 0.0
        self.bands = {
            'upper1': 0.0, 'lower1': 0.0,
            'upper2': 0.0, 'lower2': 0.0,
            'upper3': 0.0, 'lower3': 0.0,
        }
        
    def _get_anchor_id(self, dt: datetime):
        if self.anchor == 'Daily':
            return dt.timetuple().tm_yday
        elif self.anchor == 'Weekly':
            return dt.isocalendar()[1]
        return dt.timetuple().tm_yday
        
    def update(self, price: float, volume: float, timestamp: datetime = None):
        """
        Updates the VWAP and SD bands incrementally.
        Should be called on every tick or every kline close.
        """
        if timestamp is None:
            timestamp = datetime.now(timezone.utc)
            
        anchor_id = self._get_anchor_id(timestamp)
        if self.current_anchor_id is None:
            self.current_anchor_id = anchor_id
            
        # Reset anchor if a new session/day begins
        if anchor_id != self.current_anchor_id:
            self.reset()
            self.current_anchor_id = anchor_id
            
        # Avoid zero volume crashing calculations
        vol = volume if volume > 0 else 1.0
            
        self.cum_vol += vol
        self.cum_pv += price * vol
        self.cum_p2v += (price**2) * vol
        
        if self.cum_vol > 0:
            self.vwap = self.cum_pv / self.cum_vol
            variance = max(0, (self.cum_p2v / self.cum_vol) - (self.vwap**2))
            self.std_dev = np.sqrt(variance)
            
            self.bands = {
                'upper1': self.vwap + (self.std_dev * self.mult1),
                'lower1': self.vwap - (self.std_dev * self.mult1),
                'upper2': self.vwap + (self.std_dev * self.mult2),
                'lower2': self.vwap - (self.std_dev * self.mult2),
                'upper3': self.vwap + (self.std_dev * self.mult3),
                'lower3': self.vwap - (self.std_dev * self.mult3),
            }
            
    def get_z_score(self, price: float) -> float:
        """Returns how many SDs the current price is away from the VWAP."""
        if self.std_dev == 0:
            return 0.0
        return (price - self.vwap) / self.std_dev
