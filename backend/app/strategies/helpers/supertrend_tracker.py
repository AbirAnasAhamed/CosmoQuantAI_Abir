import asyncio
import logging
from typing import List, Dict
from app.services.market_depth_service import market_depth_service

logger = logging.getLogger(__name__)

class SupertrendTracker:
    """
    A standalone module that replicates the Pine Script "Supertrend" indicator logic.
    Maintains a background loop to fetch K-lines and computes the latest trend, signals, 
    and dynamic trailing line. Isolated from the main bot engine.
    """
    def __init__(self, exchange_id: str, symbol: str, atr_period: int = 10, multiplier: float = 3.0, timeframe: str = '5m'):
        self.exchange_id = exchange_id
        self.symbol = symbol
        self.atr_period = atr_period
        self.multiplier = multiplier
        self.timeframe = timeframe
        self.running = False
        
        # State
        self.latest_trend_dir = 0 # 1 for Buy/Long, -1 for Sell/Short
        self.latest_trailing_stop = 0.0
        self.latest_buy_signal = False
        self.latest_sell_signal = False
        self.closed_buy_signal = False
        self.closed_sell_signal = False
        self.last_candle_time = None
        
        self.check_interval = self._get_check_interval(timeframe)

    def _get_check_interval(self, timeframe: str) -> int:
        if timeframe == '1m': return 5
        elif timeframe == '3m': return 10
        elif timeframe == '5m': return 15
        elif timeframe == '15m': return 30
        elif timeframe == '30m': return 60
        elif timeframe in ['1h', '2h', '4h']: return 120
        else: return 300 # 1d

    def update_params(self, atr_period: int = None, multiplier: float = None, timeframe: str = None):
        if atr_period is not None:
            self.atr_period = atr_period
        if multiplier is not None:
            self.multiplier = multiplier
        if timeframe is not None and timeframe != self.timeframe:
            self.timeframe = timeframe
            self.check_interval = self._get_check_interval(timeframe)
            logger.info(f"🔄 Supertrend Tracker Timeframe changed to {timeframe}")

    async def start(self):
        self.running = True
        logger.info(f"🟢 Supertrend Tracker starting for {self.symbol} on {self.timeframe} (ATR: {self.atr_period}, Mult: {self.multiplier})")
        while self.running:
            try:
                # Increased limit to 500 for better ATR/Trend convergence to match frontend exactly
                klines = await market_depth_service.fetch_ohlcv(self.symbol, self.exchange_id, self.timeframe, limit=500)
                if klines and len(klines) > self.atr_period:
                    self._calculate_supertrend(klines)
            except Exception as e:
                logger.error(f"Supertrend Tracker Error: {e}")
            
            await asyncio.sleep(self.check_interval)

    async def stop(self):
        self.running = False

    def _calculate_supertrend(self, data: List[Dict]):
        n = len(data)
        if n <= self.atr_period:
            return

        period = int(self.atr_period)
        multiplier = float(self.multiplier)

        trs = [0.0] * n
        for i in range(1, n):
            h = float(data[i]['high'])
            l = float(data[i]['low'])
            pc = float(data[i - 1]['close'])
            trs[i] = max(h - l, abs(h - pc), abs(l - pc))

        atrs = [0.0] * n
        # Pine seeds RMA with SMA of first `period` TR values (indices 0 to period-1)
        tr_sum = sum(trs[0:period])
        atrs[period - 1] = tr_sum / period

        alpha = 1.0 / period
        for i in range(period, n):
            atrs[i] = alpha * trs[i] + (1 - alpha) * atrs[i - 1]

        # Initial direction (Match Pine Script / Frontend default)
        trend_dir = 1
        upper_bands = [0.0] * n
        lower_bands = [0.0] * n
        supertrends = [0.0] * n

        prev_up = 0.0
        prev_dn = 0.0
        prev_trend_dir = 1

        buy = False
        sell = False

        for i in range(n):
            if i < period:
                supertrends[i] = 0.0
                upper_bands[i] = 0.0
                lower_bands[i] = 0.0
                continue

            high = float(data[i]['high'])
            low = float(data[i]['low'])
            close = float(data[i]['close'])
            prev_close = float(data[i-1]['close'])
            atr = atrs[i]
            
            hl2 = (high + low) / 2.0
            # Frontend Pine convention: 'up' = lower support, 'dn' = upper resistance
            basic_up = hl2 - (multiplier * atr)
            basic_dn = hl2 + (multiplier * atr)

            # Standard Supertrend recursive band logic — match frontend exactly:
            # up := close[1] > up1 ? max(up, up1) : up  (support rises)
            # dn := close[1] < dn1 ? min(dn, dn1) : dn  (resistance falls)
            if i > period:
                up = max(basic_up, prev_up) if prev_close > prev_up else basic_up
                dn = min(basic_dn, prev_dn) if prev_close < prev_dn else basic_dn
            else:
                up = basic_up
                dn = basic_dn

            # Trend flip logic matching Pine Script exactly
            current_trend = prev_trend_dir
            if prev_trend_dir == -1 and close > prev_dn:
                current_trend = 1
            elif prev_trend_dir == 1 and close < prev_up:
                current_trend = -1
                
            supertrends[i] = up if current_trend == 1 else dn
            upper_bands[i] = up
            lower_bands[i] = dn

            buy_signal = (current_trend == 1 and prev_trend_dir == -1)
            sell_signal = (current_trend == -1 and prev_trend_dir == 1)
            
            # Record last candle state
            if i == n - 1:
                buy = buy_signal
                sell = sell_signal
                trend_dir = current_trend
                
            # Record last fully closed candle signal
            if i == n - 2:
                self.closed_buy_signal = buy_signal
                self.closed_sell_signal = sell_signal

            prev_up = up
            prev_dn = dn
            prev_trend_dir = current_trend

        self.latest_trend_dir = trend_dir
        self.latest_trailing_stop = float(supertrends[-1])
        self.latest_buy_signal = buy
        self.latest_sell_signal = sell
        self.last_candle_time = data[-1].get('time')

    def is_trend_aligned(self, side: str) -> bool:
        if side.lower() == 'buy' and self.latest_trend_dir == 1:
            return True
        if side.lower() == 'sell' and self.latest_trend_dir == -1:
            return True
        return False

    def is_entry_signal(self, side: str, closed_candle_only: bool = False) -> bool:
        check_buy = self.closed_buy_signal if closed_candle_only else self.latest_buy_signal
        check_sell = self.closed_sell_signal if closed_candle_only else self.latest_sell_signal
        
        if side.lower() == 'buy' and check_buy:
            return True
        if side.lower() == 'sell' and check_sell:
            return True
        return False

    def get_dynamic_trailing_sl(self, side: str) -> float:
        return self.latest_trailing_stop
