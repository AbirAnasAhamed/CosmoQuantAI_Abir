import backtrader as bt
import backtrader.indicators as btind
import os
import importlib
import inspect
import pkgutil
from .base_strategy import BaseStrategy

# -----------------------------------------------------------
# 1. GENERIC STRATEGY TEMPLATES (The Factory Engines)
# -----------------------------------------------------------

class GenericOscillatorStrategy(BaseStrategy):
    """
    Template for Oscillator Strategies (RSI, Stochastic, CCI, etc.)
    Logic: Buy < Lower Band (Oversold), Sell > Upper Band (Overbought)
    """
    params = (('period', 14), ('lower', 30), ('upper', 70), ('ind_name', 'RSI'))

    def __init__(self):
        super().__init__()
        # Dynamic Indicator Loading
        ind_cls = getattr(bt.indicators, self.params.ind_name, None)
        if not ind_cls:
            raise ValueError(f"Indicator {self.params.ind_name} not found")
        
        try:
            # Try passing full data (for Stoch, CCI)
            self.ind = ind_cls(self.data, period=self.params.period)
        except:
            # Fallback to close price (for RSI, Momentum)
            self.ind = ind_cls(self.data.close, period=self.params.period)

    def next(self):
        if not self.position:
            if self.ind < self.params.lower:
                self.buy()
        elif self.ind > self.params.upper:
            self.close()

class GenericCrossoverStrategy(BaseStrategy):
    """
    Template for Moving Average Crossovers (SMA, EMA, etc.)
    Logic: Fast MA crosses above Slow MA -> Buy
    """
    params = (('fast_period', 10), ('slow_period', 30), ('ind_name', 'SMA'))

    def __init__(self):
        super().__init__()
        ind_cls = getattr(bt.indicators, self.params.ind_name, None)
        
        self.fast_ma = ind_cls(self.data.close, period=self.params.fast_period)
        self.slow_ma = ind_cls(self.data.close, period=self.params.slow_period)
        self.crossover = bt.indicators.CrossOver(self.fast_ma, self.slow_ma)

    def next(self):
        if not self.position:
            if self.crossover > 0: self.buy()
        elif self.crossover < 0:
            self.close()

class GenericSignalStrategy(BaseStrategy):
    """
    Template for Zero-Line Cross Strategies (Momentum, ROC, Trix)
    Logic: Value crosses above 0 -> Buy
    """
    params = (('period', 12), ('ind_name', 'Momentum'))

    def __init__(self):
        super().__init__()
        ind_cls = getattr(bt.indicators, self.params.ind_name, None)
        self.ind = ind_cls(self.data.close, period=self.params.period)
        self.crossover = bt.indicators.CrossOver(self.ind, 0.0)

    def next(self):
        if not self.position:
            if self.crossover > 0: self.buy()
        elif self.crossover < 0:
            self.close()

# -----------------------------------------------------------
# 2. EXTENDED STRATEGY CATALOG (30+ Strategies)
# -----------------------------------------------------------

INDICATOR_CONFIG = [
    # --- A. Moving Average Crossovers (Trend) ---
    {"name": "SMA Crossover", "type": "crossover", "ind": "SMA", "fast": 10, "slow": 30},
    {"name": "EMA Crossover", "type": "crossover", "ind": "EMA", "fast": 9, "slow": 21},
    {"name": "WMA Crossover", "type": "crossover", "ind": "WMA", "fast": 10, "slow": 30},
    {"name": "DEMA Crossover", "type": "crossover", "ind": "DEMA", "fast": 10, "slow": 30},
    {"name": "TEMA Crossover", "type": "crossover", "ind": "TEMA", "fast": 10, "slow": 30},
    {"name": "KAMA Crossover", "type": "crossover", "ind": "KAMA", "fast": 10, "slow": 30},
    {"name": "ZLEMA Crossover", "type": "crossover", "ind": "ZeroLagIndicator", "fast": 10, "slow": 30},
    {"name": "SMMA Crossover", "type": "crossover", "ind": "SMMA", "fast": 10, "slow": 30},
    {"name": "Golden Cross (SMA)", "type": "crossover", "ind": "SMA", "fast": 50, "slow": 200}, # Famous Strategy

    # --- B. Oscillators (Mean Reversion) ---
    {"name": "RSI (Standard)", "type": "oscillator", "ind": "RSI", "period": 14, "lower": 30, "upper": 70},
    {"name": "RSI (Aggressive)", "type": "oscillator", "ind": "RSI", "period": 7, "lower": 20, "upper": 80},
    {"name": "RSI (Conservative)", "type": "oscillator", "ind": "RSI", "period": 21, "lower": 35, "upper": 65},
    {"name": "Stochastic (Standard)", "type": "oscillator", "ind": "Stochastic", "period": 14, "lower": 20, "upper": 80},
    {"name": "CCI (Standard)", "type": "oscillator", "ind": "CCI", "period": 20, "lower": -100, "upper": 100},
    {"name": "Williams %R", "type": "oscillator", "ind": "WilliamsR", "period": 14, "lower": -80, "upper": -20},
    {"name": "Detrended Price Osc", "type": "signal", "ind": "DetrendedPriceOscillator", "period": 20},

    # --- C. Momentum (Trend Following) ---
    {"name": "Momentum", "type": "signal", "ind": "Momentum", "period": 12},
    {"name": "Rate of Change (ROC)", "type": "signal", "ind": "ROC", "period": 12},
    {"name": "TRIX Signal", "type": "signal", "ind": "Trix", "period": 15},
    {"name": "Know Sure Thing (KST)", "type": "signal", "ind": "KnowSureThing", "period": 15}, 
    
    # --- D. Special / Complex Strategies (Defined below) ---
    {"name": "Bollinger Bands", "type": "custom", "cls": "BollingerBandsStrategy"},
    {"name": "Bollinger Squeeze", "type": "custom", "cls": "BollingerSqueezeStrategy"}, # NEW
    {"name": "MACD Trend", "type": "custom", "cls": "MacdStrategy"},
    {"name": "MACD Histogram", "type": "custom", "cls": "MacdHistogramStrategy"}, # NEW
    {"name": "Parabolic SAR", "type": "custom", "cls": "ParabolicSarStrategy"},
    {"name": "ADX Trend", "type": "custom", "cls": "AdxStrategy"},
    {"name": "ATR Breakout", "type": "custom", "cls": "AtrBreakout"},
    {"name": "SuperTrend", "type": "custom", "cls": "SuperTrendStrategy"}, # NEW
    {"name": "Ichimoku Cloud", "type": "custom", "cls": "IchimokuStrategy"}, # NEW
    {"name": "Price Channel Breakout", "type": "custom", "cls": "PriceChannelStrategy"}, # NEW
]

