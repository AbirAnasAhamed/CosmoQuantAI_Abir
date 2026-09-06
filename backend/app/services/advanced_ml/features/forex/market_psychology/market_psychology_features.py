import pandas as pd
import numpy as np

class MarketPsychologyEngine:
    """
    Advanced Quantitative Engine for Forex Market Psychology.
    This class mimics institutional-grade order flow and sentiment modeling
    using purely OHLCVD data through strict pandas vectorization.
    """
    
    def __init__(self, df: pd.DataFrame):
        self.df = df.copy()
        self._validate_data()
        
    def _validate_data(self):
        required_cols = ['open', 'high', 'low', 'close', 'volume']
        missing = [col for col in required_cols if col not in self.df.columns]
        if missing:
            raise ValueError(f"MarketPsychologyEngine: Missing required columns {missing}")
            
    def generate_all_features(self) -> pd.DataFrame:
        """Runs all phases and returns the updated dataframe."""
        self._calc_capitulation()
        self._calc_pain_and_gaps()
        self._calc_order_flow_and_levels()
        self._calc_time_and_micro_behavior()
        self._calc_momentum_and_traps()
        return self.df
        
    def _calc_capitulation(self):
        """
        Phase 2: Extreme Emotion & Capitulation (Metrics 1-5)
        """
        # 1. Capitulation Spike Proxy (Both Bearish Panic and Bullish Blow-off Top)
        range_size = self.df['high'] - self.df['low']
        avg_range = range_size.rolling(20).mean()
        avg_volume = self.df['volume'].rolling(20).mean()
        
        large_range = range_size > (avg_range * 1.5)
        high_vol = self.df['volume'] > (avg_volume * 2.0)
        
        # A massive range + massive volume indicates crowd panic or extreme fomo (Capitulation)
        self.df['psych_capitulation_spike'] = np.where(large_range & high_vol, 1, 0)
        
        # 2. FOMO Acceleration Index
        # We use difference in rate of change rather than pct_change of pct_change to avoid div/0 explosions.
        roc_1 = self.df['close'].pct_change(5)
        smoothed_roc = roc_1.rolling(3).mean()
        # Acceleration is simply the velocity now minus velocity 3 bars ago
        self.df['psych_fomo_acceleration'] = (smoothed_roc - smoothed_roc.shift(3)).fillna(0)
        
        # 3. Euphoria/Despair Oscillator
        # Z-score of distance from 200 SMA (Solid institutional logic)
        sma_200 = self.df['close'].rolling(200).mean()
        dist = self.df['close'] / sma_200 - 1
        self.df['psych_euphoria_despair'] = (dist - dist.rolling(50).mean()) / (dist.rolling(50).std() + 1e-8)
        self.df['psych_euphoria_despair'] = self.df['psych_euphoria_despair'].fillna(0)
        
        # 4. Trend Fatigue Score
        # Must only trigger when there IS a trend, otherwise overlap is just ranging.
        body_top = self.df[['open', 'close']].max(axis=1)
        body_bottom = self.df[['open', 'close']].min(axis=1)
        prev_body_top = body_top.shift(1)
        prev_body_bottom = body_bottom.shift(1)
        
        is_overlapping = ((body_top <= prev_body_top) & (body_top >= prev_body_bottom)) | \
                         ((body_bottom >= prev_body_bottom) & (body_bottom <= prev_body_top))
                         
        # Check if we are actually trending (10-bar return is higher than historical average)
        price_change_10 = self.df['close'].pct_change(10).abs()
        is_trending = price_change_10 > price_change_10.rolling(50).mean()
        
        fatigue = is_overlapping.rolling(10).sum()
        self.df['psych_trend_fatigue'] = np.where(is_trending, fatigue, 0)
        
        # 5. Loss Aversion Asymmetry
        # Fear is stronger than greed. We multiply volume by price velocity (Force Index proxy).
        up_day = self.df['close'] > self.df['open']
        candle_body = abs(self.df['close'] - self.df['open'])
        
        up_force = np.where(up_day, self.df['volume'] * candle_body, 0)
        down_force = np.where(~up_day, self.df['volume'] * candle_body, 0)
        
        roll_up_force = pd.Series(up_force).rolling(14).mean()
        roll_down_force = pd.Series(down_force).rolling(14).mean()
        self.df['psych_loss_aversion'] = (roll_down_force / (roll_up_force + 1e-8)).fillna(1.0)

    def _calc_pain_and_gaps(self):
        """Phase 3: Pain Thresholds, Traps, and Gap Psychology (Metrics 6-15)"""
        # 6. Retail Trap Divergence (Bidirectional)
        # Price makes new 20-bar high/low but volume is lower than the average.
        high_20 = self.df['high'].rolling(20).max()
        low_20_min = self.df['low'].rolling(20).min()
        
        is_new_high = self.df['high'] >= high_20
        is_new_low = self.df['low'] <= low_20_min
        vol_ma = self.df['volume'].rolling(20).mean()
        
        bull_trap = is_new_high & (self.df['volume'] < vol_ma)
        bear_trap = is_new_low & (self.df['volume'] < vol_ma)
        self.df['psych_retail_trap_div'] = np.where(bull_trap, 1, np.where(bear_trap, -1, 0))
        
        # 7. Short Squeeze Potential
        # Consolidating down (SMA 20 < SMA 50), then massive up-bar with volume.
        sma_20 = self.df['close'].rolling(20).mean()
        sma_50 = self.df['close'].rolling(50).mean()
        up_day = self.df['close'] > self.df['open']
        large_body = (self.df['close'] - self.df['open']) > (self.df['high'] - self.df['low']).rolling(20).mean()
        high_vol = self.df['volume'] > self.df['volume'].rolling(20).mean() * 1.5
        self.df['psych_short_squeeze_pot'] = np.where((sma_20 < sma_50) & up_day & large_body & high_vol, 1, 0)
        
        # 8. Long Liquidation Potential
        down_day = self.df['close'] < self.df['open']
        large_body_down = (self.df['open'] - self.df['close']) > (self.df['high'] - self.df['low']).rolling(20).mean()
        self.df['psych_long_liq_pot'] = np.where((sma_20 > sma_50) & down_day & large_body_down & high_vol, 1, 0)
        
        # 9. Pain Index (Bidirectional)
        # Depth of drawdown for BOTH longs (from high) and shorts (from low)
        high_50 = self.df['high'].rolling(50).max()
        low_50 = self.df['low'].rolling(50).min()
        long_pain = (high_50 - self.df['close']) / (high_50 + 1e-8)
        short_pain = (self.df['close'] - low_50) / (low_50 + 1e-8)
        # We output the max pain in the market currently (someone is always trapped)
        self.df['psych_pain_index'] = np.maximum(long_pain, short_pain)
        
        # 10. Time-in-Drawdown (TiD) (Bidirectional)
        # Bars since the 50-bar extreme was touched
        is_extreme = (self.df['high'] >= high_50) | (self.df['low'] <= low_50)
        block = is_extreme.cumsum()
        self.df['psych_time_in_drawdown'] = self.df.groupby(block).cumcount()
        
        # 11. Stop-Hunt Rejection Magnitude
        # Long wick sweeping a 20-bar extreme and closing inside
        low_20 = self.df['low'].rolling(20).min().shift(1)
        high_20_shift = self.df['high'].rolling(20).max().shift(1)
        sweep_low = (self.df['low'] < low_20) & (self.df['close'] > low_20)
        sweep_high = (self.df['high'] > high_20_shift) & (self.df['close'] < high_20_shift)
        wick_size = np.where(sweep_low, self.df['close'] - self.df['low'], 
                    np.where(sweep_high, self.df['high'] - self.df['close'], 0))
        self.df['psych_stop_hunt_rejection'] = wick_size / (self.df['close'] + 1e-8)
        
        # 12. Runaway vs Exhaustion Gap
        # Gap size * Trend direction. 
        gap = self.df['open'] - self.df['close'].shift(1)
        # Positive gap in uptrend (sma20 > sma50) = runaway bullish. Positive gap in downtrend = exhaustion.
        self.df['psych_runaway_exhaustion_gap'] = gap * np.where(sma_20 > sma_50, 1, -1)
        
        # 13. Weekend Gap Z-Score
        # Simply the Z-score of all gap magnitudes. (Since we don't have datetime easily accessible here without knowing index, we proxy it as general gap z-score).
        gap_abs = gap.abs()
        self.df['psych_weekend_gap_zscore'] = (gap_abs - gap_abs.rolling(100).mean()) / (gap_abs.rolling(100).std() + 1e-8)
        self.df['psych_weekend_gap_zscore'] = self.df['psych_weekend_gap_zscore'].fillna(0)
        
        # 14. ORB Trap Rate
        # Frequency of false breakouts in rolling window (using Stop-hunt signal as proxy)
        is_trap = sweep_low | sweep_high
        self.df['psych_orb_trap_rate'] = is_trap.rolling(20).mean()
        
        # 15. Dead Cat Bounce / Short Covering Probability (Bidirectional)
        # Velocity of drop vs velocity of bounce.
        drop_vel = self.df['close'].diff(3).clip(upper=0).abs()
        bounce_vel = self.df['close'].diff(2).clip(lower=0)
        dead_cat = np.where((drop_vel > drop_vel.rolling(50).mean() * 1.5), bounce_vel / (drop_vel + 1e-8), 0)
        
        rally_vel = self.df['close'].diff(3).clip(lower=0)
        rejection_vel = self.df['close'].diff(2).clip(upper=0).abs()
        short_cover_trap = np.where((rally_vel > rally_vel.rolling(50).mean() * 1.5), rejection_vel / (rally_vel + 1e-8), 0)
        
        # Combine both (positive for dead cat, negative for short cover trap)
        self.df['psych_dead_cat_bounce'] = np.where(dead_cat > 0, dead_cat, -short_cover_trap)

    def _calc_order_flow_and_levels(self):
        """Phase 4 & 5: Order Flow and Price Level Psychology (Metrics 16-25)"""
        # 16. True Buying/Selling Pressure
        # (Close - Low) vs (High - Close)
        buy_pressure = self.df['close'] - self.df['low']
        sell_pressure = self.df['high'] - self.df['close']
        self.df['psych_true_buying_selling'] = (buy_pressure - sell_pressure) / (self.df['high'] - self.df['low'] + 1e-8)
        
        # 17. Tick Velocity Extremes
        # Volume relative to rolling average
        vol_ma = self.df['volume'].rolling(50).mean()
        self.df['psych_tick_velocity_ext'] = self.df['volume'] / (vol_ma + 1e-8)
        
        # 18. COT Retail Proxy
        # Proxy: When RSI is > 70 but Price is < SMA 50 (Retail buying the dip too early).
        # We need an RSI proxy. Let's calculate a fast RSI.
        delta = self.df['close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / (loss + 1e-8)
        rsi = 100 - (100 / (1 + rs))
        
        sma_50 = self.df['close'].rolling(50).mean()
        # Retail Net Long Proxy: Price is downtrending, but oscillators are oversold for a long time.
        self.df['psych_cot_retail_proxy'] = np.where((self.df['close'] < sma_50) & (rsi < 30), 1, 
                                            np.where((self.df['close'] > sma_50) & (rsi > 70), -1, 0))
        
        # 19. Aggressive Order Imbalance
        # Large directional volume.
        directional_vol = self.df['volume'] * self.df['psych_true_buying_selling']
        self.df['psych_aggressive_imbalance'] = (directional_vol - directional_vol.rolling(50).mean()) / (directional_vol.rolling(50).std() + 1e-8)
        self.df['psych_aggressive_imbalance'] = self.df['psych_aggressive_imbalance'].fillna(0)
        
        # 20. Herd Behavior Index
        # Price continues in one direction for N bars without touching the opposite side of the candle body.
        # Just use consecutive closes in same direction.
        up_close = (self.df['close'] > self.df['close'].shift(1)).astype(int)
        down_close = (self.df['close'] < self.df['close'].shift(1)).astype(int)
        
        up_streak = up_close.groupby((up_close == 0).cumsum()).cumsum()
        down_streak = down_close.groupby((down_close == 0).cumsum()).cumsum()
        self.df['psych_herd_behavior'] = up_streak - down_streak
        
        # 21. Round Number Proximity
        # Distance to nearest 0.01 or 0.001 (We will use modulo of price)
        # A good proxy for round number in any asset is checking modulo of ATR.
        atr = (self.df['high'] - self.df['low']).rolling(14).mean()
        # To avoid hardcoding 1.1000, we normalize price.
        # Distance to the nearest integer of (Price / (ATR * 10))
        scaled_price = self.df['close'] / (atr * 10 + 1e-8)
        dist_to_round = np.abs(scaled_price - np.round(scaled_price))
        self.df['psych_round_number_prox'] = dist_to_round
        
        # 22. Round Number Rejection Rate
        # Frequency of wicks near round numbers
        is_near_round = dist_to_round < 0.1
        has_wick = ((self.df['high'] - self.df[['open', 'close']].max(axis=1)) > atr * 0.5) | \
                   ((self.df[['open', 'close']].min(axis=1) - self.df['low']) > atr * 0.5)
        self.df['psych_round_number_rej'] = (is_near_round & has_wick).rolling(20).mean()
        
        # 23. News Reaction Persistence
        # After an extreme volume bar, does the price continue?
        ext_vol = self.df['volume'] > self.df['volume'].rolling(50).mean() * 3
        # 3-bar return after the extreme volume
        # Shift it back so it's a known feature at time T. We track the historical persistence.
        persistence = np.where(ext_vol.shift(3), self.df['close'] / self.df['close'].shift(3) - 1, 0)
        self.df['psych_news_reaction_pers'] = pd.Series(persistence).rolling(50).mean()
        
        # 24. Time-based Capitulation
        # Bars spent in a very tight range (Boredom before breakout)
        rolling_max = self.df['high'].rolling(10).max()
        rolling_min = self.df['low'].rolling(10).min()
        tight_range = (rolling_max - rolling_min) < atr * 1.5
        self.df['psych_time_capitulation'] = tight_range.groupby((tight_range == 0).cumsum()).cumsum()
        
        # 25. Extended Bull/Bear Runs
        # Same as herd behavior but strictly bullish/bearish candle bodies.
        up_body = (self.df['close'] > self.df['open']).astype(int)
        down_body = (self.df['close'] < self.df['open']).astype(int)
        self.df['psych_extended_runs'] = up_body.groupby((up_body == 0).cumsum()).cumsum() - \
                                         down_body.groupby((down_body == 0).cumsum()).cumsum()

    def _calc_time_and_micro_behavior(self):
        """Phase 6 & 7: Time, Patience, and Micro-Behavior (Metrics 26-35)"""
        sma_20 = self.df['close'].rolling(20).mean()
        
        # 26. Time-to-Recovery (TTR)
        # Bars since price crossed SMA 20
        cross_up = (self.df['close'] > sma_20) & (self.df['close'].shift(1) <= sma_20.shift(1))
        cross_dn = (self.df['close'] < sma_20) & (self.df['close'].shift(1) >= sma_20.shift(1))
        cross_any = cross_up | cross_dn
        self.df['psych_ttr_oscillator'] = self.df.groupby(cross_any.cumsum()).cumcount()
        
        # 27. Consolidation Boredom Index
        # Dropping volume AND tight range
        atr = (self.df['high'] - self.df['low']).rolling(14).mean()
        vol_drop = self.df['volume'] < self.df['volume'].rolling(20).mean() * 0.8
        range_drop = (self.df['high'] - self.df['low']) < atr * 0.8
        boredom = vol_drop & range_drop
        self.df['psych_consolidation_boredom'] = boredom.groupby((boredom == 0).cumsum()).cumsum()
        
        # 28. False Breakout Frequency
        # Wicks that break 20-bar high/low but close inside
        high_20 = self.df['high'].rolling(20).max().shift(1)
        low_20 = self.df['low'].rolling(20).min().shift(1)
        false_break = ((self.df['high'] > high_20) & (self.df['close'] < high_20)) | \
                      ((self.df['low'] < low_20) & (self.df['close'] > low_20))
        self.df['psych_false_breakout_freq'] = false_break.rolling(20).sum()
        
        # 29. Session Overlap Ratio
        # How much of current bar is inside previous bar
        overlap_high = np.minimum(self.df['high'], self.df['high'].shift(1))
        overlap_low = np.maximum(self.df['low'], self.df['low'].shift(1))
        overlap_size = np.maximum(0, overlap_high - overlap_low)
        self.df['psych_session_overlap'] = overlap_size / (self.df['high'] - self.df['low'] + 1e-8)
        
        # 30. Volatility Shock Memory
        # Current ATR / 100-bar max ATR
        atr_100_max = atr.rolling(100).max()
        self.df['psych_volatility_shock_mem'] = atr / (atr_100_max + 1e-8)
        
        # 31. Micro-Gap Frequency
        # Gap between close and open
        micro_gap = np.abs(self.df['open'] - self.df['close'].shift(1)) > (atr * 0.1)
        self.df['psych_micro_gap_freq'] = micro_gap.rolling(10).sum()
        
        # 32. Wick-to-Body Asymmetry (WBA)
        upper_wick = self.df['high'] - self.df[['open', 'close']].max(axis=1)
        lower_wick = self.df[['open', 'close']].min(axis=1) - self.df['low']
        self.df['psych_wba'] = (upper_wick.rolling(14).sum() - lower_wick.rolling(14).sum()) / (atr.rolling(14).sum() + 1e-8)
        
        # 33. Intra-bar Rejection Velocity
        # (Wick size / total range) * volume
        total_wick = upper_wick + lower_wick
        self.df['psych_intra_bar_rejection'] = (total_wick / (self.df['high'] - self.df['low'] + 1e-8)) * self.df['volume']
        
        # 34. Close-to-Close Churn
        # High volume but low close-to-close difference
        c2c_diff = np.abs(self.df['close'] - self.df['close'].shift(1))
        self.df['psych_c2c_churn'] = self.df['volume'] / (c2c_diff + 1e-8)
        # Normalize to avoid extreme spikes
        self.df['psych_c2c_churn'] = np.log1p(self.df['psych_c2c_churn'])
        
        # 35. The "Bailout" Metric
        # High volume exactly at the 50 SMA (break-even proxy for trapped traders)
        sma_50 = self.df['close'].rolling(50).mean()
        at_sma = np.abs(self.df['close'] - sma_50) < (atr * 0.2)
        high_vol = self.df['volume'] > self.df['volume'].rolling(20).mean() * 1.5
        self.df['psych_bailout_metric'] = np.where(at_sma & high_vol, 1, 0)

    def _calc_momentum_and_traps(self):
        """Phase 8 & 9: Mathematical Momentum and Trap Dynamics (Metrics 36-46)"""
        # 36. Price-Volume Divergence Severity
        # Diff between Price ROC and Volume ROC
        price_roc = self.df['close'].pct_change(10)
        vol_roc = self.df['volume'].pct_change(10)
        self.df['psych_pv_div_severity'] = np.abs(price_roc - vol_roc)
        
        # 37. Trend Angle Deceleration
        # Change in slope of SMA 20
        sma_20 = self.df['close'].rolling(20).mean()
        slope = sma_20.diff(3)
        self.df['psych_trend_angle_decel'] = slope.diff(3).fillna(0)
        
        # 38. Sunk Cost Indicator
        # Drawdown * Volume
        high_50 = self.df['high'].rolling(50).max()
        drawdown = np.maximum(0, (high_50 - self.df['close']) / high_50)
        self.df['psych_sunk_cost'] = drawdown * self.df['volume']
        
        # 39. Oscillator Sticky Time
        # Fast RSI proxy > 70 or < 30 streaks
        delta = self.df['close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / (loss + 1e-8)
        rsi = 100 - (100 / (1 + rs))
        
        overbought = (rsi > 70).astype(int)
        oversold = (rsi < 30).astype(int)
        self.df['psych_oscillator_sticky'] = overbought.groupby((overbought == 0).cumsum()).cumsum() - \
                                             oversold.groupby((oversold == 0).cumsum()).cumsum()
                                             
        # 40. Mean-Reversion Elasticity
        # How fast price snaps back to VWAP. We'll use SMA as VWAP proxy if volume isn't true VWAP.
        vwap_proxy = (self.df['close'] * self.df['volume']).rolling(20).sum() / (self.df['volume'].rolling(20).sum() + 1e-8)
        dist_to_vwap = np.abs(self.df['close'] - vwap_proxy)
        # Snapback velocity: ROC of the distance
        self.df['psych_mean_rev_elasticity'] = dist_to_vwap.diff(3).fillna(0)
        
        # 41. Turtle Soup Reversal Score (Bidirectional)
        # Sweep 20-bar high/low and massive close in opposite direction
        high_20 = self.df['high'].rolling(20).max().shift(1)
        low_20 = self.df['low'].rolling(20).min().shift(1)
        
        sweep_high = (self.df['high'] > high_20)
        sweep_low = (self.df['low'] < low_20)
        
        bear_engulfing = (self.df['open'] >= self.df['close'].shift(1)) & (self.df['close'] <= self.df['open'].shift(1))
        bull_engulfing = (self.df['open'] <= self.df['close'].shift(1)) & (self.df['close'] >= self.df['open'].shift(1))
        
        turtle_bear = sweep_high & bear_engulfing
        turtle_bull = sweep_low & bull_engulfing
        self.df['psych_turtle_soup_score'] = np.where(turtle_bull, 1, np.where(turtle_bear, -1, 0))
        
        # 42. Retail S/R Touch Count
        # Bounces near rolling 20 max/min
        atr = (self.df['high'] - self.df['low']).rolling(14).mean()
        near_high = np.abs(self.df['high'] - high_20) < (atr * 0.2)
        near_low = np.abs(self.df['low'] - low_20) < (atr * 0.2)
        self.df['psych_retail_sr_touches'] = near_high.rolling(20).sum() + near_low.rolling(20).sum()
        
        # 43. Breakout Volume Deficit (Bidirectional)
        # Price breaks 20-high/low but volume is < average
        avg_vol = self.df['volume'].rolling(20).mean()
        break_high_deficit = sweep_high & (self.df['volume'] < avg_vol)
        break_low_deficit = sweep_low & (self.df['volume'] < avg_vol)
        self.df['psych_breakout_vol_deficit'] = np.where(break_high_deficit, -1, np.where(break_low_deficit, 1, 0))
        
        # 44. V-Shape Recovery Improbability (Bidirectional)
        # Deep drop followed by immediate spike, or huge spike followed by immediate drop
        drop_past = self.df['close'].shift(3) - self.df['close'].shift(6)
        rise_now = self.df['close'] - self.df['close'].shift(3)
        
        v_shape_bull = (drop_past < -atr*2) & (rise_now > atr*2)
        v_shape_bear = (drop_past > atr*2) & (rise_now < -atr*2)
        self.df['psych_v_shape_improb'] = np.where(v_shape_bull, 1, np.where(v_shape_bear, -1, 0))
        
        # 45. Friday Close Capitulation & 46. Monday Open Correction
        # Since we don't assume datetime index, we will use general proxy metrics.
        # Proxy 45: Extreme directional move in last 5 bars of a 100 bar window.
        recent_ret = self.df['close'].pct_change(5).abs()
        self.df['psych_friday_close_capitulation'] = np.where(recent_ret > recent_ret.rolling(100).mean() * 3, 1, 0)
        
        # Proxy 46: Massive gap followed by immediate fill
        gap = self.df['open'] - self.df['close'].shift(1)
        fill = np.sign(gap) != np.sign(self.df['close'] - self.df['open'])
        self.df['psych_monday_open_correction'] = np.where((np.abs(gap) > atr) & fill, 1, 0)
