import pandas as pd
import numpy as np
from numba import njit
from typing import List
import logging

logger = logging.getLogger(__name__)

@njit
def calculate_ohlc_morphology(open_p: np.ndarray, high_p: np.ndarray, low_p: np.ndarray, close_p: np.ndarray):
    """
    Computes basic OHLC shape morphologies (Metrics 1-8).
    """
    n = len(close_p)
    body = np.abs(close_p - open_p)
    spread = high_p - low_p
    
    upper_wick = np.maximum(open_p, close_p)
    upper_wick_len = high_p - upper_wick
    
    lower_wick = np.minimum(open_p, close_p)
    lower_wick_len = lower_wick - low_p
    
    # 1. Lower Wick Absorption Ratio
    # 2. Upper Wick Distribution Proxy
    lwa_ratio = np.zeros(n)
    uwd_proxy = np.zeros(n)
    
    # 3. Wick-to-Wick Asymmetry
    wwa = np.zeros(n)
    
    # 5. Body-to-Spread Ratio (Doji-Marubozu)
    body_spread_ratio = np.zeros(n)
    
    for i in range(n):
        s = spread[i]
        if s > 0:
            lwa_ratio[i] = lower_wick_len[i] / s
            uwd_proxy[i] = upper_wick_len[i] / s
            body_spread_ratio[i] = body[i] / s
            
            # WWA: positive means upper wick dominates, negative means lower wick dominates
            tot_wick = upper_wick_len[i] + lower_wick_len[i]
            if tot_wick > 0:
                wwa[i] = (upper_wick_len[i] - lower_wick_len[i]) / tot_wick
                
    return lwa_ratio, uwd_proxy, wwa, body_spread_ratio

@njit
def calculate_sequential_compression(body: np.ndarray, window: int = 5):
    """
    Computes Volatility Contraction Index (Metrics 7, 30).
    Checks if bodies are getting sequentially smaller over the window.
    """
    n = len(body)
    compression = np.zeros(n)
    for i in range(window, n):
        is_compressing = 1.0
        for j in range(1, window):
            if body[i - j + 1] >= body[i - j]:
                is_compressing = 0.0
                break
        compression[i] = is_compressing
    return compression