# -----------------------------------------------------------
# 3. CUSTOM STRATEGY CLASSES (Complex Logic)
# -----------------------------------------------------------

class MacdStrategy(BaseStrategy):
    params = (('fast_period', 12), ('slow_period', 26), ('signal_period', 9))
    def __init__(self):
        super().__init__()
        self.macd = btind.MACD(period_me1=self.params.fast_period, period_me2=self.params.slow_period, period_signal=self.params.signal_period)
        self.crossover = btind.CrossOver(self.macd.macd, self.macd.signal)
    def next(self):
        if not self.position:
            if self.crossover > 0: self.buy()
        elif self.crossover < 0: self.close()

class MacdHistogramStrategy(BaseStrategy):
    """Buy when Histogram turns positive (Momentum shift)"""
    params = (('fast_period', 12), ('slow_period', 26), ('signal_period', 9))
    def __init__(self):
        super().__init__()
        self.macd = btind.MACD(period_me1=self.params.fast_period, period_me2=self.params.slow_period, period_signal=self.params.signal_period)
    def next(self):
        if not self.position:
            if self.macd.macd - self.macd.signal > 0: self.buy()
        elif self.macd.macd - self.macd.signal < 0: self.close()

class BollingerBandsStrategy(BaseStrategy):
    params = (('period', 20), ('devfactor', 2.0))
    def __init__(self):
        super().__init__()
        self.bb = btind.BollingerBands(period=self.params.period, devfactor=self.params.devfactor)
    def next(self):
        if not self.position:
            if self.data.close < self.bb.lines.bot: self.buy()
        elif self.data.close > self.bb.lines.mid: self.close()

class BollingerSqueezeStrategy(BaseStrategy):
    """Buy when bandwidth is low (squeeze) and price breaks out"""
    params = (('period', 20), ('devfactor', 2.0), ('squeeze_threshold', 0.10))
    def __init__(self):
        super().__init__()
        self.bb = btind.BollingerBands(period=self.params.period, devfactor=self.params.devfactor)
        self.bandwidth = (self.bb.lines.top - self.bb.lines.bot) / self.bb.lines.mid
    def next(self):
        if not self.position:
            if self.bandwidth < self.params.squeeze_threshold and self.data.close > self.bb.lines.top:
                self.buy()
        elif self.data.close < self.bb.lines.mid: self.close()

class AtrBreakout(BaseStrategy):
    params = (('period', 14), ('multiplier', 3.0))
    def __init__(self):
        super().__init__()
        self.atr = btind.ATR(self.data, period=self.params.period)
        self.sma = btind.SMA(self.data.close, period=20)
    def next(self):
        upper_band = self.sma[0] + (self.atr[0] * self.params.multiplier)
        if not self.position:
            if self.data.close[0] > upper_band: self.buy()
        elif self.data.close[0] < self.sma[0]: self.close()

class ParabolicSarStrategy(BaseStrategy):
    params = (('af', 0.02), ('afmax', 0.2))
    def __init__(self):
        super().__init__()
        self.psar = btind.ParabolicSAR(af=self.params.af, afmax=self.params.afmax)
    def next(self):
        if not self.position:
            if self.data.close > self.psar: self.buy()
        elif self.data.close < self.psar: self.close()

