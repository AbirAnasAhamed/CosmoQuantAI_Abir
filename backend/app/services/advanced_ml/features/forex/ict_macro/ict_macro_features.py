import pandas as pd
import numpy as np

class ICTMacroEngine:
    """
    Advanced Quantitative Engine for ICT Time & Macro Dynamics.
    This class handles the 26 unique institutional order flow and macro time
    proxies (IPDA, CBDR, AMDX, MMBM, etc.) strictly using vectorized pandas operations.
    """
    
    def __init__(self, df: pd.DataFrame):
        self.df = df.copy()
        self._validate_data()
        
    def _validate_data(self):
        required_cols = ['open', 'high', 'low', 'close', 'volume']
        missing = [col for col in required_cols if col not in self.df.columns]
        if missing:
            raise ValueError(f"ICTMacroEngine: Missing required columns {missing}")
            
    def generate_all_features(self) -> pd.DataFrame:
        """Runs all 5 phases of ICT Macro Dynamics calculation and returns the updated dataframe."""
        self._calc_phase1_ipda()
        self._calc_phase2_midnight()
        self._calc_phase3_amdx()
        self._calc_phase4_mmbm()
        self._calc_phase5_intermarket()
        
        # [CRITICAL LOGIC FIX] Prevent NaNs from rolling windows (up to 100 bars) from crashing ML models
        new_cols = [c for c in self.df.columns if c.startswith('ict_')]
        self.df[new_cols] = self.df[new_cols].fillna(0)
        
        return self.df
        
    def _calc_phase1_ipda(self):
        """
        Phase 1: Interbank Price Delivery Algorithm (IPDA)
        Institutional algorithms recalibrate over rolling 20, 40, and 60 day ranges.
        We proxy these ranges and track where the current price sits within them.
        """
        # We assume 1 bar = 1 day if daily TF, or use generic rolling periods. 
        # Since this engine is timeframe agnostic, we'll use rolling periods of 20, 40, 60.
        
        # 1. IPDA 20-bar Lookback (Liquidity Range)
        high_20 = self.df['high'].rolling(20).max()
        low_20 = self.df['low'].rolling(20).min()
        range_20 = high_20 - low_20
        self.df['ict_ipda_20d_lookback'] = np.where(range_20 > 0, (self.df['close'] - low_20) / range_20, 0.5)
        self.df['ict_ipda_20d_lookback'] = self.df['ict_ipda_20d_lookback'].fillna(0.5)
        
        # 2. IPDA 40-bar Lookback (Macro Range)
        high_40 = self.df['high'].rolling(40).max()
        low_40 = self.df['low'].rolling(40).min()
        range_40 = high_40 - low_40
        self.df['ict_ipda_40d_lookback'] = np.where(range_40 > 0, (self.df['close'] - low_40) / range_40, 0.5)
        self.df['ict_ipda_40d_lookback'] = self.df['ict_ipda_40d_lookback'].fillna(0.5)
        
        # 3. IPDA 60-bar Lookback (Quarterly Cycle Tracking)
        high_60 = self.df['high'].rolling(60).max()
        low_60 = self.df['low'].rolling(60).min()
        range_60 = high_60 - low_60
        self.df['ict_ipda_60d_lookback'] = np.where(range_60 > 0, (self.df['close'] - low_60) / range_60, 0.5)
        self.df['ict_ipda_60d_lookback'] = self.df['ict_ipda_60d_lookback'].fillna(0.5)

    def _calc_phase2_midnight(self):
        """
        Phase 2: CBDR, Asian Float & Midnight Divergences
        Tracking the Central Bank Dealers Range compression and True Day Open (Midnight) anomalies.
        """
        # Since we might not have datetime, we use proxies for daily resets.
        # A simple proxy for "daily" resets in continuous data is finding rolling local minimum volatility periods (CBDR proxy).
        # We will use ATR and rolling standard deviations as proxies for time-based states if exact hours are missing.
        
        atr_14 = (self.df['high'] - self.df['low']).rolling(14).mean()
        volatility = self.df['close'].rolling(6).std()
        
        # 4. CBDR Range Compression Proxy
        # Proxy: Lowest 6-bar volatility over the last 24 bars (approximating 2PM-8PM EST compression)
        min_vol_24 = volatility.rolling(24).min()
        is_compression = volatility <= min_vol_24 * 1.1
        self.df['ict_cbdr_range_compression'] = np.where(is_compression, 1, 0)
        
        # 5. Asian Float Divergence Proxy
        # Proxy: Deviation of current price from the mean of the compression period
        cbdr_mean = self.df['close'].rolling(6).mean()
        self.df['ict_asian_float_divergence'] = (self.df['close'] - cbdr_mean) / (atr_14 + 1e-8)
        
        # 6. True Day Open (Midnight) Distance Proxy
        # Proxy: Distance from the opening price of the most recent 24-bar window
        true_day_open = self.df['open'].shift(24)
        self.df['ict_true_day_open_dist'] = (self.df['close'] - true_day_open) / (true_day_open + 1e-8)
        
        # 7. Midnight Open Cross (Fakeout Signal)
        # Proxy: Crossing the 24-bar delayed open
        cross_up = (self.df['close'] > true_day_open) & (self.df['close'].shift(1) <= true_day_open.shift(1))
        cross_down = (self.df['close'] < true_day_open) & (self.df['close'].shift(1) >= true_day_open.shift(1))
        self.df['ict_midnight_open_cross'] = np.where(cross_up, 1, np.where(cross_down, -1, 0))
        
        # 8. Midnight vs NY Divergence Proxy
        # Proxy: Direction 24 bars ago vs direction 16 bars ago (8 hour diff)
        ny_open = self.df['open'].shift(16)
        midnight_dir = np.sign(self.df['close'] - true_day_open)
        ny_dir = np.sign(self.df['close'] - ny_open)
        self.df['ict_midnight_ny_divergence'] = np.where(midnight_dir != ny_dir, 1, 0)
        
        # 9. NY Midnight vs London Midnight Spread
        # Proxy: Spread between 24-bar open and 20-bar open (4 hour GMT diff)
        london_open = self.df['open'].shift(20)
        self.df['ict_ny_mid_vs_london_mid'] = (true_day_open - london_open) / (london_open + 1e-8)

    def _calc_phase3_amdx(self):
        """
        Phase 3: AMDX & Macro Time Cycles
        Quarterly and Monthly cycle probabilities (Accumulation, Manipulation, Distribution, Continuation).
        """
        # 10. Quarterly Shift (AMDX) Phase Proxy
        # We model the 90-bar cycle into 4 phases using sine/cosine or rolling chunks.
        cycle_position = np.arange(len(self.df)) % 90
        # Phase 1: 0-22 (Accumulation), Phase 2: 23-45 (Manipulation), Phase 3: 46-67 (Distribution), Phase 4: 68-89 (X)
        self.df['ict_quarterly_shift_amdx'] = np.where(cycle_position < 23, 1, 
                                              np.where(cycle_position < 46, 2, 
                                              np.where(cycle_position < 68, 3, 4)))
                                              
        # 11. Monthly Manipulation Window Proxy
        # Proxy: Days 1-10 of a 30-bar cycle
        monthly_cycle = np.arange(len(self.df)) % 30
        self.df['ict_monthly_manipulation_window'] = np.where(monthly_cycle < 10, 1, 0)
        
        # 12. Monthly Expansion Window Proxy
        # Proxy: Days 11-20 of a 30-bar cycle
        self.df['ict_monthly_expansion_window'] = np.where((monthly_cycle >= 10) & (monthly_cycle < 20), 1, 0)
        
        # For weekly profiles, we use a 5-bar rolling cycle proxy if explicit datetime is absent.
        weekly_cycle = np.arange(len(self.df)) % 5
        
        # 13. Tuesday Low of the Week Probability
        # If today is "Tuesday" (index 1 of 5) and price is deeply oversold (RSI < 30)
        rsi = self._calc_rsi(14)
        self.df['ict_tuesday_low_prob'] = np.where((weekly_cycle == 1) & (rsi < 35), 1, 0)
        
        # 14. Wednesday High of the Week Probability
        # If today is "Wednesday" (index 2 of 5) and price is deeply overbought (RSI > 70)
        self.df['ict_wednesday_high_prob'] = np.where((weekly_cycle == 2) & (rsi > 65), 1, 0)
        
        # 15. Seek and Destroy Probability
        # Choppy market proxy: Massive wicks on BOTH sides of the candle relative to body
        body = np.abs(self.df['close'] - self.df['open'])
        upper_wick = self.df['high'] - self.df[['open', 'close']].max(axis=1)
        lower_wick = self.df[['open', 'close']].min(axis=1) - self.df['low']
        atr = (self.df['high'] - self.df['low']).rolling(14).mean()
        
        self.df['ict_seek_and_destroy_prob'] = np.where((upper_wick > body * 1.5) & (lower_wick > body * 1.5) & (body < atr * 0.5), 1, 0)

    def _calc_phase4_mmbm(self):
        """
        Phase 4: Market Maker Models (MMBM / MMSM)
        Tracking the curve of Accumulation to SMR to Distribution.
        """
        # We track a 100-bar macro curve using a low-pass filter (SMA)
        sma_20 = self.df['close'].rolling(20).mean()
        sma_100 = self.df['close'].rolling(100).mean()
        
        # 16. MMBM Consolidation Proxy (Original Consolidation)
        # Flat 100 SMA and tight 20-bar range
        range_20 = self.df['high'].rolling(20).max() - self.df['low'].rolling(20).min()
        atr_100 = (self.df['high'] - self.df['low']).rolling(100).mean()
        flat_curve = np.abs(sma_100.diff(5)) < (atr_100 * 0.1)
        self.df['ict_mmbm_consolidation_proxy'] = np.where(flat_curve & (range_20 < atr_100 * 1.5), 1, 0)
        
        # 17. MMBM SMR Proxy (Smart Money Reversal Buy)
        # Price deeply below 100 SMA, massive bullish momentum shift
        deep_discount = self.df['close'] < (sma_100 - atr_100 * 2)
        bullish_shift = self.df['close'].diff(3) > (atr_100 * 0.5)
        self.df['ict_mmbm_smr_proxy'] = np.where(deep_discount & bullish_shift, 1, 0)
        
        # 18. MMSM Distribution Proxy
        # Flat curve but price is actively churning near highs
        near_high = (self.df['high'].rolling(100).max() - self.df['close']) < (atr_100 * 0.5)
        self.df['ict_mmsm_distribution_proxy'] = np.where(flat_curve & near_high, 1, 0)
        
        # 19. MMSM SMR Proxy (Smart Money Reversal Sell)
        # Price deeply above 100 SMA, massive bearish momentum shift
        deep_premium = self.df['close'] > (sma_100 + atr_100 * 2)
        bearish_shift = self.df['close'].diff(3) < (-atr_100 * 0.5)
        self.df['ict_mmsm_smr_proxy'] = np.where(deep_premium & bearish_shift, 1, 0)

    def _calc_phase5_intermarket(self):
        """
        Phase 5: Intermarket, Time Distortion & Yield Proxies
        """
        # 20. Time Distortion Index (TDI)
        # How much time price spends in the upper vs lower half of the 20-bar range
        high_20 = self.df['high'].rolling(20).max()
        low_20 = self.df['low'].rolling(20).min()
        mid_20 = (high_20 + low_20) / 2
        
        time_above_mid = (self.df['close'] > mid_20).rolling(20).sum()
        self.df['ict_time_distortion_index_tdi'] = time_above_mid / 20.0
        
        # 21. London-NY Overlap Anomaly
        # Proxy: Sudden extreme volume spike inside a tight range (mimicking 8AM-9AM liquidity injection)
        vol_ma = self.df['volume'].rolling(20).mean()
        atr = (self.df['high'] - self.df['low']).rolling(14).mean()
        candle_range = self.df['high'] - self.df['low']
        
        anomaly = (self.df['volume'] > vol_ma * 2.5) & (candle_range < atr * 0.8)
        self.df['ict_london_ny_overlap_anomaly'] = np.where(anomaly, 1, 0)
        
        # 22. SMT Momentum Divergence (DXY Proxy)
        # Negative correlation proxy: Price makes new high, but rolling momentum (ROC) makes new low
        roc_10 = self.df['close'].diff(10)
        price_new_high = self.df['high'] >= self.df['high'].rolling(20).max()
        mom_new_low = roc_10 <= roc_10.rolling(20).min()
        price_new_low = self.df['low'] <= self.df['low'].rolling(20).min()
        mom_new_high = roc_10 >= roc_10.rolling(20).max()
        
        smt_bear = price_new_high & mom_new_low
        smt_bull = price_new_low & mom_new_high
        self.df['ict_smt_momentum_divergence'] = np.where(smt_bull, 1, np.where(smt_bear, -1, 0))
        
        # 23. Yield Spread Momentum Proxy
        # Difference between short-term ROC and long-term ROC
        roc_30 = self.df['close'].diff(30)
        self.df['ict_yield_spread_momentum'] = (roc_10 - (roc_30 / 3)) / (atr + 1e-8)
        
        # 24. Seasonal Tendency Macro Trend
        # Comparing current 20-bar trend with the trend 60 bars ago (approx 3 months proxy on daily)
        trend_now = self.df['close'].diff(20)
        trend_past = self.df['close'].shift(60).diff(20)
        self.df['ict_seasonal_tendency'] = (trend_now - trend_past) / (atr * 5 + 1e-8)
        
        # 25. Interest Rate Shock Proxy
        # 3 consecutive days of large directional expansion with massive volume, no pullbacks
        up_shock = (self.df['close'] > self.df['open']) & (self.df['close'] > self.df['high'].shift(1)) & (self.df['volume'] > vol_ma * 1.5)
        down_shock = (self.df['close'] < self.df['open']) & (self.df['close'] < self.df['low'].shift(1)) & (self.df['volume'] > vol_ma * 1.5)
        
        self.df['ict_interest_rate_shock_proxy'] = np.where(up_shock.rolling(3).sum() == 3, 1, 
                                                   np.where(down_shock.rolling(3).sum() == 3, -1, 0))
                                                   
        # 26. Macro Regime Shift Proxy
        # Sudden spike in volatility (ATR) while volume remains flat or drops (Stealth distribution/accumulation)
        atr_fast = (self.df['high'] - self.df['low']).rolling(5).mean()
        atr_slow = (self.df['high'] - self.df['low']).rolling(20).mean()
        vol_shift = atr_fast > atr_slow * 1.5
        flat_vol = self.df['volume'] < vol_ma * 1.1
        self.df['ict_macro_regime_shift_proxy'] = np.where(vol_shift & flat_vol, 1, 0)
        
    def _calc_rsi(self, window=14):
        delta = self.df['close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=window).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=window).mean()
        rs = gain / (loss + 1e-8)
        return 100 - (100 / (1 + rs))