class CandlePsychologyEngine:
    @staticmethod
    def compute_psychology_features(df: pd.DataFrame, requested_features: List[str]) -> pd.DataFrame:
        """
        Computes up to 30 Candlestick Morphology & Psychology features.
        Assumes df is standard OHLCV. 
        If 1-second data is provided, intra-candle features can be calculated by grouping.
        """
        if df.empty or not requested_features:
            return df
            
        out = pd.DataFrame(index=df.index)
        
        # Ensure standard columns exist
        for col in ['Open', 'High', 'Low', 'Close', 'Volume']:
            if col not in df.columns:
                return df # Cannot compute without OHLCV
                
        op = df['Open'].values
        hp = df['High'].values
        lp = df['Low'].values
        cp = df['Close'].values
        vol = df['Volume'].values
        
        body = np.abs(cp - op)
        spread = hp - lp
        
        # ── 1. Basic Shape Morphologies (Numba optimized) ──
        if any(f in requested_features for f in ['lower_wick_absorption_ratio', 'upper_wick_distribution_proxy', 'wick_to_wick_asymmetry', 'body_to_spread_ratio']):
            lwa, uwd, wwa, bsr = calculate_ohlc_morphology(op, hp, lp, cp)
            if 'lower_wick_absorption_ratio' in requested_features: out['lower_wick_absorption_ratio'] = lwa
            if 'upper_wick_distribution_proxy' in requested_features: out['upper_wick_distribution_proxy'] = uwd
            if 'wick_to_wick_asymmetry' in requested_features: out['wick_to_wick_asymmetry'] = wwa
            if 'body_to_spread_ratio' in requested_features: out['body_to_spread_ratio'] = bsr
            
        # ── 2. Sequential & Relative Morphologies ──
        if 'real_body_shift_rate' in requested_features:
            out['real_body_shift_rate'] = pd.Series(body).pct_change().fillna(0).values
            
        if 'volatility_contraction_index' in requested_features or 'sequential_body_compression' in requested_features:
            comp = calculate_sequential_compression(body, window=3)
            if 'volatility_contraction_index' in requested_features: out['volatility_contraction_index'] = comp
            if 'sequential_body_compression' in requested_features: out['sequential_body_compression'] = calculate_sequential_compression(body, window=5)

        if 'micro_gap_velocity' in requested_features:
            out['micro_gap_velocity'] = (op - pd.Series(cp).shift(1).fillna(pd.Series(op))).values
            
        if 'runaway_gap_probability' in requested_features:
            gap = op - pd.Series(cp).shift(1).fillna(pd.Series(op))
            out['runaway_gap_probability'] = np.where((gap > 0) & (lp > pd.Series(hp).shift(1)), 1.0, 0.0)

        # ── 3. Climax & Exhaustion ──
        if 'climax_volume_reversal' in requested_features:
            vol_ma = pd.Series(vol).rolling(20, min_periods=1).mean()
            vol_spike = (vol / (vol_ma + 1e-9)) > 3.0
            is_doji = (body / (spread + 1e-9)) < 0.1
            out['climax_volume_reversal'] = (vol_spike & is_doji).astype(float).values

        if 'effort_vs_result_divergence' in requested_features:
            vol_z = (pd.Series(vol) - pd.Series(vol).rolling(20).mean()) / (pd.Series(vol).rolling(20).std() + 1e-9)
            body_z = (pd.Series(body) - pd.Series(body).rolling(20).mean()) / (pd.Series(body).rolling(20).std() + 1e-9)
            # High effort (vol), low result (body)
            out['effort_vs_result_divergence'] = (vol_z - body_z).fillna(0).values

        if 'volume_profile_shift' in requested_features:
            # Proxy: if close > (open+close)/2, most volume likely traded lower (buying pressure)
            mid = (op + cp) / 2
            out['volume_profile_shift'] = np.where(cp > mid, vol * 1.0, vol * -1.0)
            
        # ── 4. Pattern Vectorization ──
        if 'engulfing_momentum_float' in requested_features:
            prev_body = pd.Series(body).shift(1).fillna(0).values
            out['engulfing_momentum_float'] = np.where(prev_body > 0, body / (prev_body + 1e-9), 0.0)
            
        if 'morning_star_probability' in requested_features:
            # Simplified proxy: large bear, doji, large bull
            is_bear1 = (pd.Series(cp).shift(2) < pd.Series(op).shift(2)).values
            is_doji2 = ((pd.Series(body).shift(1) / (pd.Series(spread).shift(1) + 1e-9)) < 0.2).values
            is_bull3 = (cp > op)
            out['morning_star_probability'] = (is_bear1 & is_doji2 & is_bull3).astype(float)
            
        if 'fomo_intensity_index' in requested_features:
            # 3 consecutive up candles
            up = (cp > op).astype(int)
            out['fomo_intensity_index'] = (pd.Series(up).rolling(3).sum() == 3).astype(float).values

        if 'harami_squeeze_breakout' in requested_features:
            prev_high = pd.Series(hp).shift(1).fillna(0).values
            prev_low = pd.Series(lp).shift(1).fillna(0).values
            is_inside = (hp < prev_high) & (lp > prev_low)
            out['harami_squeeze_breakout'] = is_inside.astype(float)

        # ── 5. Fractal & Geometry ──
        if 'candle_center_of_gravity' in requested_features:
            body_mid = (op + cp) / 2
            spread_mid = (hp + lp) / 2
            out['candle_center_of_gravity'] = np.where(spread > 0, (body_mid - spread_mid) / (spread + 1e-9), 0.0)
            
        if 'shadow_overlap_ratio' in requested_features:
            prev_high = pd.Series(hp).shift(1).fillna(0).values
            prev_low = pd.Series(lp).shift(1).fillna(0).values
            overlap = np.maximum(0, np.minimum(hp, prev_high) - np.maximum(lp, prev_low))
            out['shadow_overlap_ratio'] = np.where(spread > 0, overlap / (spread + 1e-9), 0.0)

        if 'fractal_wick_divergence' in requested_features:
            # Sweeping higher but wicks getting shorter
            higher_high = hp > pd.Series(hp).shift(1).fillna(pd.Series(hp))
            upper_wick = hp - np.maximum(op, cp)
            prev_uw = pd.Series(upper_wick).shift(1).fillna(0).values
            out['fractal_wick_divergence'] = (higher_high & (upper_wick < prev_uw)).astype(float)

        if 'shooting_star_composite' in requested_features:
            # Small body at bottom, long upper wick
            upper_wick = hp - np.maximum(op, cp)
            lower_wick = np.minimum(op, cp) - lp
            is_star = (upper_wick > 2 * body) & (lower_wick < body)
            out['shooting_star_composite'] = is_star.astype(float)

        if 'mean_reversion_stretch' in requested_features:
            ma10 = pd.Series(cp).rolling(10).mean()
            atr = pd.Series(spread).rolling(10).mean()
            out['mean_reversion_stretch'] = ((cp - ma10) / (atr + 1e-9)).fillna(0).values

        if 'shadow_box_imbalance' in requested_features:
            # Proxy: Assuming volume is distributed uniformly, find imbalance
            out['shadow_box_imbalance'] = ((hp - np.maximum(op, cp)) - (np.minimum(op, cp) - lp)) / (spread + 1e-9)

        if 'tweezer_alignment_proxy' in requested_features:
            prev_high = pd.Series(hp).shift(1).fillna(0).values
            prev_low = pd.Series(lp).shift(1).fillna(0).values
            tweezer_top = np.abs(hp - prev_high) < (spread * 0.05)
            tweezer_bot = np.abs(lp - prev_low) < (spread * 0.05)
            out['tweezer_alignment_proxy'] = (tweezer_top | tweezer_bot).astype(float)

        # ── 6. Intra-Candle Proximities (Using 1s aggregation rules if applicable) ──
        # Since live engine aggregates ticks into 1-second bins, 
        # true intra-candle metrics require rolling 60s windows if df is 1s resolution.
        # Here we provide heuristic fallback proxies if df is 1m resolution.
        
        is_1s_res = False
        if len(df) > 1:
            diff = (df.index[1] - df.index[0]).total_seconds()
            if diff <= 2.0:
                is_1s_res = True
                
        if is_1s_res:
            # We have 1-second data, we can calculate true intra-candle speed
            if 'candle_creation_velocity' in requested_features:
                out['candle_creation_velocity'] = pd.Series(spread).rolling(60).sum().values
            if 'intra_candle_trend' in requested_features:
                out['intra_candle_trend'] = pd.Series(cp - op).rolling(60).sum().values
            if 'last_second_spike_ratio' in requested_features:
                vol_60s = pd.Series(vol).rolling(60).sum()
                out['last_second_spike_ratio'] = (vol / (vol_60s + 1e-9)).fillna(0).values
            if 'intra_candle_delta_shift' in requested_features:
                out['intra_candle_delta_shift'] = pd.Series(cp - op).rolling(60).std().fillna(0).values
            if 'trade_velocity_skewness' in requested_features:
                out['trade_velocity_skewness'] = pd.Series(vol).rolling(60).skew().fillna(0).values
            if 'tick_density_ratio' in requested_features:
                out['tick_density_ratio'] = pd.Series(vol / (body + 1e-9)).rolling(60).mean().fillna(0).values
            if 'time_at_extremes' in requested_features:
                # Time spent near rolling 60s high
                r_high = pd.Series(hp).rolling(60).max()
                near_high = (hp > r_high * 0.999).astype(float)
                out['time_at_extremes'] = near_high.rolling(60).sum().fillna(0).values
        else:
            # Fallback proxies for 1-minute data
            for f in ['candle_creation_velocity', 'intra_candle_trend', 'last_second_spike_ratio', 
                     'intra_candle_delta_shift', 'trade_velocity_skewness', 'tick_density_ratio', 'time_at_extremes']:
                if f in requested_features:
                    out[f] = 0.0 # Requires 1s data to be accurate

        # Merge new features into original df
        for col in out.columns:
            if col not in df.columns:
                df[col] = out[col]

        return df