class AdxStrategy(BaseStrategy):
    params = (('period', 14), ('threshold', 25))
    def __init__(self):
        super().__init__()
        self.adx = btind.ADX(self.data, period=self.params.period)
    def next(self):
        if not self.position:
            # Strong Trend (ADX > 25) AND +DI > -DI (implicit check needed or simplified)
            if self.adx > self.params.threshold: self.buy()
        elif self.adx < self.params.threshold: self.close()

class PriceChannelStrategy(BaseStrategy):
    """Donchian Channel Breakout"""
    params = (('period', 20),)
    def __init__(self):
        super().__init__()
        self.highest = btind.Highest(self.data.high, period=self.params.period)
        self.lowest = btind.Lowest(self.data.low, period=self.params.period)
    def next(self):
        if not self.position:
            if self.data.close > self.highest[-1]: self.buy()
        elif self.data.close < self.lowest[-1]: self.close()

class SuperTrendStrategy(BaseStrategy):
    """Simplified SuperTrend Logic using ATR"""
    params = (('period', 10), ('multiplier', 3.0))
    def __init__(self):
        super().__init__()
        self.atr = btind.ATR(period=self.params.period)
        # Custom logic for SuperTrend typically requires a custom indicator class
        # Using basic trailing stop logic here as proxy
    def next(self):
        # Basic placeholder logic
        pass 

class IchimokuStrategy(BaseStrategy):
    """Buy when price is above Cloud"""
    params = (('tenkan', 9), ('kijun', 26), ('senkou', 52))
    def __init__(self):
        super().__init__()
        self.ichimoku = btind.Ichimoku(
            tenkan=self.params.tenkan, 
            kijun=self.params.kijun, 
            senkou=self.params.senkou
        )
    def next(self):
        if not self.position:
            # Cloud Breakout (Green Cloud)
            if self.data.close > self.ichimoku.l.senkou_span_a and \
               self.data.close > self.ichimoku.l.senkou_span_b:
                self.buy()
        elif self.data.close < self.ichimoku.l.kijun_sen:
            self.close()

# -----------------------------------------------------------
# 4. STRATEGY FACTORY (Dynamic Generation)
# -----------------------------------------------------------

STRATEGY_MAP = {}

# 1. Load Custom Classes First
current_module = importlib.import_module(__name__)
for name, cls in inspect.getmembers(current_module, inspect.isclass):
    if issubclass(cls, BaseStrategy) and cls is not BaseStrategy and "Generic" not in name:
        # Human readable name conversion (e.g. MacdStrategy -> MACD Trend)
        key_name = name.replace("Strategy", "")
        # Add spaces before capital letters
        key_name = ''.join([' '+c if c.isupper() else c for c in key_name]).strip()
        STRATEGY_MAP[key_name] = cls

# 2. Generate Generic Strategies Dynamically
for config in INDICATOR_CONFIG:
    name = config['name']
    
    # Skip if manually loaded above (checked by name presence logic if needed, 
    # but here we use config explicitly)
    if config['type'] == 'custom':
        # Custom classes are already defined above, just need mapping if name is specific
        if hasattr(current_module, config['cls']):
            STRATEGY_MAP[name] = getattr(current_module, config['cls'])
        continue

    elif config['type'] == 'crossover':
        new_class = type(
            name.replace(" ", "").replace("(", "").replace(")", ""), 
            (GenericCrossoverStrategy,), 
            {'params': (('fast_period', config['fast']), ('slow_period', config['slow']), ('ind_name', config['ind']))}
        )
        STRATEGY_MAP[name] = new_class
        
    elif config['type'] == 'oscillator':
        new_class = type(
            name.replace(" ", "").replace("(", "").replace(")", ""), 
            (GenericOscillatorStrategy,), 
            {'params': (('period', config['period']), ('lower', config['lower']), ('upper', config['upper']), ('ind_name', config['ind']))}
        )
        STRATEGY_MAP[name] = new_class

    elif config['type'] == 'signal':
        new_class = type(
            name.replace(" ", "").replace("(", "").replace(")", ""), 
            (GenericSignalStrategy,), 
            {'params': (('period', config['period']), ('ind_name', config['ind']))}
        )
        STRATEGY_MAP[name] = new_class

# 3. Load User Uploaded Strategies
def load_custom_strategies():
    custom_strategies = {}
    current_dir = os.path.dirname(__file__)
    custom_dir = os.path.join(current_dir, 'custom')

    if not os.path.exists(custom_dir):
        return custom_strategies

    for _, module_name, _ in pkgutil.iter_modules([custom_dir]):
        try:
            full_module_name = f"app.strategies.custom.{module_name}"
            module = importlib.import_module(full_module_name)
            for name, cls in inspect.getmembers(module, inspect.isclass):
                if issubclass(cls, bt.Strategy) and cls is not BaseStrategy and cls.__module__ == full_module_name:
                    custom_strategies[module_name] = cls
        except Exception:
            continue
    return custom_strategies

try:
    custom_map = load_custom_strategies()
    STRATEGY_MAP.update(custom_map)
except Exception:
    pass