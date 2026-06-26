import pandas as pd
import numpy as np
import time
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))
from app.services.feature_engines.candle_psychology import CandlePsychologyEngine

def generate_mock_data_1s():
    # Generate 14400 seconds (4 hours) of 1s mock data
    dates = pd.date_range(start="2026-06-25 00:00:00", periods=14400, freq="s", tz="UTC")
    
    np.random.seed(42)
    closes = np.cumsum(np.random.randn(14400) * 2) + 50000
    opens = closes - np.random.randn(14400) * 1.5
    highs = np.maximum(opens, closes) + np.random.rand(14400) * 5
    lows = np.minimum(opens, closes) - np.random.rand(14400) * 5
    volumes = np.random.rand(14400) * 10
    
    df = pd.DataFrame({
        'Open': opens,
        'High': highs,
        'Low': lows,
        'Close': closes,
        'Volume': volumes
    }, index=dates)
    
    return df

def test_candle_psychology():
    df = generate_mock_data_1s()
    print(f"Mock 1s Data Generated: {len(df)} rows")
    
    requested_features = [
        'lower_wick_absorption_ratio', 'upper_wick_distribution_proxy', 'wick_to_wick_asymmetry',
        'tweezer_alignment_proxy', 'body_to_spread_ratio', 'real_body_shift_rate',
        'volatility_contraction_index', 'micro_gap_velocity', 'climax_volume_reversal',
        'effort_vs_result_divergence', 'volume_profile_shift', 'engulfing_momentum_float',
        'morning_star_probability', 'fomo_intensity_index', 'harami_squeeze_breakout',
        'candle_creation_velocity', 'intra_candle_trend', 'last_second_spike_ratio',
        'candle_center_of_gravity', 'shadow_overlap_ratio', 'fractal_wick_divergence',
        'intra_candle_delta_shift', 'trade_velocity_skewness', 'tick_density_ratio',
        'time_at_extremes', 'runaway_gap_probability', 'shooting_star_composite',
        'mean_reversion_stretch', 'shadow_box_imbalance', 'sequential_body_compression'
    ]
    
    print("\n--- Running CandlePsychologyEngine ---")
    start_t = time.time()
    result_df = CandlePsychologyEngine.compute_psychology_features(df, requested_features)
    end_t = time.time()
    
    print(f"Computation took {end_t - start_t:.4f} seconds for {len(df)} rows (1-second tick proxy).")
    
    print("\n--- Verification Results ---")
    missing = []
    for f in requested_features:
        if f in result_df.columns:
            null_count = result_df[f].isnull().sum()
            non_zero_count = (result_df[f] != 0).sum()
            status = "[OK]" if null_count == 0 else "[WARN Nulls]"
            print(f"{status} {f:30s} | Non-Zeros: {non_zero_count}")
        else:
            print(f"[FAIL] {f:30s} | MISSING from DataFrame!")
            missing.append(f)
            
    if not missing:
        print("\n[SUCCESS] All 30 metrics calculated successfully!")

if __name__ == "__main__":
    test_candle_psychology()
