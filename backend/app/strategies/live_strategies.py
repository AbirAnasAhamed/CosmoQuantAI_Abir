import pandas_ta as ta
import pandas as pd

# -----------------------------------------------------------
# 1. Base Interface for Live Strategies
# -----------------------------------------------------------
class BaseLiveStrategy:
    def __init__(self, config):
        self.config = config

    def check_signal(self, df: pd.DataFrame):
        """
        Input: DataFrame with OHLCV data
        Output: (Signal, Reason, Price)
        Signal: "BUY", "SELL", or "HOLD"
        """
        raise NotImplementedError("Subclasses must implement check_signal method")

# -----------------------------------------------------------
# 2. Concrete Strategy Implementations
# -----------------------------------------------------------

class RSIStrategy(BaseLiveStrategy):
    """
    RSI Strategy: Buy if Oversold (<30), Sell if Overbought (>70) (Optional logic)
    """
    def check_signal(self, df):
        period = int(self.config.get('period', 14))
        lower_band = float(self.config.get('lower', 30))
        upper_band = float(self.config.get('upper', 70))

        # Calculate RSI
        df['rsi'] = ta.rsi(df['close'], length=period)
        
        if df['rsi'].iloc[-1] is None:
            return "HOLD", "Not enough data", df['close'].iloc[-1]

        current_rsi = df['rsi'].iloc[-1]
        current_price = df['close'].iloc[-1]

        if current_rsi < lower_band:
            return "BUY", f"RSI Oversold ({current_rsi:.2f})", current_price
        
        # ✅ FIX: SELL Condition Enabled
        elif current_rsi > upper_band:
            return "SELL", f"RSI Overbought ({current_rsi:.2f})", current_price
        
        return "HOLD", f"RSI Neutral ({current_rsi:.2f})", current_price

class MACDStrategy(BaseLiveStrategy):
    """
    MACD Strategy: Buy (Golden Cross), Sell (Death Cross)
    """
    def check_signal(self, df):
        fast = int(self.config.get('fast_period', 12))
        slow = int(self.config.get('slow_period', 26))
        signal_span = int(self.config.get('signal_period', 9))

        # Calculate MACD
        macd_df = ta.macd(df['close'], fast=fast, slow=slow, signal=signal_span)
        
        if macd_df is None or macd_df.empty:
             return "HOLD", "Not enough data", df['close'].iloc[-1]

        # pandas_ta returns columns like MACD_12_26_9, MACDs_12_26_9, MACDh_12_26_9
        macd_col = f"MACD_{fast}_{slow}_{signal_span}"
        signal_col = f"MACDs_{fast}_{slow}_{signal_span}"

        current_macd = macd_df[macd_col].iloc[-1]
        current_signal = macd_df[signal_col].iloc[-1]
        prev_macd = macd_df[macd_col].iloc[-2]
        prev_signal = macd_df[signal_col].iloc[-2]
        current_price = df['close'].iloc[-1]

        # Crossover Logic
        # 1. Golden Cross (BUY)
        if prev_macd < prev_signal and current_macd > current_signal:
            return "BUY", "MACD Golden Cross", current_price
            
        # 2. Death Cross (SELL)
        elif prev_macd > prev_signal and current_macd < current_signal:
            return "SELL", "MACD Death Cross", current_price
        
        return "HOLD", f"MACD: {current_macd:.2f} | Sig: {current_signal:.2f}", current_price

class BollingerBandsStrategy(BaseLiveStrategy):
    """
    Bollinger Bands: Buy < Lower, Sell > Upper
    """
    def check_signal(self, df):
        period = int(self.config.get('period', 20))
        std_dev = float(self.config.get('devfactor', 2.0))

        bb = ta.bbands(df['close'], length=period, std=std_dev)
        
        if bb is None:
            return "HOLD", "Not enough data", df['close'].iloc[-1]

        lower_col = f"BBL_{period}_{std_dev}"
        upper_col = f"BBU_{period}_{std_dev}"

        current_price = df['close'].iloc[-1]
        lower_band = bb[lower_col].iloc[-1]
        upper_band = bb[upper_col].iloc[-1]

        if current_price < lower_band:
            return "BUY", f"Price below Lower BB ({lower_band:.2f})", current_price
            
        elif current_price > upper_band:
            return "SELL", f"Price above Upper BB ({upper_band:.2f})", current_price

        return "HOLD", f"Price within Bands", current_price

class SMACrossoverStrategy(BaseLiveStrategy):
    """
    Simple Moving Average Crossover: Buy (Fast > Slow), Sell (Fast < Slow)
    """
    def check_signal(self, df):
        fast_p = int(self.config.get('fast_period', 10))
        slow_p = int(self.config.get('slow_period', 30))

        df['fast_sma'] = ta.sma(df['close'], length=fast_p)
        df['slow_sma'] = ta.sma(df['close'], length=slow_p)

        if df['fast_sma'].iloc[-1] is None or df['slow_sma'].iloc[-1] is None:
             return "HOLD", "Not enough data", df['close'].iloc[-1]

        curr_fast = df['fast_sma'].iloc[-1]
        curr_slow = df['slow_sma'].iloc[-1]
        prev_fast = df['fast_sma'].iloc[-2]
        prev_slow = df['slow_sma'].iloc[-2]
        current_price = df['close'].iloc[-1]

        # 1. Golden Cross (BUY)
        if prev_fast < prev_slow and curr_fast > curr_slow:
            return "BUY", f"SMA Cross UP ({fast_p} > {slow_p})", current_price
            
        # 2. Death Cross (SELL)
        elif prev_fast > prev_slow and curr_fast < curr_slow:
             return "SELL", f"SMA Cross DOWN ({fast_p} < {slow_p})", current_price

        return "HOLD", f"Fast: {curr_fast:.2f} | Slow: {curr_slow:.2f}", current_price

# -----------------------------------------------------------
# 3. Strategy Factory
# -----------------------------------------------------------
class LiveStrategyFactory:
    """
    Factory class to return the correct strategy instance based on name
    """
    @staticmethod
    def get_strategy(strategy_name: str, config: dict) -> BaseLiveStrategy:
        strategy_map = {
            "RSI Strategy": RSIStrategy,
            "RSI": RSIStrategy, # Alias
            
            "MACD Trend": MACDStrategy,
            "MACD": MACDStrategy, # Alias
            
            "Bollinger Bands": BollingerBandsStrategy,
            "Bollinger": BollingerBandsStrategy, # Alias
            
            "SMA Cross": SMACrossoverStrategy,
            "SMA Cross": SMACrossoverStrategy,
            "SMA": SMACrossoverStrategy # Alias
        }
        
        # ✅ Dynamic Strategy Loader
        if strategy_name == "Custom Visual Protocol":
            from app.strategies.dynamic_strategy import DynamicStrategyExecutor
            strategy_map["Custom Visual Protocol"] = DynamicStrategyExecutor
        
        # ডিফল্ট হিসেবে RSI সেট করা হলো যদি নাম না মেলে
        strategy_class = strategy_map.get(strategy_name, RSIStrategy)
        
        # কনসোলে প্রিন্ট করা কোন স্ট্র্যাটেজি লোড হলো
        print(f"🔧 Strategy Factory: Loading '{strategy_name}' using {strategy_class.__name__}")
        
        return strategy_class(config)
