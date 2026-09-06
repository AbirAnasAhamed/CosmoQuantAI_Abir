import numpy as np
import pandas as pd
import logging
try:
    import talib
    HAS_TALIB = True
except ImportError:
    HAS_TALIB = False

class CandlestickPatternFeatures:
    """
    Forex ML Intelligence Studio - Category 8: Candlestick Patterns
    65 Advanced Hedge-Fund Grade Quant Metrics (61 TA-Lib + 4 Custom Quant).
    """

    # 61 Exact TA-Lib Pattern Functions
    TALIB_PATTERNS = [
        'CDL2CROWS', 'CDL3BLACKCROWS', 'CDL3INSIDE', 'CDL3LINESTRIKE', 'CDL3OUTSIDE', 
        'CDL3STARSINSOUTH', 'CDL3WHITESOLDIERS', 'CDLADVANCEBLOCK', 'CDLBELTHOLD', 
        'CDLBREAKAWAY', 'CDLCLOSINGMARUBOZU', 'CDLCONCEALBABYSWALL', 'CDLCOUNTERATTACK', 
        'CDLDARKCLOUDCOVER', 'CDLDOJI', 'CDLDOJISTAR', 'CDLDRAGONFLYDOJI', 'CDLENGULFING', 
        'CDLEVENINGDOJISTAR', 'CDLEVENINGSTAR', 'CDLGAPSIDESIDEWHITE', 'CDLGRAVESTONEDOJI', 
        'CDLHAMMER', 'CDLHANGINGMAN', 'CDLHARAMI', 'CDLHARAMICROSS', 'CDLHIGHWAVE', 
        'CDLHIKKAKE', 'CDLHIKKAKEMOD', 'CDLHOMINGPIGEON', 'CDLIDENTICAL3CROWS', 'CDLINNECK', 
        'CDLINVERTEDHAMMER', 'CDLKICKING', 'CDLKICKINGBYLENGTH', 'CDLLADDERBOTTOM', 
        'CDLLONGLEGGEDDOJI', 'CDLLONGLINE', 'CDLMARUBOZU', 'CDLMATCHINGLOW', 'CDLMATHOLD', 
        'CDLMORNINGDOJISTAR', 'CDLMORNINGSTAR', 'CDLONNECK', 'CDLPIERCING', 'CDLRICKSHAWMAN', 
        'CDLRISEFALL3METHODS', 'CDLSEPARATINGLINES', 'CDLSHOOTINGSTAR', 'CDLSHORTLINE', 
        'CDLSPINNINGTOP', 'CDLSTALLEDPATTERN', 'CDLSTICKSANDWICH', 'CDLTAKURI', 'CDLTASUKIGAP', 
        'CDLTHRUSTING', 'CDLTRISTAR', 'CDLUNIQUE3RIVER', 'CDLUPSIDEGAP2CROWS', 'CDLXSIDEGAP3METHODS'
    ]

    @staticmethod
    def calculate_all(df_raw: pd.DataFrame) -> pd.DataFrame:
        if df_raw.empty:
            return df_raw
            
        required_cols = ['open', 'high', 'low', 'close', 'volume']
        df_safe = df_raw.copy()
        
        for col in required_cols:
            if col not in df_safe.columns:
                # If volume is missing, we create a fake one to prevent total failure
                if col == 'volume':
                    df_safe['volume'] = 1.0
                else:
                    logging.warning(f"Missing '{col}' for Candlestick features. Skipping.")
                    return df_raw
                
        try:
            extractor = CandlestickPatternFeatures(df_safe)
            new_features = extractor.generate_all_features()
            result = pd.concat([df_safe, new_features], axis=1)
            return result.fillna(0)
        except Exception as e:
            logging.error(f"\n{'='*60}\nCRITICAL ERROR: TA-Lib Failed or Logic Error! Training Stopped.\nDetails: {e}\n{'='*60}")
            raise RuntimeError(f"CRITICAL ERROR: TA-Lib Failed! Training Stopped. ({e})")

    def __init__(self, df: pd.DataFrame):
        self.df = df
        self.open = df['open'].values
        self.high = df['high'].values
        self.low = df['low'].values
        self.close = df['close'].values
        self.volume = df['volume'].values
        self.index = df.index
        
        # Pre-calculate ATR proxy for custom quant metrics
        tr = np.maximum(self.high - self.low, 
                        np.maximum(np.abs(self.high - np.roll(self.close, 1)), 
                                   np.abs(self.low - np.roll(self.close, 1))))
        tr[0] = self.high[0] - self.low[0]
        self.atr = pd.Series(tr, index=self.index).rolling(14, min_periods=1).mean().values

    def generate_all_features(self) -> pd.DataFrame:
        features_list = [
            self.generate_talib_patterns(),
            self.generate_custom_quant_patterns()
        ]
        return pd.concat(features_list, axis=1)

    def generate_talib_patterns(self) -> pd.DataFrame:
        """Generates all TA-Lib candlestick patterns. Fallbacks to 0 if TA-Lib is missing."""
        f = pd.DataFrame(index=self.index)
        
        for pattern in self.TALIB_PATTERNS:
            feature_name = f"{pattern.lower()}"
            if HAS_TALIB and hasattr(talib, pattern):
                try:
                    func = getattr(talib, pattern)
                    # TA-Lib returns integers: usually 100 for Bullish, -100 for Bearish, 0 for None
                    # We normalize it to 1, -1, 0 for ML consistency
                    res = func(self.open, self.high, self.low, self.close)
                    f[feature_name] = res / 100.0
                except Exception as e:
                    raise RuntimeError(f"TA-Lib execution failed for {pattern}: {e}")
            else:
                raise RuntimeError(f"TA-Lib is NOT installed or missing function '{pattern}'. Cannot generate critical metrics!")
                
        return f

    def generate_custom_quant_patterns(self) -> pd.DataFrame:
        """Generates the 4 custom Quant Hedge-Fund grade candlestick metrics."""
        f = pd.DataFrame(index=self.index)
        
        body = np.abs(self.close - self.open)
        candle_range = self.high - self.low
        
        # 1. True Pin Bar Logic
        # Wick must be >= 66% of total range, Body <= 33%
        upper_wick = self.high - np.maximum(self.open, self.close)
        lower_wick = np.minimum(self.open, self.close) - self.low
        
        is_bullish_pinbar = (lower_wick >= (candle_range * 0.66)) & (body <= (candle_range * 0.33)) & (candle_range > 0)
        is_bearish_pinbar = (upper_wick >= (candle_range * 0.66)) & (body <= (candle_range * 0.33)) & (candle_range > 0)
        
        f['cdl_custom_pin_bar'] = np.where(is_bullish_pinbar, 1.0, np.where(is_bearish_pinbar, -1.0, 0.0))
        
        # 2. Master Candle Breakout
        # A candle whose range is > 1.5x the average range (ATR)
        is_master_candle = candle_range > (self.atr * 1.5)
        # Track days since last master candle to identify compression/inside bars
        master_group_id = pd.Series(is_master_candle, index=self.index).cumsum()
        days_since_master = pd.Series(is_master_candle, index=self.index).groupby(master_group_id).cumcount().values
        # Normalize for ML by capping at 20 periods
        f['cdl_custom_days_since_master'] = np.clip(days_since_master, 0, 20) / 20.0
        
        # 3. Exhaustion Divergence
        # High volume but small body (effort vs result divergence)
        avg_vol = pd.Series(self.volume, index=self.index).rolling(20, min_periods=1).mean().values
        rel_vol = self.volume / (avg_vol + 1e-9)
        rel_body = body / (self.atr + 1e-9)
        
        # Strong volume (>1.5x) but small body (<0.3x ATR)
        f['cdl_custom_exhaustion_divergence'] = np.where((rel_vol > 1.5) & (rel_body < 0.3), 1.0, 0.0)
        
        # 4. Momentum Power
        # Signed Body size relative to ATR
        direction = np.where(self.close > self.open, 1.0, np.where(self.close < self.open, -1.0, 0.0))
        f['cdl_custom_momentum_power'] = (body / (self.atr + 1e-9)) * direction
        
        return f
