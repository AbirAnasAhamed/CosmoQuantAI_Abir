import asyncio
import time
import logging
import math
from typing import Optional

logger = logging.getLogger(__name__)

def pearson_correlation(x: list, y: list) -> float:
    """Calculates Pearson Correlation Coefficient between two arrays using pure Python."""
    if len(x) != len(y) or len(x) < 2:
        return 0.0
    
    n = len(x)
    sum_x = sum(x)
    sum_y = sum(y)
    sum_x_sq = sum(v ** 2 for v in x)
    sum_y_sq = sum(v ** 2 for v in y)
    sum_xy = sum(xi * yi for xi, yi in zip(x, y))
    
    numerator = n * sum_xy - sum_x * sum_y
    denom_x = n * sum_x_sq - sum_x ** 2
    denom_y = n * sum_y_sq - sum_y ** 2
    
    if denom_x <= 0 or denom_y <= 0:
        return 0.0
        
    denominator = math.sqrt(denom_x * denom_y)
    if denominator == 0:
        return 0.0
        
    return numerator / denominator


class BtcCorrelationTracker:
    def __init__(self, exchange, target_symbol: str, 
                 btc_symbol: str = "BTC/USDT", 
                 threshold: float = 0.7, 
                 window_minutes: int = 15,
                 min_move_pct: float = 0.1):
        self.exchange = exchange
        self.target_symbol = target_symbol
        self.btc_symbol = btc_symbol
        self.threshold = threshold
        self.window_minutes = window_minutes
        self.min_move_pct = min_move_pct
        
        # CCXT uses format like BTC/USDT:USDT for Futures in some cases, ensure we sync base
        if ":" in target_symbol and ":" not in self.btc_symbol:
            parts = target_symbol.split(':')
            quote_asset = parts[1]
            # Assumes quote format like USDT
            self.btc_symbol = f"BTC/{quote_asset}:{quote_asset}"
        
        self.is_running = False
        self._task: Optional[asyncio.Task] = None
        
        self.current_correlation = 0.0
        self.btc_move_pct = 0.0
        self.is_aligned_long = False
        self.is_aligned_short = False
        
        self.last_update = 0

    def update_params(self, threshold=None, window_minutes=None, min_move_pct=None):
        if threshold is not None: self.threshold = threshold
        if window_minutes is not None: self.window_minutes = window_minutes
        if min_move_pct is not None: self.min_move_pct = min_move_pct

    async def start(self):
        if not self.is_running:
            self.is_running = True
            self._task = asyncio.create_task(self._tracker_loop())

    async def stop(self):
        self.is_running = False
        if self._task:
            self._task.cancel()

    async def _tracker_loop(self):
        # Initial sleep to let exchange load
        await asyncio.sleep(5)
        
        while self.is_running:
            try:
                # Exchange must support fetchOHLCV
                if not hasattr(self.exchange, 'has') or not self.exchange.has.get('fetchOHLCV'):
                    logger.warning("[BTC Correlation] Exchange does not support fetchOHLCV.")
                    await asyncio.sleep(60)
                    continue

                # Fetch 1m candles for target and BTC
                limit = self.window_minutes + 1 
                
                # Run concurrently
                target_task = asyncio.create_task(self.exchange.fetch_ohlcv(self.target_symbol, '1m', limit=limit))
                btc_task = asyncio.create_task(self.exchange.fetch_ohlcv(self.btc_symbol, '1m', limit=limit))
                
                results = await asyncio.gather(target_task, btc_task, return_exceptions=True)
                
                if isinstance(results[0], Exception) or isinstance(results[1], Exception):
                    raise Exception(f"Failed to fetch OHLCV: {results}")

                target_ohlcv = results[0]
                btc_ohlcv = results[1]
                
                if not target_ohlcv or not btc_ohlcv or len(target_ohlcv) < 5 or len(btc_ohlcv) < 5:
                    await asyncio.sleep(30)
                    continue

                # Ensure timestamps align roughly, extracting close prices
                take_len = min(len(target_ohlcv), len(btc_ohlcv), self.window_minutes)
                
                target_closes = [c[4] for c in target_ohlcv[-take_len:]]
                btc_closes = [c[4] for c in btc_ohlcv[-take_len:]]
                
                self.current_correlation = pearson_correlation(target_closes, btc_closes)
                
                # Cumulative BTC move
                btc_start = btc_closes[0]
                btc_end = btc_closes[-1]
                self.btc_move_pct = ((btc_end - btc_start) / btc_start) * 100.0
                
                # Determine Alignment
                # Positive Correlation -> Buy Target if BTC goes Up. Short Target if BTC goes Down.
                # If negative correlation (rare but possible), maybe we invert it, but for simplicity we rely on Positive Alignment for now
                
                if self.current_correlation >= self.threshold:
                    self.is_aligned_long = self.btc_move_pct >= self.min_move_pct
                    self.is_aligned_short = self.btc_move_pct <= -self.min_move_pct
                else:
                    self.is_aligned_long = False
                    self.is_aligned_short = False
                
                self.last_update = time.time()
                
                # Fetch interval: every 30 seconds to catch mid-candle momentum
                await asyncio.sleep(30)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[BTC Correlation] Error fetching data: {e}")
                await asyncio.sleep(15)

    def is_aligned(self, side: str) -> bool:
        """
        Check if the trade direction is aligned with BTC momentum.
        Throws False if data is stale.
        """
        # If data hasn't updated in 5 minutes, consider it stale and reject block
        if time.time() - self.last_update > 300:
            logger.warning(f"[BTC Correlation] Data stale or initializing. Rejecting {side.upper()}.")
            return False
            
        if side.lower() == 'buy':
            return self.is_aligned_long
        elif side.lower() == 'sell':
            return self.is_aligned_short
            
        return False

    def get_metrics_string(self) -> str:
        """Returns a string representing the current state for logging."""
        return f"Corr: {self.current_correlation:.2f} | BTC Move: {self.btc_move_pct:.2f}% | L:{self.is_aligned_long} S:{self.is_aligned_short}"
