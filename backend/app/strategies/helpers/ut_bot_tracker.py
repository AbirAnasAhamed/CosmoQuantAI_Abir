import asyncio
import logging
from typing import List, Dict, Tuple
from app.services.market_depth_service import market_depth_service

logger = logging.getLogger(__name__)

class UTBotTracker:
    """
    A standalone module that replicates the Pine Script "UT Bot Alerts" indicator logic.
    Maintains a background loop to fetch K-lines and computes the latest trend, crossover signals, 
    and dynamic trailing stop loss line. Completely isolated from the main bot engine.
    """
    def __init__(self, exchange_id: str, symbol: str, sensitivity: float = 1.0, 
                 atr_period: int = 10, use_heikin_ashi: bool = False, timeframe: str = '5m'):
        self.exchange_id = exchange_id
        self.symbol = symbol
        self.sensitivity = sensitivity
        self.atr_period = atr_period
        self.use_heikin_ashi = use_heikin_ashi
        self.timeframe = timeframe
        self.running = False
        
        # State
        self.latest_trend_dir = 0 # 1 for Buy/Long, -1 for Sell/Short, 0 for neutral
        self.latest_trailing_stop = 0.0
        self.latest_buy_signal = False
        self.latest_sell_signal = False
        self.closed_buy_signal = False
        self.closed_sell_signal = False
        self.last_candle_time = None
        
        # Loop Check Interval Based on Timeframe (seconds)
        self.check_interval = self._get_check_interval(timeframe)

    def _get_check_interval(self, timeframe: str) -> int:
        if timeframe == '1m': return 5
        elif timeframe == '3m': return 10
        elif timeframe == '5m': return 15
        elif timeframe == '15m': return 30
        elif timeframe == '30m': return 60
        elif timeframe in ['1h', '2h', '4h']: return 120
        else: return 300 # 1d

    def update_params(self, sensitivity: float = None, atr_period: int = None, 
                      use_heikin_ashi: bool = None, timeframe: str = None):
        if sensitivity is not None:
            self.sensitivity = sensitivity
        if atr_period is not None:
            self.atr_period = atr_period
        if use_heikin_ashi is not None:
            self.use_heikin_ashi = use_heikin_ashi
        if timeframe is not None and timeframe != self.timeframe:
            self.timeframe = timeframe
            self.check_interval = self._get_check_interval(timeframe)
            # Will force a quick refresh on next loop iter
            logger.info(f"🔄 UT Bot Tracker Timeframe changed to {timeframe}")

    async def start(self):
        self.running = True
        logger.info(f"🟢 UT Bot Tracker starting for {self.symbol} on {self.timeframe} (Sens: {self.sensitivity}, ATR: {self.atr_period})")
        while self.running:
            try:
                # We need around 150-200 candles to get a stable RMA for ATR. 200 is extremely fast to compute.
                klines = await market_depth_service.fetch_ohlcv(self.symbol, self.exchange_id, self.timeframe, limit=250)
                if klines and len(klines) > self.atr_period:
                    self._calculate_ut_bot(klines)
            except Exception as e:
                logger.error(f"UT Bot Tracker Error: {e}")
            
            # Simple sleep, since market_depth_service caches efficiently, we don't spam the exchange directly
            await asyncio.sleep(self.check_interval)

    async def stop(self):
        self.running = False

    def _calculate_ut_bot(self, data: List[Dict]):
        """
        Executes the exact Pine Script math.
        Input data format expected: list of dicts with 'time', 'open', 'high', 'low', 'close'.
        All prices should be floats.
        """
        c = int(self.atr_period)
        a = float(self.sensitivity)
        h = self.use_heikin_ashi
        
        n = len(data)
        if n <= c:
            return

        # True Range and initial TR sum
        trs = [0.0] * n
        for i in range(1, n):
            h_val = float(data[i]['high'])
            l_val = float(data[i]['low'])
            pc = float(data[i - 1]['close'])
            trs[i] = max(h_val - l_val, abs(h_val - pc), abs(l_val - pc))

        atrs = [0.0] * n
        tr_sum = sum(trs[1:c+1])
        atrs[c] = tr_sum / c

        # RMA (TradingView ATR default smoothing)
        alpha = 1.0 / c
        for i in range(c + 1, n):
            atrs[i] = alpha * trs[i] + (1 - alpha) * atrs[i - 1]

        # Heikin Ashi
        ha_closes = [0.0] * n
        prev_ha_open = float(data[0]['open'])
        prev_ha_close = (float(data[0]['open']) + float(data[0]['high']) + float(data[0]['low']) + float(data[0]['close'])) / 4.0
        ha_closes[0] = prev_ha_close

        for i in range(1, n):
            c_open = float(data[i]['open'])
            c_high = float(data[i]['high'])
            c_low = float(data[i]['low'])
            c_close = float(data[i]['close'])
            
            ha_close = (c_open + c_high + c_low + c_close) / 4.0
            ha_open = (prev_ha_open + prev_ha_close) / 2.0
            ha_closes[i] = ha_close
            
            prev_ha_open = ha_open
            prev_ha_close = ha_close

        x_atr_trailing_stop = 0.0
        pos = 0
        
        # Track signals
        buy = False
        sell = False

        for i in range(1, n):
            src = ha_closes[i] if h else float(data[i]['close'])
            src1 = ha_closes[i - 1] if h else float(data[i - 1]['close'])
            n_loss = a * atrs[i]
            
            new_x_atr_trailing_stop = x_atr_trailing_stop
            
            if src > x_atr_trailing_stop and src1 > x_atr_trailing_stop:
                new_x_atr_trailing_stop = max(x_atr_trailing_stop, src - n_loss)
            elif src < x_atr_trailing_stop and src1 < x_atr_trailing_stop:
                new_x_atr_trailing_stop = min(x_atr_trailing_stop, src + n_loss)
            elif src > x_atr_trailing_stop:
                new_x_atr_trailing_stop = src - n_loss
            else:
                new_x_atr_trailing_stop = src + n_loss

            new_pos = pos
            if src1 < x_atr_trailing_stop and src > x_atr_trailing_stop:
                new_pos = 1
            elif src1 > x_atr_trailing_stop and src < x_atr_trailing_stop:
                new_pos = -1
                
            # Crossovers (Signal generation)
            above = (src > new_x_atr_trailing_stop) and (src1 <= x_atr_trailing_stop)
            below = (src < new_x_atr_trailing_stop) and (src1 >= x_atr_trailing_stop)
            
            buy = (src > new_x_atr_trailing_stop) and above
            sell = (src < new_x_atr_trailing_stop) and below
            
            if i == n - 2:
                self.closed_buy_signal = buy
                self.closed_sell_signal = sell
            
            x_atr_trailing_stop = new_x_atr_trailing_stop
            pos = new_pos

        # After the loop finishes, the last evaluated values are the CURRENT LIVE state of the UT Bot.
        # It's updated on every loop tick so even unclosed candles will correctly reflect crossover potentials.
        self.latest_trend_dir = pos
        self.latest_trailing_stop = float(x_atr_trailing_stop)
        self.latest_buy_signal = buy
        self.latest_sell_signal = sell
        self.last_candle_time = data[-1].get('time')

    def is_trend_aligned(self, side: str) -> bool:
        """
        Returns True if the UT Bot trend matches the intended trade direction (Side: 'buy' or 'sell').
        """
        if side.lower() == 'buy' and self.latest_trend_dir == 1:
            return True
        if side.lower() == 'sell' and self.latest_trend_dir == -1:
            return True
        return False

    def is_entry_signal(self, side: str, closed_candle_only: bool = False) -> bool:
        """
        Returns True if the UT Bot EXACTLY triggered a 'BUY' or 'SELL' crossover signal.
        If closed_candle_only is True, it checks the last fully closed candle instead of the live unclosed one.
        """
        check_buy = self.closed_buy_signal if closed_candle_only else self.latest_buy_signal
        check_sell = self.closed_sell_signal if closed_candle_only else self.latest_sell_signal
        
        if side.lower() == 'buy' and check_buy:
            return True
        if side.lower() == 'sell' and check_sell:
            return True
        return False

    def get_dynamic_trailing_sl(self, side: str) -> float:
        """
        Returns the exact price level of the UT Bot Trailing Stop Line.
        The bot engine will check if current price crosses this line to execute the SL.
        """
        return self.latest_trailing_stop
