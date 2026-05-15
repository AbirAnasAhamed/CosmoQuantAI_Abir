import pandas as pd
import numpy as np
import logging

logger = logging.getLogger(__name__)

def calculate_plp_features(df: pd.DataFrame, selected_features: list) -> pd.DataFrame:
    """
    Calculates the 50 Predatory Liquidity Pipeline (PLP) features.
    Since we lack raw liquidation/OI data, this uses synthetic proxy calculations
    based on orderbook microstructure, extreme volume spikes, and high-frequency volatility.
    
    Args:
        df: DataFrame containing trade and L2 features.
        selected_features: List of PLP feature IDs requested by the user.
    """
    if df.empty or not selected_features:
        return df
        
    df = df.copy()
    
    # ── Ensure basic columns exist for calculation ──
    if 'Close' not in df.columns:
        if 'microprice' in df.columns:
            df['Close'] = df['microprice']
        elif 'price' in df.columns:
            df['Close'] = df['price']
        else:
            return df # Cannot calculate without price
            
    close = df['Close']
    
    # Try to get volume metrics, else fallback to 1.0 (to avoid division by zero)
    qty = df['qty'] if 'qty' in df.columns else pd.Series(1.0, index=df.index)
    
    # Try to get spread, else 0.0001
    spread = df['spread'] if 'spread' in df.columns else pd.Series(0.0001, index=df.index)
    
    # Try to get Order Book Imbalance (obi), else 0
    obi = df['obi'] if 'obi' in df.columns else pd.Series(0.0, index=df.index)
    
    # Rolling Volume averages for spikes
    vol_mean_20 = qty.rolling(window=20, min_periods=1).mean()
    vol_std_20 = qty.rolling(window=20, min_periods=1).std().fillna(1e-9)
    
    # Rolling Price metrics
    price_mean_20 = close.rolling(window=20, min_periods=1).mean()
    price_std_20 = close.rolling(window=20, min_periods=1).std().fillna(1e-9)
    returns = close.pct_change().fillna(0)
    
    # Rolling Spread metrics
    spread_mean = spread.rolling(20, min_periods=1).mean()
    spread_std = spread.rolling(20, min_periods=1).std().fillna(1e-9)
    
    # ─────────────────────────────────────────────────────────────────────────
    # MODULE 1: Liquidity Cluster & Density Module
    # ─────────────────────────────────────────────────────────────────────────
    
    if 'abs_long_liq_pool' in selected_features:
        # Proxy: Accumulate volume on down-ticks (trapped longs)
        down_vol = qty.where(returns < 0, 0.0)
        df['abs_long_liq_pool'] = down_vol.rolling(50, min_periods=1).sum()

    if 'abs_short_liq_pool' in selected_features:
        # Proxy: Accumulate volume on up-ticks (trapped shorts)
        up_vol = qty.where(returns > 0, 0.0)
        df['abs_short_liq_pool'] = up_vol.rolling(50, min_periods=1).sum()
        
    if 'liquidation_density_z_score' in selected_features:
        # Proxy: Sharp price move + High volume spike
        vol_z = (qty - vol_mean_20) / (vol_std_20 + 1e-9)
        ret_z = (returns - returns.rolling(20, min_periods=1).mean()) / (returns.rolling(20, min_periods=1).std() + 1e-9)
        df['liquidation_density_z_score'] = (vol_z.clip(lower=0) * ret_z.abs()).fillna(0)
        
    if 'leverage_washout_z_score' in selected_features:
        # Proxy: Sudden spread widening + volume
        spread_z = (spread - spread_mean) / (spread_std + 1e-9)
        df['leverage_washout_z_score'] = spread_z.clip(lower=0) * (qty / (vol_mean_20 + 1e-9))
        
    if 'high_leverage_cluster_proximity' in selected_features:
        # Proxy: Proximity to recent extreme highs/lows (where stops are)
        recent_high = close.rolling(100, min_periods=1).max()
        recent_low = close.rolling(100, min_periods=1).min()
        dist_high = (recent_high - close) / (close + 1e-9)
        dist_low = (close - recent_low) / (close + 1e-9)
        df['high_leverage_cluster_proximity'] = np.minimum(dist_high, dist_low) * 100
        
    if 'margin_call_proximity_index' in selected_features:
        df['margin_call_proximity_index'] = returns.rolling(10, min_periods=1).apply(lambda x: len([i for i in x if i < -0.005]), raw=True).fillna(0) / 10.0

    if 'magnetic_liquidity_pull_vector' in selected_features:
        df['magnetic_liquidity_pull_vector'] = obi * spread * 100

    if 'liq_cluster_density_heatmap' in selected_features:
        df['liq_cluster_density_heatmap'] = (qty / (vol_mean_20 + 1e-9)).rolling(10).mean().fillna(0)
        
    if 'synthetic_leverage_ratio' in selected_features:
        df['synthetic_leverage_ratio'] = price_std_20 / (spread + 1e-9)
        
    if 'hidden_liquidity_absorption' in selected_features:
        # High volume but low price movement
        df['hidden_liquidity_absorption'] = (qty / (vol_mean_20 + 1e-9)) / (returns.abs() + 1e-9)

    if 'stale_liquidity_decay' in selected_features:
        df['stale_liquidity_decay'] = spread.diff().fillna(0).rolling(5).mean()
        
    if 'cross_margin_cascade_risk' in selected_features:
        df['cross_margin_cascade_risk'] = (returns.abs() > price_std_20 * 2).astype(float).rolling(10).sum()


    # ─────────────────────────────────────────────────────────────────────────
    # MODULE 2: Cascade & Trigger Dynamics Module
    # ─────────────────────────────────────────────────────────────────────────
    
    if 'liquidation_cascade_multiplier' in selected_features:
        # Contagion effect
        df['liquidation_cascade_multiplier'] = (returns.abs() / (price_std_20 + 1e-9)).rolling(5).apply(lambda x: np.prod(1 + x), raw=True).fillna(1)
        
    if 'long_squeeze_probability' in selected_features:
        # High positive funding (proxy: continuous upward trend) + sudden drop
        up_trend = (returns > 0).astype(float).rolling(20).mean()
        df['long_squeeze_probability'] = np.where((up_trend > 0.7) & (returns < -0.002), 1.0, 0.0)
        
    if 'short_squeeze_probability' in selected_features:
        down_trend = (returns < 0).astype(float).rolling(20).mean()
        df['short_squeeze_probability'] = np.where((down_trend > 0.7) & (returns > 0.002), 1.0, 0.0)

    if 'cascade_velocity_index' in selected_features:
        df['cascade_velocity_index'] = returns.diff().abs().rolling(5).mean().fillna(0) * 1e4

    if 'domino_effect_threshold' in selected_features:
        df['domino_effect_threshold'] = (qty > vol_mean_20 * 3).astype(float).rolling(3).sum()

    if 'cascade_decay_rate' in selected_features:
        df['cascade_decay_rate'] = vol_mean_20.diff().fillna(0) / (vol_mean_20 + 1e-9)

    if 'forced_liquidation_trigger_pts' in selected_features:
        df['forced_liquidation_trigger_pts'] = np.where(returns.abs() > price_std_20 * 3, 1.0, 0.0)

    if 'volatility_expansion_on_liq' in selected_features:
        df['volatility_expansion_on_liq'] = price_std_20 / (price_std_20.shift(10) + 1e-9)

    if 'squeeze_exhaustion_metric' in selected_features:
        # High volume on peak price = exhaustion
        df['squeeze_exhaustion_metric'] = (qty / (vol_mean_20 + 1e-9)) * np.where(close == close.rolling(20).max(), 1.0, 0.0)

    if 'liquidator_bot_activity_proxy' in selected_features:
        # High frequency of trades with 0 spread change
        df['liquidator_bot_activity_proxy'] = (spread.diff() == 0).astype(float).rolling(10).mean()


    # ─────────────────────────────────────────────────────────────────────────
    # MODULE 3: Stop-Hunt & Sweep Mechanism
    # ─────────────────────────────────────────────────────────────────────────

    if 'stop_hunt_probability' in selected_features:
        # Wick breaking recent low/high and immediately reversing
        df['stop_hunt_probability'] = np.where(
            (returns.abs() > price_std_20 * 1.5) & (returns * returns.shift(-1) < 0), 1.0, 0.0
        ).astype(float)

    if 'liquidity_sweep_velocity' in selected_features:
        df['liquidity_sweep_velocity'] = (returns.abs() / (spread + 1e-9)).rolling(3).mean().fillna(0)

    if 'fakeout_prob_model' in selected_features:
        df['fakeout_prob_model'] = np.where((qty > vol_mean_20 * 2) & (returns.abs() < price_std_20 * 0.5), 1.0, 0.0)

    if 'sweep_and_reversal_ratio' in selected_features:
        df['sweep_and_reversal_ratio'] = returns.abs() / (returns.rolling(5).sum().abs() + 1e-9)

    if 'stop_loss_trigger_density' in selected_features:
        df['stop_loss_trigger_density'] = (qty / (vol_mean_20 + 1e-9)) * (spread / (spread.rolling(20).mean() + 1e-9))

    if 'predatory_algo_footprint' in selected_features:
        df['predatory_algo_footprint'] = obi.abs().rolling(5).mean()

    if 'institutional_sweep_divergence' in selected_features:
        # Price makes new high, but OBI is negative
        new_high = close == close.rolling(20).max()
        df['institutional_sweep_divergence'] = np.where(new_high & (obi < 0), 1.0, 0.0)

    if 'retail_trap_indicator' in selected_features:
        df['retail_trap_indicator'] = np.where((returns > price_std_20) & (obi < -0.2), 1.0, 0.0)

    if 'high_frequency_hunt_ratio' in selected_features:
        df['high_frequency_hunt_ratio'] = (spread.rolling(5).std() / (spread_mean + 1e-9)).fillna(0)

    if 'sweep_efficiency_score' in selected_features:
        df['sweep_efficiency_score'] = (returns.abs() * qty).rolling(10).mean() / (vol_mean_20 + 1e-9)


    # ─────────────────────────────────────────────────────────────────────────
    # MODULE 4: SMC & Order Flow Matrix
    # ─────────────────────────────────────────────────────────────────────────

    if 'institutional_order_flow_imbalance' in selected_features:
        df['institutional_order_flow_imbalance'] = obi.rolling(20).mean()

    if 'smart_money_accumulation_dist' in selected_features:
        # Price drops slightly, but OBI is highly positive (Accumulation)
        df['smart_money_accumulation_dist'] = np.where((returns < 0) & (obi > 0.5), 1.0, -1.0) * (qty / (vol_mean_20 + 1e-9))

    if 'fvg_liquidity_draw_prob' in selected_features:
        # Proxy for Fair Value Gap logic
        df['fvg_liquidity_draw_prob'] = (returns.abs() > price_std_20 * 2.5).astype(float).rolling(15).max()

    if 'order_block_mitigation_speed' in selected_features:
        df['order_block_mitigation_speed'] = (qty / (vol_mean_20 + 1e-9)).rolling(3).sum()

    if 'time_weighted_vampire_flow' in selected_features:
        df['time_weighted_vampire_flow'] = obi * np.exp(-np.arange(len(obi))[::-1] / 100)

    if 'bms_confirmation_strength' in selected_features:
        # Break of Market Structure
        df['bms_confirmation_strength'] = (returns / (price_std_20 + 1e-9)).abs()

    if 'choch_volatility_multiplier' in selected_features:
        # Change of Character
        df['choch_volatility_multiplier'] = (price_std_20 / (price_std_20.rolling(50).mean() + 1e-9)).fillna(1)

    if 'imbalance_to_volume_ratio' in selected_features:
        df['imbalance_to_volume_ratio'] = obi / (qty + 1e-9)

    if 'sponsor_candle_footprint' in selected_features:
        df['sponsor_candle_footprint'] = np.where(qty > vol_mean_20 * 4, 1.0, 0.0)

    if 'dark_pool_proxy_index' in selected_features:
        # Large trades not moving the price much
        df['dark_pool_proxy_index'] = (qty / (vol_mean_20 + 1e-9)) / (returns.abs() + 1e-9)


    # ─────────────────────────────────────────────────────────────────────────
    # MODULE 5: Margin, Volatility & Risk Evaluation
    # ─────────────────────────────────────────────────────────────────────────

    if 'oi_wipeout_ratio' in selected_features:
        # Proxy: Massive volume spike + extreme return
        df['oi_wipeout_ratio'] = (qty / (vol_mean_20 + 1e-9)) * (returns.abs() / (price_std_20 + 1e-9))

    if 'funding_rate_shift' in selected_features:
        # Proxy: Sustained unidirectional returns reversing
        trend = returns.rolling(50).mean()
        df['funding_rate_shift'] = np.where(trend * returns < 0, 1.0, 0.0)

    if 'funding_rate_shift_pre_liq' in selected_features:
        # Proxy: Sustained unidirectional returns reversing
        trend = returns.rolling(50).mean()
        df['funding_rate_shift_pre_liq'] = np.where(trend * returns < 0, 1.0, 0.0)

    if 'implied_margin_pressure' in selected_features:
        df['implied_margin_pressure'] = (close - close.rolling(100).mean()).abs() / (close.rolling(100).std() + 1e-9)

    if 'vol_skew_liquidation_bias' in selected_features:
        df['vol_skew_liquidation_bias'] = returns.rolling(20).skew().fillna(0)

    if 'bid_ask_spread_blowout' in selected_features:
        df['bid_ask_spread_blowout'] = spread / (spread.rolling(50).mean() + 1e-9)

    if 'flash_crash_probability' in selected_features:
        df['flash_crash_probability'] = np.where((returns < -price_std_20 * 4) & (qty > vol_mean_20 * 3), 1.0, 0.0)

    if 'tail_risk_expansion_index' in selected_features:
        df['tail_risk_expansion_index'] = returns.rolling(50).kurt().fillna(0)

    if 'gamma_squeeze_synthetic' in selected_features:
        df['gamma_squeeze_synthetic'] = (returns.abs() * qty).rolling(10).sum()

    if 'leverage_decay_factor' in selected_features:
        df['leverage_decay_factor'] = spread_std.rolling(10).mean()

    if 'margin_variance_premium' in selected_features:
        df['margin_variance_premium'] = price_std_20 - price_std_20.rolling(50).mean()

    # Clean up NaNs
    plp_df = df[selected_features].replace([np.inf, -np.inf], np.nan).fillna(0)
    
    return plp_df
