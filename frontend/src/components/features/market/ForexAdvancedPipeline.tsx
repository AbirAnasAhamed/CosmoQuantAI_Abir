import React, { useState } from 'react';
import { Activity, Clock, Globe, Terminal, ChevronDown, CheckSquare, Square, Database, Trash2, TrendingUp, BarChart2, Zap, Target, Layers, AlignLeft, Crosshair, Cpu, Waves, FunctionSquare, Network } from 'lucide-react';
import { ForexScraperPanel } from '../../ml/forex/ForexScraperPanel';
import { CustomIndicatorBuilder, CustomIndicator } from './CustomIndicatorBuilder';
import { HybridOhlcvTickPanel } from './HybridOhlcvTickPanel';

export const FOREX_MODULES = [
    {
        id: 'basic_price_action',
        title: 'Basic Price Action',
        icon: AlignLeft,
        description: 'Core candlestick morphology and spreads.',
        source: 'ohlcv',
        features: [
            { id: 'pa_log_returns', name: 'Log Returns' },
            { id: 'pa_price_acceleration', name: 'Price Acceleration (Momentum)' },
            { id: 'pa_frac_diff_proxy', name: 'Fractional Differencing (Proxy)' },
            { id: 'pa_cpr', name: 'Close Position in Range (CPR)' },
            { id: 'pa_upper_wick_ratio', name: 'Upper Wick Ratio' },
            { id: 'pa_lower_wick_ratio', name: 'Lower Wick Ratio' },
            { id: 'pa_body_ratio', name: 'Body to Range Ratio' },
            { id: 'pa_session_gap', name: 'Session Gap (Close to Open)' },
            { id: 'pa_true_range', name: 'True Range (ATR Base)' },
            { id: 'pa_rolling_z_score', name: 'Rolling Price Z-Score' },
            { id: 'pa_hist_volatility', name: 'Historical Volatility' },
            { id: 'pa_consecutive_runs', name: 'Consecutive Runs (Directional)' },
            { id: 'pa_inside_outside', name: 'Inside / Outside Bar State' },
            { id: 'pa_price_vs_median', name: 'Price vs N-Period Median' },
            { id: 'pa_dist_to_support', name: 'Distance to Nearest Support' },
            { id: 'pa_dist_to_resistance', name: 'Distance to Nearest Resistance' },
            { id: 'pa_swing_high_dist', name: 'Swing High Price Distance' },
            { id: 'pa_swing_low_dist', name: 'Swing Low Price Distance' },
            { id: 'pa_price_rejection_score', name: 'Price Rejection Magnitude' },
            { id: 'pa_bars_since_swing_h', name: 'Bars Since Last Swing High' },
            { id: 'pa_bars_since_swing_l', name: 'Bars Since Last Swing Low' },
            { id: 'pa_dist_to_anchor', name: 'Distance to Daily Anchor' },
            { id: 'pa_fractal_dimension', name: 'Fractal Dimension (Choppiness)' },
            { id: 'pa_donchian_pos', name: 'Donchian Channel Position' }
        ]
    },
    {
        id: 'trend_ma',
        title: 'Trend & Moving Averages',
        icon: TrendingUp,
        description: 'Trend identification and moving averages.',
        source: 'ohlcv',
        features: [
            // --- Legacy Retail Metrics (12) ---
            { id: 'sma', name: 'Simple Moving Average (SMA)' },
            { id: 'ema', name: 'Exponential Moving Average (EMA)' },
            { id: 'wma', name: 'Weighted Moving Average (WMA)' },
            { id: 'hma', name: 'Hull Moving Average (HMA)' },
            { id: 'price_to_sma_ratio', name: 'Price to SMA Ratio' },
            { id: 'ma_crossover', name: 'Moving Average Crossover' },
            { id: 'macd_line', name: 'MACD Line' },
            { id: 'macd_signal', name: 'MACD Signal' },
            { id: 'macd_hist', name: 'MACD Histogram' },
            { id: 'parabolic_sar', name: 'Parabolic SAR' },
            { id: 'adx', name: 'ADX (Average Directional Index)' },
            { id: 'supertrend', name: 'Supertrend' },
            
            // --- Advanced Quant Metrics (50) ---
            // Phase 1: Foundation & Distance
            { id: 'trend_dist_ema_9', name: 'Distance to EMA 9' },
            { id: 'trend_dist_ema_21', name: 'Distance to EMA 21' },
            { id: 'trend_dist_ema_50', name: 'Distance to EMA 50' },
            { id: 'trend_dist_ema_200', name: 'Distance to EMA 200' },
            { id: 'trend_dist_vwap', name: 'Distance to VWAP' },
            { id: 'trend_spread_9_21', name: 'EMA Spread (9 vs 21)' },
            { id: 'trend_spread_21_50', name: 'EMA Spread (21 vs 50)' },
            { id: 'trend_spread_50_200', name: 'EMA Spread (50 vs 200)' },
            { id: 'trend_ribbon_expansion_rate', name: 'Ribbon Expansion Rate' },
            { id: 'trend_crossover_intensity', name: 'Crossover Intensity (Force)' },
            
            // Phase 2: Velocity & Acceleration
            { id: 'trend_slope_ema_9', name: 'EMA 9 Slope (Velocity)' },
            { id: 'trend_slope_ema_21', name: 'EMA 21 Slope (Velocity)' },
            { id: 'trend_slope_ema_50', name: 'EMA 50 Slope (Velocity)' },
            { id: 'trend_accel_ema_21', name: 'EMA 21 Acceleration' },
            { id: 'trend_curvature_macd', name: 'MACD Histogram Curvature' },
            
            // Phase 3: DSP & Adaptive Filters
            { id: 'trend_kama_efficiency', name: 'Kaufman Efficiency Ratio (KAMA)' },
            { id: 'trend_hma_inflection', name: 'Hull MA (HMA) Inflection' },
            { id: 'trend_alma_dist', name: 'Distance to ALMA' },
            { id: 'trend_super_smoother_dist', name: 'Super Smoother Filter Distance' },
            { id: 'trend_super_smoother_slope', name: 'Super Smoother Slope' },
            { id: 'trend_jurik_proxy_dist', name: 'Jurik MA Proxy Distance' },
            { id: 'trend_jurik_proxy_slope', name: 'Jurik MA Proxy Slope' },
            { id: 'trend_kalman_error_proxy', name: 'Kalman Filter Error Proxy' },
            { id: 'trend_kalman_velocity_proxy', name: 'Kalman State Velocity' },
            { id: 'trend_butterworth_dist_proxy', name: 'Butterworth Filter Distance' },
            { id: 'trend_fram_divergence_proxy', name: 'FRAM Divergence Proxy' },
            
            // Phase 4: Volatility, Volume & Regression
            { id: 'trend_choppiness_index', name: 'Choppiness Index' },
            { id: 'trend_polarized_fractal_eff', name: 'Polarized Fractal Efficiency (PFE)' },
            { id: 'trend_vidya_dist', name: 'Distance to VIDYA (Vol Adjusted)' },
            { id: 'trend_keltner_center_dist', name: 'Keltner Channel Center Distance' },
            { id: 'trend_tii_score', name: 'Trend Intensity Index (TII)' },
            { id: 'trend_vwmacd_hist', name: 'Volume Weighted MACD Histogram' },
            { id: 'trend_vwmacd_signal_dist', name: 'VWMACD Signal Distance' },
            { id: 'trend_mvwap_dist', name: 'Distance to Moving VWAP' },
            { id: 'trend_pvts_slope', name: 'Price Volume Trend (PVT) Slope' },
            { id: 'trend_volume_adjusted_ema_dist', name: 'Volume Adjusted EMA Distance' },
            { id: 'trend_linreg_dist', name: 'Distance to Linear Regression' },
            { id: 'trend_linreg_slope', name: 'Linear Regression Slope' },
            { id: 'trend_linreg_error', name: 'Linear Regression Error' },
            { id: 'trend_linreg_r2', name: 'Linear Regression R-Squared' },
            { id: 'trend_polynomial_reg_dist_proxy', name: 'Polynomial Regression Distance' },
            { id: 'trend_tsf_dist_proxy', name: 'Time Series Forecast Distance' },
            { id: 'trend_lsma_dist_proxy', name: 'Least Squares MA Distance' },
            { id: 'trend_linreg_angle', name: 'Linear Regression Angle' },
            
            // Phase 5: Macro & Exhaustion
            { id: 'trend_mtf_alignment_score', name: 'MTF Alignment Score' },
            { id: 'trend_adx_derivative', name: 'ADX Derivative (Strength Change)' },
            { id: 'trend_dmi_spread_norm', name: 'DMI Spread (Normalized)' },
            { id: 'trend_ichimoku_kumo_dist', name: 'Distance to Ichimoku Kumo' },
            { id: 'trend_ichimoku_kumo_thickness', name: 'Ichimoku Kumo Thickness' },
            { id: 'trend_aroon_oscillator', name: 'Aroon Oscillator' },
            { id: 'trend_aroon_slope', name: 'Aroon Oscillator Slope' },
            { id: 'trend_schaff_trend_cycle_proxy', name: 'Schaff Trend Cycle (STC) Proxy' }
        ]
    },
    {
        id: 'momentum_osc',
        title: 'Momentum Oscillators',
        icon: Zap,
        description: 'Overbought/Oversold and rate of change.',
        source: 'ohlcv',
        features: [
            // --- Legacy Retail Metrics (9) ---
            { id: 'rsi', name: 'RSI (Relative Strength Index)' },
            { id: 'stoch_k', name: 'Stochastic %K' },
            { id: 'stoch_d', name: 'Stochastic %D' },
            { id: 'williams_r', name: 'Williams %R' },
            { id: 'roc', name: 'Rate of Change (ROC)' },
            { id: 'cci', name: 'Commodity Channel Index (CCI)' },
            { id: 'momentum', name: 'Momentum (MOM)' },
            { id: 'awesome_oscillator', name: 'Awesome Oscillator (AO)' },
            { id: 'tsi', name: 'True Strength Index (TSI)' },
            
            // --- Advanced Quant Metrics (41) ---
            // Phase 1: Core Oscillators & Derivatives
            { id: 'mom_crsi', name: 'Connors RSI Proxy' },
            { id: 'mom_uo', name: 'Ultimate Oscillator' },
            { id: 'mom_cmo', name: 'Chande Momentum Oscillator' },
            { id: 'mom_ppo', name: 'Percentage Price Oscillator' },
            { id: 'mom_rsi_velocity', name: 'RSI Velocity (Speed)' },
            { id: 'mom_rsi_acceleration', name: 'RSI Acceleration' },
            { id: 'mom_stoch_velocity', name: 'Stochastic Velocity' },
            { id: 'mom_cci_velocity', name: 'CCI Velocity' },
            { id: 'mom_roc_accel', name: 'ROC Acceleration' },
            { id: 'mom_macd_norm', name: 'MACD Normalized Factor' },
            
            // Phase 2: Divergence Proxies & Gaussian Filters
            { id: 'mom_rsi_div_proxy', name: 'RSI Divergence Proxy' },
            { id: 'mom_stoch_div_proxy', name: 'Stochastic Divergence Proxy' },
            { id: 'mom_macd_div_proxy', name: 'MACD Divergence Proxy' },
            { id: 'mom_fisher_transform', name: 'Fisher Transform' },
            { id: 'mom_cg_oscillator', name: 'Center of Gravity (CG)' },
            { id: 'mom_rvi', name: 'Relative Vigor Index (RVI)' },
            { id: 'mom_trix', name: 'TRIX (Triple EMA ROC)' },
            { id: 'mom_coppock_proxy', name: 'Coppock Curve Proxy' },
            
            // Phase 3: Volume-Weighted & Asymmetric Momentum
            { id: 'mom_mfi', name: 'Money Flow Index (MFI)' },
            { id: 'mom_cmf', name: 'Chaikin Money Flow (CMF)' },
            { id: 'mom_vw_roc', name: 'Volume Weighted ROC' },
            { id: 'mom_elder_bull', name: 'Elder Ray Bull Power' },
            { id: 'mom_elder_bear', name: 'Elder Ray Bear Power' },
            { id: 'mom_qstick', name: 'QStick Indicator' },
            { id: 'mom_chande_kroll_proxy', name: 'Chande Kroll Stop Proxy' },
            
            // Phase 4: MTF & DSP Smoothed Momentum
            { id: 'mom_kst', name: 'Know Sure Thing (KST)' },
            { id: 'mom_kst_signal', name: 'KST Signal Line' },
            { id: 'mom_ehlers_rsi', name: 'Ehlers Smoothed RSI Proxy' },
            { id: 'mom_dss_bressert', name: 'DSS Bressert Proxy' },
            { id: 'mom_fractal_energy', name: 'Momentum Fractal Energy' },
            { id: 'mom_inertia', name: 'Inertia Indicator' },
            { id: 'mom_stoch_rsi_k', name: 'StochRSI %K' },
            { id: 'mom_stoch_rsi_d', name: 'StochRSI %D' },
            
            // Phase 5: Statistical Extremes
            { id: 'mom_rsi_skewness', name: 'RSI Skewness' },
            { id: 'mom_rsi_kurtosis', name: 'RSI Kurtosis (Black Swan)' },
            { id: 'mom_williams_z_score', name: 'Williams %R Z-Score' },
            { id: 'mom_roc_accel_spread', name: 'ROC Accel Spread' },
            { id: 'mom_tsi_signal', name: 'TSI Signal Line' },
            { id: 'mom_stoch_rsi_div', name: 'StochRSI Divergence Proxy' },
            { id: 'mom_rsi_z_score', name: 'RSI Z-Score' },
            { id: 'mom_cci_z_score', name: 'CCI Z-Score' }
        ]
    },
    {
        id: 'volatility_ind',
        title: 'Volatility Indicators',
        icon: Target,
        description: 'Market volatility and standard deviation bands.',
        source: 'ohlcv',
        features: [
            // Phase 0: Legacy Retail Metrics (12)
            { id: 'true_range', name: 'True Range (TR)' },
            { id: 'atr', name: 'Average True Range (ATR)' },
            { id: 'bb_upper', name: 'Bollinger Bands Upper' },
            { id: 'bb_lower', name: 'Bollinger Bands Lower' },
            { id: 'bb_width', name: 'Bollinger Bands Width' },
            { id: 'bb_pct_b', name: 'Bollinger %B' },
            { id: 'keltner_upper', name: 'Keltner Channel Upper' },
            { id: 'keltner_lower', name: 'Keltner Channel Lower' },
            { id: 'donchian_upper', name: 'Donchian Channel Upper' },
            { id: 'donchian_lower', name: 'Donchian Channel Lower' },
            { id: 'historical_volatility', name: 'Historical Volatility' },
            { id: 'choppiness_index', name: 'Choppiness Index' },
            
            // Phase 1: Stationary Band Distances (11)
            { id: 'vol_bb_upper_dist', name: 'BB Upper Distance' },
            { id: 'vol_bb_lower_dist', name: 'BB Lower Distance' },
            { id: 'vol_bb_pct_b_z_score', name: 'Bollinger %B Z-Score' },
            { id: 'vol_kc_upper_dist', name: 'Keltner Upper Distance' },
            { id: 'vol_kc_lower_dist', name: 'Keltner Lower Distance' },
            { id: 'vol_kc_mid_dist', name: 'Keltner Mid Distance' },
            { id: 'vol_dc_upper_dist', name: 'Donchian Upper Distance' },
            { id: 'vol_dc_lower_dist', name: 'Donchian Lower Distance' },
            { id: 'vol_dc_width_roc', name: 'Donchian Width Expansion Rate' },
            { id: 'vol_accband_upper_dist', name: 'Acceleration Bands Upper Dist' },
            { id: 'vol_accband_lower_dist', name: 'Acceleration Bands Lower Dist' },
            
            // Phase 2: ATR & True Range Derivatives (5)
            { id: 'vol_atr_velocity', name: 'ATR Velocity' },
            { id: 'vol_atr_acceleration', name: 'ATR Acceleration' },
            { id: 'vol_atr_ratio_14_50', name: 'ATR Ratio (14/50)' },
            { id: 'vol_natr', name: 'Normalized ATR (NATR)' },
            { id: 'vol_tr_z_score', name: 'True Range Z-Score' },
            
            // Phase 3: Squeeze & Standard Deviation Dynamics (5)
            { id: 'vol_bb_kc_squeeze_ratio', name: 'BB/KC Squeeze Ratio' },
            { id: 'vol_squeeze_momentum', name: 'Squeeze Momentum' },
            { id: 'vol_dc_width_z_score', name: 'Donchian Width Z-Score' },
            { id: 'vol_std_dev_velocity', name: 'StdDev Velocity' },
            { id: 'vol_std_dev_acceleration', name: 'StdDev Acceleration' },
            
            // Phase 4: Advanced Hedge-Fund Estimators (8)
            { id: 'vol_yang_zhang', name: 'Yang-Zhang Volatility' },
            { id: 'vol_garman_klass', name: 'Garman-Klass Volatility' },
            { id: 'vol_parkinson', name: 'Parkinson Volatility' },
            { id: 'vol_hodges_tompkins', name: 'Hodges-Tompkins Volatility' },
            { id: 'vol_ulcer_index', name: 'Ulcer Index' },
            { id: 'vol_mass_index', name: 'Mass Index' },
            { id: 'vol_rvi_volatility', name: 'Relative Volatility Index (RVI)' },
            { id: 'vol_hv_ratio_10_30', name: 'Historical Volatility Ratio (10/30)' },
            
            // Phase 5: Vortex & Statistical Extremes (7)
            { id: 'vol_vortex_pos', name: 'Vortex Indicator (+VI)' },
            { id: 'vol_vortex_neg', name: 'Vortex Indicator (-VI)' },
            { id: 'vol_vortex_diff', name: 'Vortex Directional Difference' },
            { id: 'vol_atr_skewness', name: 'ATR Skewness' },
            { id: 'vol_atr_kurtosis', name: 'ATR Kurtosis' },
            { id: 'vol_chandelier_long_dist', name: 'Chandelier Exit Long Dist' },
            { id: 'vol_chandelier_short_dist', name: 'Chandelier Exit Short Dist' },
            
            // Phase 6: MTF & DSP Envelopes (8)
            { id: 'vol_mtf_atr_proxy', name: 'MTF ATR Proxy' },
            { id: 'vol_hw_channel_upper_dist', name: 'Holt-Winter Upper Dist' },
            { id: 'vol_hw_channel_lower_dist', name: 'Holt-Winter Lower Dist' },
            { id: 'vol_hw_channel_width', name: 'Holt-Winter Width' },
            { id: 'vol_starbands_upper_dist', name: 'STARC Bands Upper Dist' },
            { id: 'vol_starbands_lower_dist', name: 'STARC Bands Lower Dist' },
            { id: 'vol_kama_atr_upper_dist', name: 'KAMA-ATR Upper Dist' },
            { id: 'vol_kama_atr_lower_dist', name: 'KAMA-ATR Lower Dist' },
            
            // Phase 7: Asymmetric Volatility (6)
            { id: 'vol_up_day_tr', name: 'Up-Day True Range' },
            { id: 'vol_down_day_tr', name: 'Down-Day True Range' },
            { id: 'vol_tr_asymmetry_ratio', name: 'TR Asymmetry Ratio' },
            { id: 'vol_std_dev_up', name: 'Positive Return StdDev' },
            { id: 'vol_std_dev_down', name: 'Negative Return StdDev' },
            { id: 'vol_std_dev_asymmetry', name: 'StdDev Asymmetry Difference' },
            
            // Phase 8: High-Low Spread & DSP (12)
            { id: 'vol_fractal_dimension_proxy', name: 'Fractal Dimension Proxy' },
            { id: 'vol_choppiness_z_score', name: 'Choppiness Z-Score' },
            { id: 'vol_ehlers_atr', name: 'Ehlers Smoothed ATR' },
            { id: 'vol_std_dev_log', name: 'Log Standard Deviation' },
            { id: 'vol_hl_spread', name: 'High-Low Spread' },
            { id: 'vol_hl_spread_z_score', name: 'High-Low Spread Z-Score' },
            { id: 'vol_open_close_spread', name: 'Open-Close Body Spread' },
            { id: 'vol_body_to_range_ratio', name: 'Body-to-Range Ratio' },
            { id: 'vol_volatility_breakout_proxy', name: 'Volatility Breakout Proxy' },
            { id: 'vol_price_bb_upper_z_score', name: 'Price to BB Upper Z-Score' },
            { id: 'vol_price_bb_lower_z_score', name: 'Price to BB Lower Z-Score' },
            { id: 'vol_price_bb_mid_z_score', name: 'Price to BB Mid Z-Score' }
        ]
    },
    {
        id: 'tick_volume_metrics',
        title: 'Tick Volume Metrics',
        icon: BarChart2,
        description: 'Forex tick volume based indicators.',
        source: 'ohlcv',
        features: [
            // Phase 0: Legacy Retail Metrics (6)
            { id: 'obv', name: 'On-Balance Volume (OBV)' },
            { id: 'volume_sma', name: 'Volume SMA' },
            { id: 'vroc', name: 'Volume Rate of Change (VROC)' },
            { id: 'mfi', name: 'Money Flow Index (MFI)' },
            { id: 'force_index', name: 'Force Index' },
            { id: 'cmf', name: 'Chaikin Money Flow (CMF)' },

            // Phase 1: Volume Momentum & Trend (6)
            { id: 'vol_volume_ema', name: 'Volume EMA' },
            { id: 'vol_volume_oscillator', name: 'Volume Oscillator' },
            { id: 'vol_pvi', name: 'Positive Volume Index (PVI)' },
            { id: 'vol_nvi', name: 'Negative Volume Index (NVI)' },
            { id: 'vol_vpt', name: 'Volume Price Trend (VPT)' },
            { id: 'vol_adi', name: 'Accumulation/Distribution Index (ADI)' },

            // Phase 2: Statistical Volume Anomalies (5)
            { id: 'vol_rel_vol', name: 'Relative Volume (RVOL)' },
            { id: 'vol_volume_z_score', name: 'Volume Z-Score' },
            { id: 'vol_volume_std_dev', name: 'Volume StdDev' },
            { id: 'vol_volume_skewness', name: 'Volume Skewness' },
            { id: 'vol_volume_kurtosis', name: 'Volume Kurtosis' },

            // Phase 3: Demand/Supply & Money Flow (6)
            { id: 'vol_kvo', name: 'Klinger Volume Oscillator (KVO)' },
            { id: 'vol_eom', name: 'Ease of Movement (EOM)' },
            { id: 'vol_vwma', name: 'Volume Weighted Moving Average (VWMA)' },
            { id: 'vol_vwma_dist', name: 'VWMA Distance' },
            { id: 'vol_vwap_proxy', name: 'Rolling VWAP Proxy' },
            { id: 'vol_twap_proxy', name: 'TWAP Proxy' },

            // Phase 4: Directional Volume Asymmetry (5)
            { id: 'vol_up_day_volume', name: 'Up-Day Volume' },
            { id: 'vol_down_day_volume', name: 'Down-Day Volume' },
            { id: 'vol_volume_asymmetry_ratio', name: 'Volume Asymmetry Ratio' },
            { id: 'vol_cvd_proxy', name: 'Cumulative Volume Delta (CVD) Proxy' },
            { id: 'vol_efi_13', name: "Elder's Force Index (Smoothed)" },

            // Phase 5: Price-Volume Divergence (5)
            { id: 'vol_price_vol_trend', name: 'Price vs Volume Trend' },
            { id: 'vol_clv', name: 'Close Location Value (CLV)' },
            { id: 'vol_eff_ratio_vol', name: 'Volume Efficiency Ratio' },
            { id: 'vol_vortex_vol_adjusted', name: 'Volume-Adjusted Vortex' },
            { id: 'vol_pvo', name: 'Percentage Volume Oscillator (PVO)' },

            // Phase 6: Volume Envelopes & Squeeze (6)
            { id: 'vol_volume_bb_upper', name: 'Volume BB Upper' },
            { id: 'vol_volume_bb_lower', name: 'Volume BB Lower' },
            { id: 'vol_volume_bb_width', name: 'Volume BB Width' },
            { id: 'vol_volume_kc_upper', name: 'Volume KC Upper' },
            { id: 'vol_volume_kc_lower', name: 'Volume KC Lower' },
            { id: 'vol_volume_squeeze', name: 'Volume Squeeze Proxy' },

            // Phase 7: Volume-Weighted Advanced Indicators (VWI) (5)
            { id: 'vol_vwmacd', name: 'Volume-Weighted MACD' },
            { id: 'vol_vwmacd_signal', name: 'VWMACD Signal' },
            { id: 'vol_vwmacd_hist', name: 'VWMACD Histogram' },
            { id: 'vol_mfi_stochastic', name: 'Stochastic MFI' },
            { id: 'vol_price_roc_vol_roc_ratio', name: 'Price ROC / Vol ROC Ratio' },

            // Phase 8: Log-Normal Statistical Extremes (9)
            { id: 'vol_log_volume', name: 'Log Volume' },
            { id: 'vol_log_volume_z_score', name: 'Log Volume Z-Score' },
            { id: 'vol_obv_z_score', name: 'OBV Z-Score' },
            { id: 'vol_obv_acceleration', name: 'OBV Acceleration' },
            { id: 'vol_obv_sma_crossover', name: 'OBV / SMA Crossover Dist' },
            { id: 'vol_mfi_z_score', name: 'MFI Z-Score' },
            { id: 'vol_cmf_z_score', name: 'CMF Z-Score' },
            { id: 'vol_cmf_momentum', name: 'CMF Momentum' },
            { id: 'vol_tick_volume_fractal_dimension', name: 'Tick Volume Fractal Dimension' },

            // Phase 9: Buying & Selling Pressure (6)
            { id: 'vol_buying_pressure', name: 'True Buying Pressure' },
            { id: 'vol_selling_pressure', name: 'True Selling Pressure' },
            { id: 'vol_net_pressure_oscillator', name: 'Net Pressure Oscillator' },
            { id: 'vol_volume_roc_10', name: 'Volume ROC (10)' },
            { id: 'vol_volume_roc_20', name: 'Volume ROC (20)' },
            { id: 'vol_mtf_vwap_proxy', name: 'Macro VWAP Proxy' }
        ]
    },
    {
        id: 'statistical_features',
        title: 'Statistical & Time-Series',
        icon: Layers,
        description: 'Distribution tails, skewness, and variance.',
        source: 'ohlcv',
        features: [
            // Phase 0: Legacy Statistical Metrics (3)
            { id: 'rolling_std', name: 'Rolling Standard Deviation' },
            { id: 'rolling_skewness', name: 'Rolling Skewness' },
            { id: 'rolling_kurtosis', name: 'Rolling Kurtosis' },

            // Phase 1: Distribution Moments (5)
            { id: 'stat_rolling_variance', name: 'Rolling Variance' },
            { id: 'stat_rolling_skewness_adj', name: 'Adjusted Skewness' },
            { id: 'stat_rolling_kurtosis_adj', name: 'Adjusted Kurtosis' },
            { id: 'stat_jarque_bera_proxy', name: 'Jarque-Bera Proxy' },
            { id: 'stat_z_score_close', name: 'Close Price Z-Score' },

            // Phase 2: Autocorrelation (5)
            { id: 'stat_autocorr_lag1', name: 'Autocorrelation (Lag 1)' },
            { id: 'stat_autocorr_lag3', name: 'Autocorrelation (Lag 3)' },
            { id: 'stat_autocorr_lag5', name: 'Autocorrelation (Lag 5)' },
            { id: 'stat_autocorr_lag10', name: 'Autocorrelation (Lag 10)' },
            { id: 'stat_ljung_box_q_proxy', name: 'Ljung-Box Q Proxy' },

            // Phase 3: Stationarity & Random Walk Analysis (4)
            { id: 'stat_hurst_exponent', name: 'Hurst Exponent (Proxy)' },
            { id: 'stat_variance_ratio', name: 'Variance Ratio Test' },
            { id: 'stat_adf_statistic_proxy', name: 'ADF Statistic Proxy' },
            { id: 'stat_half_life_mean_reversion', name: 'Mean Reversion Half-Life' },

            // Phase 4: Entropy & Information Theory (3)
            { id: 'stat_shannon_entropy', name: 'Shannon Entropy Proxy' },
            { id: 'stat_approximate_entropy', name: 'Approximate Entropy' },
            { id: 'stat_sample_entropy', name: 'Sample Entropy' },

            // Phase 5: Time-Series Transformation (4)
            { id: 'stat_fractional_differencing_d0_5', name: 'Fractional Differencing (d=0.5)' },
            { id: 'stat_log_returns', name: 'Log Returns' },
            { id: 'stat_cumulative_log_returns', name: 'Cumulative Log Returns' },
            { id: 'stat_log_return_momentum', name: 'Log Return Momentum' },

            // Phase 6: Risk-Adjusted Return Statistics (4)
            { id: 'stat_sharpe_ratio_rolling', name: 'Rolling Sharpe Ratio' },
            { id: 'stat_sortino_ratio_rolling', name: 'Rolling Sortino Ratio' },
            { id: 'stat_calmar_ratio_proxy', name: 'Calmar Ratio Proxy' },
            { id: 'stat_omega_ratio_proxy', name: 'Omega Ratio Proxy' },

            // Phase 7: Linear Regression & Trend Statistics (5)
            { id: 'stat_linear_regression_slope', name: 'Linear Regression Slope' },
            { id: 'stat_linear_regression_intercept', name: 'Linear Regression Intercept' },
            { id: 'stat_r_squared_trend', name: 'Trend R-Squared' },
            { id: 'stat_standard_error', name: 'Standard Error' },
            { id: 'stat_beta_vs_ma', name: 'Beta vs Moving Average' },

            // Phase 8: Tail Risk & Extreme Events (5)
            { id: 'stat_value_at_risk_95', name: 'Value at Risk (95%)' },
            { id: 'stat_expected_shortfall_95', name: 'Expected Shortfall (CVaR)' },
            { id: 'stat_max_drawdown_rolling', name: 'Rolling Max Drawdown' },
            { id: 'stat_drawdown_duration', name: 'Drawdown Duration' },
            { id: 'stat_tail_ratio', name: 'Tail Ratio (Pos/Neg Vol)' },

            // Phase 9: Physics-Based Kinematic Statistics (8)
            { id: 'stat_geometric_mean_return', name: 'Geometric Mean Return' },
            { id: 'stat_harmonic_mean_proxy', name: 'Harmonic Mean Proxy' },
            { id: 'stat_price_velocity', name: 'Price Velocity (1st Deriv)' },
            { id: 'stat_price_acceleration', name: 'Price Acceleration (2nd Deriv)' },
            { id: 'stat_jerk_metric', name: 'Price Jerk (3rd Deriv)' },
            { id: 'stat_snap_metric', name: 'Price Snap (4th Deriv)' },
            { id: 'stat_hurst_derivative', name: 'Hurst Exponent Velocity' },
            { id: 'stat_entropy_velocity', name: 'Entropy Velocity' },

            // Phase 10: Spectral & Frequency Domain (5)
            { id: 'stat_dominant_cycle_period', name: 'Dominant Cycle Period' },
            { id: 'stat_phase_angle', name: 'Cycle Phase Angle' },
            { id: 'stat_signal_to_noise_ratio', name: 'Signal-to-Noise Ratio (SNR)' },
            { id: 'stat_hilbert_transform_sine', name: 'Hilbert Transform (Sine)' },
            { id: 'stat_hilbert_transform_cosine', name: 'Hilbert Transform (Cosine)' },

            // Phase 11: Non-linear Dynamics & Chaos Theory (3)
            { id: 'stat_lyapunov_exponent_proxy', name: 'Lyapunov Exponent Proxy' },
            { id: 'stat_correlation_dimension_proxy', name: 'Correlation Dimension Proxy' },
            { id: 'stat_dfa', name: 'Detrended Fluctuation Analysis' },

            // Phase 12: Probability & Markov Chain Proxies (4)
            { id: 'stat_transition_prob_up_up', name: 'Markov Prob (Up | Up)' },
            { id: 'stat_transition_prob_down_down', name: 'Markov Prob (Down | Down)' },
            { id: 'stat_transition_prob_reversal', name: 'Markov Prob (Reversal)' },
            { id: 'stat_markov_regime_state', name: 'Markov Regime State (Vol)' },

            // Phase 13: Higher Order Return Statistics (3)
            { id: 'stat_autocorr_decay_rate', name: 'Autocorrelation Decay Rate' },
            { id: 'stat_partial_autocorr_lag1', name: 'PACF Proxy (Lag 1)' },
            { id: 'stat_partial_autocorr_lag3', name: 'PACF Proxy (Lag 3)' },

            // Phase 14: Distance & Geometry Metrics (4)
            { id: 'stat_euclidean_distance_rolling', name: 'Rolling Euclidean Distance' },
            { id: 'stat_path_length_rolling', name: 'Rolling Path Length' },
            { id: 'stat_efficiency_ratio_kaufman', name: 'Kaufman Efficiency Ratio' },
            { id: 'stat_center_of_gravity', name: 'Ehlers Center of Gravity' },

            // Phase 15: Cross-Series Correlation & Asymmetric Ratios (8)
            { id: 'stat_covariance_price_volume', name: 'Price-Volume Covariance' },
            { id: 'stat_beta_price_volume', name: 'Price-Volume Beta' },
            { id: 'stat_spearman_rank_corr', name: 'Spearman Rank Correlation' },
            { id: 'stat_kendall_tau_corr', name: 'Kendall Tau Concordance' },
            { id: 'stat_information_ratio_proxy', name: 'Information Ratio Proxy' },
            { id: 'stat_ulcer_index_proxy', name: 'Ulcer Index Proxy' },
            { id: 'stat_pain_index_proxy', name: 'Pain Index Proxy' },
            { id: 'stat_cross_sectional_momentum', name: 'Cross-Sectional Momentum (10 vs 50)' }
        ]
    },
    {
        id: 'smc_order_flow',
        title: '৭. SMC & Market Structure (অ্যাডভান্সড)',
        icon: Activity,
        description: 'Smart Money Concepts and Institutional footprints (74 Advanced Metrics).',
        source: 'ohlcv',
        features: [
            // Legacy Metrics (8)
            { id: 'swing_high_low', name: 'Swing Highs / Lows (Fractal)' },
            { id: 'bos_choch', name: 'Break of Structure (BOS & CHoCH)' },
            { id: 'fvg', name: 'Fair Value Gaps (FVG)' },
            { id: 'order_blocks', name: 'Order Blocks (OB)' },
            { id: 'fvg_liquidity', name: 'FVG Liquidity Draw Probability' },
            { id: 'order_block_mitigation', name: 'Order Block Mitigation Speed' },
            { id: 'retail_sentiment', name: 'Retail Sentiment & OBI Proxy' },
            { id: 'currency_correlation', name: 'Currency Correlation Matrix' },
            
            // Phase 1: Core Market Structure
            { id: 'smc_current_structure_state', name: 'Current Structure State' },
            { id: 'smc_distance_to_last_bos', name: 'Distance to Last BOS' },
            { id: 'smc_time_since_last_bos', name: 'Time Since Last BOS' },
            { id: 'smc_bos_displacement_strength', name: 'BOS Displacement Strength' },
            { id: 'smc_distance_to_last_choch', name: 'Distance to Last CHoCH' },
            { id: 'smc_choch_quality_score', name: 'CHoCH Quality Score' },
            { id: 'smc_htf_ltf_structural_confluence', name: 'HTF-LTF Confluence' },
            { id: 'smc_dist_to_htf_poi', name: 'Distance to HTF POI' },
            { id: 'smc_swing_leg_velocity', name: 'Swing Leg Velocity' },
            { id: 'smc_order_flow_trend_score', name: 'Order Flow Trend Score' },
            
            // Phase 2: FVG & Imbalances
            { id: 'smc_dist_to_nearest_bullish_fvg', name: 'Dist to Bullish FVG' },
            { id: 'smc_dist_to_nearest_bearish_fvg', name: 'Dist to Bearish FVG' },
            { id: 'smc_nearest_fvg_width', name: 'Nearest FVG Width' },
            { id: 'smc_fvg_mitigation_percentage', name: 'FVG Mitigation %' },
            { id: 'smc_fvg_age', name: 'FVG Age (Bars)' },
            { id: 'smc_fvg_stack_count', name: 'FVG Stack Count' },
            { id: 'smc_bpr_distance', name: 'Balanced Price Range Dist' },
            { id: 'smc_ifvg_distance', name: 'Inversion FVG Dist' },
            { id: 'smc_volume_imbalance_distance', name: 'Volume Imbalance Dist' },
            { id: 'smc_liquidity_void_size', name: 'Liquidity Void Size' },
            
            // Phase 3: Order Blocks & Breakers
            { id: 'smc_dist_to_nearest_bullish_ob', name: 'Dist to Bullish OB' },
            { id: 'smc_dist_to_nearest_bearish_ob', name: 'Dist to Bearish OB' },
            { id: 'smc_ob_mitigation_count', name: 'OB Mitigation Count' },
            { id: 'smc_ob_freshness_age', name: 'OB Freshness Age' },
            { id: 'smc_ob_creation_volume', name: 'OB Creation Volume' },
            { id: 'smc_is_price_inside_ob', name: 'Is Price Inside OB' },
            { id: 'smc_dist_to_bullish_breaker', name: 'Dist to Bullish Breaker' },
            { id: 'smc_dist_to_bearish_breaker', name: 'Dist to Bearish Breaker' },
            { id: 'smc_dist_to_mitigation_block', name: 'Dist to Mitigation Block' },
            { id: 'smc_breaker_volume_profile', name: 'Breaker Volume Profile' },
            { id: 'smc_dist_to_bullish_rejection_block', name: 'Dist to Bullish Rejection Block' },
            { id: 'smc_dist_to_bearish_rejection_block', name: 'Dist to Bearish Rejection Block' },
            
            // Phase 4: Liquidity & Sweeps
            { id: 'smc_dist_to_bsl', name: 'Dist to Buy Side Liquidity (BSL)' },
            { id: 'smc_dist_to_ssl', name: 'Dist to Sell Side Liquidity (SSL)' },
            { id: 'smc_dist_to_eqh_eql', name: 'Dist to EQH/EQL' },
            { id: 'smc_is_active_sweep', name: 'Is Active Sweep' },
            { id: 'smc_sweep_magnitude', name: 'Sweep Magnitude' },
            { id: 'smc_time_since_last_sweep', name: 'Time Since Last Sweep' },
            { id: 'smc_distance_to_nearest_idm', name: 'Dist to Inducement (IDM)' },
            { id: 'smc_is_idm_swept', name: 'Is IDM Swept' },
            { id: 'smc_retail_trendline_proximity', name: 'Retail Trendline Proximity' },
            { id: 'smc_dist_to_internal_liquidity', name: 'Dist to Internal Liquidity' },
            { id: 'smc_dist_to_external_liquidity', name: 'Dist to External Liquidity' },
            { id: 'smc_wick_proportion_oscillator', name: 'Wick Proportion Oscillator' },
            { id: 'smc_dist_to_sydney_high', name: 'Dist to Sydney Range High' },
            { id: 'smc_dist_to_sydney_low', name: 'Dist to Sydney Range Low' },
            { id: 'smc_dist_to_tokyo_high', name: 'Dist to Tokyo Range High' },
            { id: 'smc_dist_to_tokyo_low', name: 'Dist to Tokyo Range Low' },
            { id: 'smc_dist_to_london_high', name: 'Dist to London Range High' },
            { id: 'smc_dist_to_london_low', name: 'Dist to London Range Low' },
            { id: 'smc_dist_to_ny_am_high', name: 'Dist to NY AM Range High' },
            { id: 'smc_dist_to_ny_am_low', name: 'Dist to NY AM Range Low' },
            { id: 'smc_dist_to_ny_pm_high', name: 'Dist to NY PM Range High' },
            { id: 'smc_dist_to_ny_pm_low', name: 'Dist to NY PM Range Low' },
            
            // Phase 5: Advanced Pricing & Time
            { id: 'smc_current_leg_fib_level', name: 'Current Leg Fib Level' },
            { id: 'smc_premium_discount_oscillator', name: 'Premium/Discount Oscillator' },
            { id: 'smc_in_sydney_killzone', name: 'Is in Sydney Killzone' },
            { id: 'smc_in_tokyo_killzone', name: 'Is in Tokyo Killzone' },
            { id: 'smc_in_london_killzone', name: 'Is in London Killzone' },
            { id: 'smc_in_ny_am_killzone', name: 'Is in NY AM Killzone' },
            { id: 'smc_in_ny_pm_killzone', name: 'Is in NY PM Killzone' },
            { id: 'smc_po3_phase_state', name: 'PO3 Phase State (AMD)' },
            { id: 'smc_is_judas_swing_active', name: 'Is Judas Swing Active' },
            { id: 'smc_htf_premium_discount', name: 'HTF Premium/Discount' },
            { id: 'smc_time_spent_in_premium', name: 'Time Spent in Premium' },
            { id: 'smc_time_spent_in_discount', name: 'Time Spent in Discount' }
        ]
    },
    {
        id: 'candlestick_patterns',
        title: '৮. Candlestick Patterns (অ্যাডভান্সড)',
        icon: Layers,
        description: 'Quant-Grade Candlestick Engine (65 Advanced Metrics).',
        source: 'ohlcv',
        features: [
            // TA-Lib Standard Patterns (61 Metrics)
            { id: 'cdl2crows', name: '2CROWS' },
            { id: 'cdl3blackcrows', name: '3BLACKCROWS' },
            { id: 'cdl3inside', name: '3INSIDE' },
            { id: 'cdl3linestrike', name: '3LINESTRIKE' },
            { id: 'cdl3outside', name: '3OUTSIDE' },
            { id: 'cdl3starsinsouth', name: '3STARSINSOUTH' },
            { id: 'cdl3whitesoldiers', name: '3WHITESOLDIERS' },
            { id: 'cdladvanceblock', name: 'ADVANCEBLOCK' },
            { id: 'cdlbelthold', name: 'BELTHOLD' },
            { id: 'cdlbreakaway', name: 'BREAKAWAY' },
            { id: 'cdlclosingmarubozu', name: 'CLOSINGMARUBOZU' },
            { id: 'cdlconcealbabyswall', name: 'CONCEALBABYSWALL' },
            { id: 'cdlcounterattack', name: 'COUNTERATTACK' },
            { id: 'cdldarkcloudcover', name: 'DARKCLOUDCOVER' },
            { id: 'cdldoji', name: 'DOJI' },
            { id: 'cdldojistar', name: 'DOJISTAR' },
            { id: 'cdldragonflydoji', name: 'DRAGONFLYDOJI' },
            { id: 'cdlengulfing', name: 'ENGULFING' },
            { id: 'cdleveningdojistar', name: 'EVENINGDOJISTAR' },
            { id: 'cdleveningstar', name: 'EVENINGSTAR' },
            { id: 'cdlgapsidesidewhite', name: 'GAPSIDESIDEWHITE' },
            { id: 'cdlgravestonedoji', name: 'GRAVESTONEDOJI' },
            { id: 'cdlhammer', name: 'HAMMER' },
            { id: 'cdlhangingman', name: 'HANGINGMAN' },
            { id: 'cdlharami', name: 'HARAMI' },
            { id: 'cdlharamicross', name: 'HARAMICROSS' },
            { id: 'cdlhighwave', name: 'HIGHWAVE' },
            { id: 'cdlhikkake', name: 'HIKKAKE' },
            { id: 'cdlhikkakemod', name: 'HIKKAKEMOD' },
            { id: 'cdlhomingpigeon', name: 'HOMINGPIGEON' },
            { id: 'cdlidentical3crows', name: 'IDENTICAL3CROWS' },
            { id: 'cdlinneck', name: 'INNECK' },
            { id: 'cdlinvertedhammer', name: 'INVERTEDHAMMER' },
            { id: 'cdlkicking', name: 'KICKING' },
            { id: 'cdlkickingbylength', name: 'KICKINGBYLENGTH' },
            { id: 'cdlladderbottom', name: 'LADDERBOTTOM' },
            { id: 'cdllongleggeddoji', name: 'LONGLEGGEDDOJI' },
            { id: 'cdllongline', name: 'LONGLINE' },
            { id: 'cdlmarubozu', name: 'MARUBOZU' },
            { id: 'cdlmatchinglow', name: 'MATCHINGLOW' },
            { id: 'cdlmathold', name: 'MATHOLD' },
            { id: 'cdlmorningdojistar', name: 'MORNINGDOJISTAR' },
            { id: 'cdlmorningstar', name: 'MORNINGSTAR' },
            { id: 'cdlonneck', name: 'ONNECK' },
            { id: 'cdlpiercing', name: 'PIERCING' },
            { id: 'cdlrickshawman', name: 'RICKSHAWMAN' },
            { id: 'cdlrisefall3methods', name: 'RISEFALL3METHODS' },
            { id: 'cdlseparatinglines', name: 'SEPARATINGLINES' },
            { id: 'cdlshootingstar', name: 'SHOOTINGSTAR' },
            { id: 'cdlshortline', name: 'SHORTLINE' },
            { id: 'cdlspinningtop', name: 'SPINNINGTOP' },
            { id: 'cdlstalledpattern', name: 'STALLEDPATTERN' },
            { id: 'cdlsticksandwich', name: 'STICKSANDWICH' },
            { id: 'cdltakuri', name: 'TAKURI' },
            { id: 'cdltasukigap', name: 'TASUKIGAP' },
            { id: 'cdlthrusting', name: 'THRUSTING' },
            { id: 'cdltristar', name: 'TRISTAR' },
            { id: 'cdlunique3river', name: 'UNIQUE3RIVER' },
            { id: 'cdlupsidegap2crows', name: 'UPSIDEGAP2CROWS' },
            { id: 'cdlxsidegap3methods', name: 'XSIDEGAP3METHODS' },
            
            // Custom Quant Metrics (4 Metrics)
            { id: 'cdl_custom_pin_bar', name: 'Quant: True Pin Bar' },
            { id: 'cdl_custom_days_since_master', name: 'Quant: Master Candle Compression' },
            { id: 'cdl_custom_exhaustion_divergence', name: 'Quant: Exhaustion Divergence' },
            { id: 'cdl_custom_momentum_power', name: 'Quant: Momentum Power' }
        ]
    },
    {
        id: 'market_psychology',
        title: 'Market Psychology',
        icon: Target,
        description: 'Consecutive moves, gaps, and buying/selling pressure.',
        source: 'ohlcv',
        features: [
            { id: 'consecutive_candles', name: 'Consecutive Bull/Bear Candles' },
            { id: 'buying_selling_pressure', name: 'Buying & Selling Pressure' },
            { id: 'gap_analysis', name: 'Session & Weekend Gap Analysis' }
        ]
    },
    {
        id: 'ict_macro',
        title: 'ICT Time & Macro Dynamics',
        icon: Clock,
        description: 'Time-based killzones and session volatilities.',
        source: 'ohlcv',
        features: [
            { id: 'london_ny_killzone', name: 'London & NY Killzone Momentum' },
            { id: 'judas_swing', name: 'Judas Swing & Turtle Soup Fakeouts' },
            { id: 'pdh_pdl_sweep', name: 'PDH/PDL Sweep Proxy' },
            { id: 'session_features', name: 'Market Session Pipeline' },
            { id: 'weekend_gap', name: 'Weekend Gap Handler' },
        ]
    },
    {
        id: 'alt_data',
        title: 'Alternative Data & Sentiment',
        icon: Globe,
        description: 'Macro events, Central Bank NLP and Yields.',
        source: 'alt_data',
        features: [
            { id: 'central_bank_nlp', name: 'Central Bank NLP Sentiment' },
            { id: 'stop_hunt_sweeps', name: 'Stop-Hunt & Liquidity Sweeps' },
            { id: 'macro_calendar', name: 'Macroeconomic Calendar' },
            { id: 'cot_sentiment', name: 'COT Sentiment (Smart Money)' },
            { id: 'yield_differentials', name: 'Yield Differentials' },
        ]
    },
    {
        id: 'l2_price_spread',
        title: 'Price & Spread (L2)',
        icon: AlignLeft,
        description: 'Best prices, spreads, and micro-price.',
        source: 'l2_orderbook',
        features: [
            { id: 'l1_best_bid', name: 'Best Bid Price' },
            { id: 'l1_best_ask', name: 'Best Ask Price' },
            { id: 'l2_mid_price', name: 'Mid Price' },
            { id: 'spread_absolute', name: 'Bid-Ask Spread (Absolute)' },
            { id: 'spread_bps', name: 'Bid-Ask Spread (BPS)' },
            { id: 'weighted_mid_price', name: 'Weighted Mid Price' },
            { id: 'micro_price', name: 'Micro-Price' },
            { id: 'spread_sma', name: 'Spread Moving Average' },
            { id: 'spread_volatility', name: 'Spread Volatility' },
            { id: 'spread_roc', name: 'Spread Rate of Change' }
        ]
    },
    {
        id: 'l2_imbalance',
        title: 'Order Book Imbalance (L2)',
        icon: BarChart2,
        description: 'Bid/Ask pressure and volume ratios.',
        source: 'l2_orderbook',
        features: [
            { id: 'l1_imbalance', name: 'Level 1 Imbalance' },
            { id: 'top5_imbalance', name: 'Top 5 Levels Imbalance' },
            { id: 'top10_imbalance', name: 'Top 10 Levels Imbalance' },
            { id: 'cumulative_imbalance', name: 'Cumulative Imbalance (N pips)' },
            { id: 'price_weighted_imbalance', name: 'Price-Weighted Imbalance' },
            { id: 'volume_weighted_imbalance', name: 'Volume-Weighted Imbalance' },
            { id: 'imbalance_sma', name: 'Imbalance Moving Average' },
            { id: 'imbalance_roc', name: 'Imbalance Rate of Change' },
            { id: 'order_book_skewness', name: 'Order Book Skewness' },
            { id: 'order_book_kurtosis', name: 'Order Book Kurtosis' }
        ]
    },
    {
        id: 'l2_liquidity',
        title: 'Liquidity & Depth (L2)',
        icon: Database,
        description: 'Volume depth and depletion rates.',
        source: 'l2_orderbook',
        features: [
            { id: 'total_bid_depth', name: 'Total Bid Volume (Depth)' },
            { id: 'total_ask_depth', name: 'Total Ask Volume (Depth)' },
            { id: 'market_depth_ratio', name: 'Market Depth Ratio' },
            { id: 'near_touch_liquidity', name: 'Near-Touch Liquidity' },
            { id: 'far_touch_liquidity', name: 'Far-from-Touch Liquidity' },
            { id: 'bid_depletion_rate', name: 'Bid Side Depletion Rate' },
            { id: 'ask_depletion_rate', name: 'Ask Side Depletion Rate' },
            { id: 'orderbook_vwap_bid', name: 'Orderbook VWAP (Bid)' },
            { id: 'orderbook_vwap_ask', name: 'Orderbook VWAP (Ask)' },
            { id: 'cost_of_execution', name: 'Cost of Execution (Market Impact)' }
        ]
    },
    {
        id: 'l2_order_flow',
        title: 'Order Flow & Microstructure (L2)',
        icon: Layers,
        description: 'OFI, VPIN, and replenishment rates.',
        source: 'l2_orderbook',
        features: [
            { id: 'ofi', name: 'Order Flow Imbalance (OFI)' },
            { id: 'multi_level_ofi', name: 'Multi-level OFI' },
            { id: 'bid_replenishment', name: 'Bid Replenishment Rate' },
            { id: 'ask_replenishment', name: 'Ask Replenishment Rate' },
            { id: 'bid_cancellation', name: 'Bid Cancellation Rate' },
            { id: 'ask_cancellation', name: 'Ask Cancellation Rate' },
            { id: 'quote_stuffing_ratio', name: 'Quote Stuffing Ratio' },
            { id: 'vpin_proxy', name: 'VPIN Proxy (Informed Trading)' },
            { id: 'trade_sign_proxy', name: 'Trade Sign Proxy (Lee-Ready)' },
            { id: 'market_vs_limit', name: 'Market vs Limit Arrival Rate' }
        ]
    },
    {
        id: 'l2_volatility',
        title: 'Volatility & Price Pressure (L2)',
        icon: Target,
        description: 'High-frequency volatility and bounces.',
        source: 'l2_orderbook',
        features: [
            { id: 'hf_realized_volatility', name: 'High-Freq Realized Volatility' },
            { id: 'bid_ask_bounce', name: 'Bid/Ask Bounce Ratio' },
            { id: 'buying_pressure_tick', name: 'Buying Pressure (Tick)' },
            { id: 'selling_pressure_tick', name: 'Selling Pressure (Tick)' },
            { id: 'micro_rsi', name: 'Micro-RSI (Mid Price)' },
            { id: 'lob_slope_bid', name: 'LOB Slope (Bid)' },
            { id: 'lob_slope_ask', name: 'LOB Slope (Ask)' },
            { id: 'amihud_illiquidity', name: 'Amihud Illiquidity Proxy' },
            { id: 'depth_to_spread', name: 'Depth-to-Spread Ratio' },
            { id: 'toxic_order_flow', name: 'Toxic Order Flow Indicator' }
        ]
    },
    {
        id: 'l2_advanced_math',
        title: 'Advanced Derived ML (L2)',
        icon: Terminal,
        description: 'Derivatives, Entropy, and Center of Mass.',
        source: 'l2_orderbook',
        features: [
            { id: 'l1_imbalance_deriv1', name: '1st Derivative of L1 Imbalance' },
            { id: 'l1_imbalance_deriv2', name: '2nd Derivative of L1 Imbalance' },
            { id: 'spread_imbalance_corr', name: 'Spread-Imbalance Cross-Correlation' },
            { id: 'top5_imbalance_zscore', name: 'Z-Score of Top 5 Imbalance' },
            { id: 'entropy_order_book', name: 'Entropy of Order Book' },
            { id: 'center_of_mass', name: 'Order Book Center of Mass' },
            { id: 'time_decay_imbalance', name: 'Time-Decay Weighted Imbalance' },
            { id: 'bid_ask_volume_div', name: 'Bid-Ask Volume Divergence' }
        ]
    },
    {
        id: 'plp_liquidity_cluster',
        title: 'Liquidity Cluster & Density Module (PLP)',
        icon: Target,
        description: 'Maps retail trapped funds and liquidation zones synthetically.',
        source: 'l2_orderbook',
        features: [
            { id: 'abs_long_liq_pool_proxy', name: 'Absolute Long Liquidation Pool Proxy 🚀' },
            { id: 'abs_short_liq_pool_proxy', name: 'Absolute Short Liquidation Pool Proxy 🚀' },
            { id: 'liquidation_density_z_score_proxy', name: 'Liquidation Density Z-Score Proxy 🚀' },
            { id: 'leverage_washout_z_score_proxy', name: 'Leverage Washout Z-Score Proxy 🚀' },
            { id: 'high_leverage_cluster_proximity_proxy', name: 'High-Leverage Cluster Proximity 🚀' },
            { id: 'margin_call_proximity_index_proxy', name: 'Margin Call Proximity Index 🚀' },
            { id: 'magnetic_liquidity_pull_vector_proxy', name: 'Magnetic Liquidity Pull Vector 🚀' },
            { id: 'liq_cluster_density_heatmap_proxy', name: 'Liquidation Cluster Density Heatmap 🚀' },
            { id: 'synthetic_leverage_ratio_proxy', name: 'Synthetic Leverage Ratio 🚀' },
            { id: 'hidden_liquidity_absorption_proxy', name: 'Hidden Liquidity Absorption 🚀' },
            { id: 'stale_liquidity_decay_proxy', name: 'Stale Liquidity Decay 🚀' },
            { id: 'cross_margin_cascade_risk_proxy', name: 'Cross-Margin Cascade Risk 🚀' },
            { id: 'stealth_liquidation_proxies_proxy', name: 'Stealth Liquidation Proxies 🚀' },
            { id: 'gamma_exposure_imbalance_proxy', name: 'GEX Imbalance Proxy 🚀' },
            { id: 'zero_dte_options_proxy_pull', name: '0-DTE Options Pull Proxy 🚀' },
            { id: 'retail_pain_threshold_proxy', name: 'Retail Pain Threshold 🚀' },
            { id: 'liquidation_void_zones_proxy', name: 'Liquidation Void Zones 🚀' },
            { id: 'smart_money_trap_indicator_proxy', name: 'Smart Money Trap 🚀' },
            { id: 'leveraged_retail_skew_proxy', name: 'Leveraged Retail Skew 🚀' }
        ]
    },
    {
        id: 'plp_cascade_dynamics',
        title: 'Cascade & Trigger Dynamics Module (PLP)',
        icon: Zap,
        description: 'Measures domino effects and chain reactions synthetically.',
        source: 'l2_orderbook',
        features: [
            { id: 'liquidation_cascade_multiplier_proxy', name: 'Liquidation Cascade Multiplier 🚀' },
            { id: 'long_squeeze_probability_proxy', name: 'Long Squeeze Probability 🚀' },
            { id: 'short_squeeze_probability_proxy', name: 'Short Squeeze Probability 🚀' },
            { id: 'cascade_velocity_index_proxy', name: 'Cascade Velocity Index 🚀' },
            { id: 'domino_effect_threshold_proxy', name: 'Domino Effect Threshold 🚀' },
            { id: 'cascade_decay_rate_proxy', name: 'Cascade Decay Rate 🚀' },
            { id: 'forced_liquidation_trigger_pts_proxy', name: 'Forced Liquidation Trigger Points 🚀' },
            { id: 'volatility_expansion_on_liq_proxy', name: 'Volatility Expansion on Liquidation 🚀' },
            { id: 'squeeze_exhaustion_metric_proxy', name: 'Squeeze Exhaustion Metric 🚀' },
            { id: 'liquidator_bot_activity_proxy', name: 'Liquidator Bot Activity Proxy 🚀' },
            { id: 'domino_trigger_threshold_alpha_proxy', name: 'Domino Trigger Alpha 🚀' },
            { id: 'contagion_effect_probability_proxy', name: 'Contagion Effect Prob 🚀' },
            { id: 'price_volume_dislocation_liq_proxy', name: 'Price-Volume Dislocation 🚀' },
            { id: 'cascade_halflife_decay_proxy', name: 'Cascade Half-life Decay 🚀' },
            { id: 'liquidation_wall_impact_proxy', name: 'Liquidation Wall Impact 🚀' },
            { id: 'short_squeeze_velocity_factor_proxy', name: 'Short Squeeze Velocity Factor 🚀' },
            { id: 'synthetic_domino_proxy', name: 'Synthetic Domino Proxy 🚀' }
        ]
    },
    {
        id: 'plp_stop_hunt',
        title: 'Stop-Hunt & Sweep Mechanism Module (PLP)',
        icon: Crosshair,
        description: 'Identifies retail stop-loss hunts and fakeouts synthetically.',
        source: 'l2_orderbook',
        features: [
            { id: 'stop_hunt_probability_proxy', name: 'Stop-Hunt Probability 🚀' },
            { id: 'liquidity_sweep_velocity_proxy', name: 'Liquidity Sweep Velocity 🚀' },
            { id: 'fakeout_prob_model_proxy', name: 'Fakeout Probability Model (FPM) 🚀' },
            { id: 'sweep_and_reversal_ratio_proxy', name: 'Sweep and Reversal Ratio 🚀' },
            { id: 'stop_loss_trigger_density_proxy', name: 'Stop-Loss Trigger Density 🚀' },
            { id: 'predatory_algo_footprint_proxy', name: 'Predatory Algo Footprint 🚀' },
            { id: 'institutional_sweep_divergence_proxy', name: 'Institutional Sweep Divergence 🚀' },
            { id: 'retail_trap_indicator_proxy', name: 'Retail Trap Indicator 🚀' },
            { id: 'high_frequency_hunt_ratio_proxy', name: 'High Frequency Hunt Ratio 🚀' },
            { id: 'sweep_efficiency_score_proxy', name: 'Sweep Efficiency Score 🚀' },
            { id: 'low_latency_sweep_detection_proxy', name: 'Low-Latency Sweep Detect 🚀' },
            { id: 'wash_trade_sweep_detection_proxy', name: 'Wash Trade Sweep Detect 🚀' },
            { id: 'institutional_footprint_masking_proxy', name: 'Institutional Masking 🚀' },
            { id: 'fakeout_velocity_acceleration_proxy', name: 'Fakeout Velocity Accel 🚀' },
            { id: 'stop_hunt_asymmetry_proxy', name: 'Stop-Hunt Asymmetry 🚀' },
            { id: 'retail_panic_sweep_proxy', name: 'Retail Panic Sweep Proxy 🚀' },
            { id: 'algo_hunt_intensity_proxy', name: 'Algo Hunt Intensity 🚀' }
        ]
    },
    {
        id: 'hybrid_smc_ict',
        title: 'SMC & ICT (Tick-Verified)',
        icon: Activity,
        description: 'Smart money concepts verified by high-frequency tick volume.',
        source: 'hybrid_ohlcv_tick',
        features: [
            { id: 'tick_verified_fvg', name: 'Tick-Verified FVG' },
            { id: 'ob_tick_density', name: 'Order Block Tick Density' },
            { id: 'liquidity_sweep_velocity', name: 'Liquidity Sweep Velocity' },
            { id: 'mitigation_block_reaction', name: 'Mitigation Block Reaction Speed' },
            { id: 'judas_swing_imbalance', name: 'Judas Swing Tick Imbalance' },
            { id: 'breaker_block_absorption', name: 'Breaker Block Absorption Ratio' },
            { id: 'choch_momentum', name: 'CHoCH Momentum' },
            { id: 'bos_effort_result', name: 'BOS Effort vs Result' },
            { id: 'inducement_sweep_volume', name: 'Inducement Sweep Volume' },
            { id: 'ict_killzone_volatility', name: 'ICT Killzone Volatility' }
        ]
    },
    {
        id: 'hybrid_candlestick_psychology',
        title: 'Candlestick Psychology',
        icon: Target,
        description: 'Micro-anatomy of candlesticks using tick data.',
        source: 'hybrid_ohlcv_tick',
        features: [
            { id: 'wick_rejection_intensity', name: 'Wick Rejection Intensity' },
            { id: 'body_effort_result', name: 'Body Effort vs Result (Wyckoff)' },
            { id: 'doji_indecision_entropy', name: 'Doji Indecision Entropy' },
            { id: 'engulfing_imbalance_ratio', name: 'Engulfing Imbalance Ratio' },
            { id: 'pin_bar_trapping_volume', name: 'Pin Bar Trapping Volume' },
            { id: 'hammer_tick_acceleration', name: 'Hammer Tick Acceleration' },
            { id: 'star_validation_shift', name: 'Star Pattern Volume Shift' },
            { id: 'consecutive_pressure', name: 'Consecutive Pressure' },
            { id: 'gap_fill_velocity', name: 'Gap Fill Tick Velocity' },
            { id: 'candle_close_surge', name: 'Candle Close Tick Surge' }
        ]
    },
    {
        id: 'hybrid_price_action_swing',
        title: 'Advanced Price Action & Swing',
        icon: AlignLeft,
        description: 'Multi-timeframe fractal swings and VSA.',
        source: 'hybrid_ohlcv_tick',
        features: [
            { id: 'fractal_swing_confirmation_time', name: 'Fractal Swing Confirmation Time' },
            { id: 'mtf_trend_alignment', name: 'Multi-Timeframe Trend Alignment' },
            { id: 'trendline_touch_reaction', name: 'Trendline Touch Reaction' },
            { id: 'sr_penetration_depth', name: 'S/R Penetration Depth' },
            { id: 'wyckoff_spring_validation', name: 'Wyckoff Spring Validation' },
            { id: 'wyckoff_sos_pulse', name: 'Wyckoff Sign of Strength (SOS)' },
            { id: 'vsa_climax', name: 'VSA Climax Bar' },
            { id: 'vsa_no_demand_supply', name: 'VSA No Demand / No Supply' },
            { id: 'three_drives_symmetry', name: 'Three Drives Pattern Symmetry' },
            { id: 'harmonic_prz_reaction', name: 'Harmonic PRZ Tick Reaction' }
        ]
    },
    {
        id: 'hybrid_information_theory',
        title: 'Information Theory & Entropy',
        icon: Cpu,
        description: 'Shannon, Tsallis, and Kolmogorov complexity.',
        source: 'hybrid_ohlcv_tick',
        features: [
            { id: 'shannon_entropy_returns', name: 'Shannon Entropy of Tick Returns' },
            { id: 'tsallis_entropy', name: 'Tsallis Entropy' },
            { id: 'transfer_entropy_proxy', name: 'Transfer Entropy (Lead-Lag)' },
            { id: 'kolmogorov_complexity_proxy', name: 'Kolmogorov Complexity Proxy' },
            { id: 'approximate_entropy_proxy', name: 'Approximate Entropy (ApEn)' },
            { id: 'sample_entropy_proxy', name: 'Sample Entropy (SampEn)' },
            { id: 'multiscale_entropy', name: 'Multiscale Entropy' },
            { id: 'permutation_entropy', name: 'Permutation Entropy' },
            { id: 'kl_divergence', name: 'Kullback-Leibler (KL) Divergence' },
            { id: 'jensen_shannon_divergence', name: 'Jensen-Shannon Divergence' }
        ]
    },
    {
        id: 'hybrid_chaos_theory',
        title: 'Chaos Theory & Dynamics',
        icon: Waves,
        description: 'Lyapunov exponents, fractals and DFA.',
        source: 'hybrid_ohlcv_tick',
        features: [
            { id: 'mle_proxy', name: 'Maximum Lyapunov Exponent (MLE)' },
            { id: 'correlation_dimension_proxy', name: 'Correlation Dimension' },
            { id: 'hurst_exponent', name: 'Hurst Exponent (Local)' },
            { id: 'multifractal_spectrum_width', name: 'Multifractal Spectrum Width' },
            { id: 'dfa_proxy', name: 'Detrended Fluctuation Analysis (DFA)' },
            { id: 'rqa_proxy', name: 'Recurrence Quantification (RQA)' },
            { id: 'rqa_determinism', name: 'Determinism (DET) in RQA' },
            { id: 'rqa_laminarity', name: 'Laminarity (LAM) in RQA' },
            { id: 'trapping_time', name: 'Trapping Time (TT)' },
            { id: 'phase_space_embedding', name: 'Phase Space Embedding Dimension' }
        ]
    },
    {
        id: 'hybrid_spectral_analysis',
        title: 'Spectral & Frequency Domain',
        icon: Activity,
        description: 'Fourier, Wavelet, and Hilbert-Huang transforms.',
        source: 'hybrid_ohlcv_tick',
        features: [
            { id: 'fft_dominant_frequency', name: 'FFT Dominant Frequency' },
            { id: 'cwt_coefficients', name: 'CWT Coefficients' },
            { id: 'dwt_coefficients', name: 'DWT Detail Coefficients' },
            { id: 'hht_instantaneous_phase', name: 'HHT Instantaneous Phase' },
            { id: 'emd_imf_1', name: 'EMD IMF 1 (High Freq)' },
            { id: 'emd_imf_3', name: 'EMD IMF 3 (Medium Freq)' },
            { id: 'emd_residual', name: 'EMD Residual (Trend)' },
            { id: 'spectral_power_density', name: 'Spectral Power Density' },
            { id: 'cepstral_coefficients', name: 'Cepstral Coefficients' },
            { id: 'spectrogram_energy_spread', name: 'Spectrogram Energy Spread' }
        ]
    },
    {
        id: 'hybrid_fractional_calculus',
        title: 'Fractional Calculus & Memory',
        icon: Layers,
        description: 'ARFIMA, fBm drift and fractional differentiation.',
        source: 'hybrid_ohlcv_tick',
        features: [
            { id: 'frac_diff_01', name: 'Fractional Differencing (d=0.1)' },
            { id: 'frac_diff_03', name: 'Fractional Differencing (d=0.3)' },
            { id: 'frac_diff_05', name: 'Fractional Differencing (d=0.5)' },
            { id: 'arfima_residuals', name: 'ARFIMA Residuals' },
            { id: 'fbm_drift', name: 'Fractional Brownian Motion (fBm) Drift' },
            { id: 'frac_ou_reversion', name: 'Fractional O-U Reversion Speed' },
            { id: 'lrd_parameter', name: 'Long-Range Dependence (LRD)' },
            { id: 'frac_integral_tick_vol', name: 'Fractional Integration of Volume' },
            { id: 'mittag_leffler_relaxation', name: 'Mittag-Leffler Relaxation Time' },
            { id: 'frac_volatility_memory', name: 'Fractional Volatility Memory' }
        ]
    },
    {
        id: 'hybrid_topological_data_tda',
        title: 'Topological Data (TDA)',
        icon: Network,
        description: 'Betti numbers, persistence landscapes and simplices.',
        source: 'hybrid_ohlcv_tick',
        features: [
            { id: 'betti_number_0', name: 'Betti Number 0 (Connected Components)' },
            { id: 'betti_number_1', name: 'Betti Number 1 (Holes/Cycles)' },
            { id: 'persistence_landscape_area', name: 'Persistence Landscape Area' },
            { id: 'persistence_bottleneck_distance', name: 'Persistence Bottleneck Distance' },
            { id: 'simplicial_complex_density', name: 'Simplicial Complex Density' },
            { id: 'mapper_graph_modularity', name: 'Mapper Algorithm Graph Modularity' },
            { id: 'euler_characteristic_curve', name: 'Euler Characteristic Curve of Price' },
            { id: 'wasserstein_distance_proxy', name: 'Wasserstein Distance of Persistence' },
            { id: 'topological_entropy', name: 'Topological Entropy' },
            { id: 'vietoris_rips_radius', name: 'Vietoris-Rips Complex Radius' }
        ]
    },
    {
        id: 'hybrid_microstructure',
        title: 'Microstructure & Point Process',
        icon: Target,
        description: 'Hawkes processes and informed trading (PIN).',
        source: 'hybrid_ohlcv_tick',
        features: [
            { id: 'hawkes_baseline_intensity', name: 'Hawkes Baseline Intensity' },
            { id: 'hawkes_excitation', name: 'Hawkes Excitation Parameter' },
            { id: 'hawkes_decay', name: 'Hawkes Decay Rate' },
            { id: 'pin_proxy', name: 'Probability of Informed Trading (PIN)' },
            { id: 'vpin_proxy', name: 'Volume-Synchronized PIN (VPIN)' },
            { id: 'glosten_milgrom_spread', name: 'Glosten-Milgrom Spread Component' },
            { id: 'roll_effective_spread', name: 'Roll Model Effective Spread' },
            { id: 'kyles_lambda', name: "Kyle's Lambda (Market Impact)" },
            { id: 'hasbrouck_info_share', name: "Hasbrouck's Info Share" },
            { id: 'order_imbalance_duration', name: 'Order Imbalance Duration' }
        ]
    },
    {
        id: 'hybrid_stochastic_jump',
        title: 'Stochastic Calculus & Jump',
        icon: Cpu,
        description: 'Merton Jump-Diffusion, Heston, and GBM parameters.',
        source: 'hybrid_ohlcv_tick',
        features: [
            { id: 'merton_jump_intensity', name: 'Merton Jump-Diffusion Intensity' },
            { id: 'merton_jump_mean', name: 'Merton Jump Mean' },
            { id: 'merton_jump_variance', name: 'Merton Jump Variance' },
            { id: 'heston_stochastic_variance', name: 'Heston Model Stochastic Variance' },
            { id: 'heston_spot_vol_correlation', name: 'Heston Correlation (Spot-Vol)' },
            { id: 'ou_mean_reversion_level', name: 'Ornstein-Uhlenbeck Mean Reversion Level' },
            { id: 'ou_mean_reversion_speed', name: 'OU Mean Reversion Speed' },
            { id: 'cir_volatility_drift', name: 'Cox-Ingersoll-Ross (CIR) Vol Drift' },
            { id: 'gbm_drift_parameter', name: 'Geometric Brownian Motion (GBM) Drift' },
            { id: 'local_volatility_surface', name: 'Local Volatility Surface Proxy' }
        ]
    },
    {
        id: 'hybrid_graph_networks',
        title: 'Graph Theory & Networks',
        icon: Network,
        description: 'Asset interaction networks and MSTs.',
        source: 'hybrid_ohlcv_tick',
        features: [
            { id: 'eigenvector_centrality_usd', name: 'Eigenvector Centrality USD' },
            { id: 'network_clustering_coef', name: 'Network Clustering Coefficient' },
            { id: 'mst_length', name: 'Minimum Spanning Tree (MST) Length' },
            { id: 'pagerank_currency_flows', name: 'PageRank of Currency Flows' },
            { id: 'granger_causality_proxy', name: 'Granger Causality (Proxy)' },
            { id: 'dcc_garch_proxy', name: 'Dynamic Conditional Correlation (DCC-GARCH)' },
            { id: 'cross_correlation_asymmetry', name: 'Cross-Correlation Asymmetry' },
            { id: 'network_density', name: 'Network Density' },
            { id: 'assortativity_coefficient', name: 'Assortativity Coefficient' },
            { id: 'modularity_class', name: 'Modularity Class' }
        ]
    },
    {
        id: 'hybrid_lob_liquidity',
        title: 'Limit Order Book (L2) & Liquidity',
        icon: Database,
        description: 'Order flow imbalance, liquidity voids, and spread.',
        source: 'hybrid_ohlcv_tick',
        features: [
            { id: 'order_book_center_of_mass', name: 'Order Book Center of Mass' },
            { id: 'micro_price_deviation', name: 'Micro-Price Deviation' },
            { id: 'ofi_z_score', name: 'Order Flow Imbalance (OFI) Z-Score' },
            { id: 'quote_stuffing_ratio', name: 'Quote Stuffing Ratio' },
            { id: 'liquidity_replenishment_rate', name: 'Liquidity Replenishment Rate' },
            { id: 'bid_ask_volume_divergence', name: 'Bid-Ask Volume Divergence' },
            { id: 'iceberg_order_proxy', name: 'Iceberg Order Detection Proxy' },
            { id: 'order_book_skewness', name: 'Order Book Shape (Skewness)' },
            { id: 'order_cancellation_ratio', name: 'Order Cancellation Ratio' },
            { id: 'market_to_limit_ratio', name: 'Market-to-Limit Order Arrival Ratio' }
        ]
    },
    {
        id: 'hybrid_stat_arb',
        title: 'Stat Arb & Mean Reversion',
        icon: TrendingUp,
        description: 'Cointegration, Kalman filters and Copulas.',
        source: 'hybrid_ohlcv_tick',
        features: [
            { id: 'cointegration_z_score', name: 'Cointegration Z-Score' },
            { id: 'half_life_mean_reversion', name: 'Half-Life of Mean Reversion' },
            { id: 'bb_bandwidth_2nd_deriv', name: 'Bollinger Bandwidth 2nd Derivative' },
            { id: 'kalman_filter_residual', name: 'Kalman Filter Residual' },
            { id: 'kalman_covariance_trace', name: 'Kalman Filter Covariance Trace' },
            { id: 'pairs_spread_velocity', name: 'Pairs Trading Spread Velocity' },
            { id: 'stat_arb_mispricing_index', name: 'Stat Arb Mispricing Index' },
            { id: 'johansen_eigenvalue', name: 'Johansen Test Eigenvalue' },
            { id: 'copula_tail_dependence', name: 'Copula Dependence (Tail)' },
            { id: 'student_t_degrees_of_freedom', name: 'Student-t Copula Degrees of Freedom' }
        ]
    },
    {
        id: 'hybrid_regime_sentiment',
        title: 'Regime Detection & Sentiment',
        icon: Clock,
        description: 'GMM Regimes, Panic Index, and FOMO Momentum.',
        source: 'hybrid_ohlcv_tick',
        features: [
            { id: 'gmm_log_likelihood', name: 'GMM Log-Likelihood' },
            { id: 'volatility_regime_indicator', name: 'Volatility Regime Indicator' },
            { id: 'systemic_risk_indicator', name: 'Systemic Risk Indicator' },
            { id: 'cusum_change_point', name: 'Change-Point Detection (CUSUM)' },
            { id: 'prospect_theory_value', name: 'Prospect Theory Value Function' },
            { id: 'herd_behavior_index', name: 'Herd Behavior Index (CSSD)' },
            { id: 'retail_panic_index', name: 'Retail Panic Index' },
            { id: 'fomo_momentum', name: 'FOMO Momentum' },
            { id: 'stop_hunt_vulnerability', name: 'Stop-Hunt Vulnerability Score' },
            { id: 'anchoring_bias_indicator', name: 'Anchoring Bias Indicator' }
        ]
    },
    {
        id: 'hybrid_ml_meta_features',
        title: 'Machine Learning Meta-Features',
        icon: Layers,
        description: 'Autoencoders, UMAP, and Ensemble Agreement.',
        source: 'hybrid_ohlcv_tick',
        features: [
            { id: 'autoencoder_reconstruction_error', name: 'Autoencoder Reconstruction Error' },
            { id: 'pca_1st_component', name: 'PCA 1st Principal Component' },
            { id: 'umap_component_1', name: 'UMAP Component 1' },
            { id: 'transformer_attention_score', name: 'Transformer Attention Score (Self)' },
            { id: 'hmm_state_0_prob', name: 'HMM State 0 (Ranging) Prob' },
            { id: 'xgboost_base_output', name: 'XGBoost Base Model Output' },
            { id: 'drl_q_value_proxy', name: 'DRL Q-Value Proxy' },
            { id: 'epistemic_uncertainty', name: 'Epistemic Uncertainty' },
            { id: 'aleatoric_uncertainty', name: 'Aleatoric Uncertainty' },
            { id: 'ensemble_agreement_ratio', name: 'Ensemble Agreement Ratio' }
        ]
    },
    {
        id: 'universal_advanced_math',
        title: 'Universal Advanced Math (L2 & Tick)',
        icon: Cpu,
        description: 'Iceberg detection, spatial density and tick velocity vectors.',
        source: 'hybrid_ohlcv_tick',
        features: [
            { id: 'iceberg_replenishment_variance', name: 'Iceberg Replenishment Variance' },
            { id: 'lob_spatial_density_matrix', name: 'LOB Spatial Density Matrix (Image)' },
            { id: 'tick_velocity_vector_field', name: 'Tick Velocity Vector Field' },
            { id: 'latent_space_crash_proximity', name: 'Latent Space Crash Proximity' },
            { id: 'hawkes_process_excitation', name: 'Hawkes Process Excitation' },
            { id: 'fractional_brownian_motion_hurst', name: 'Fractional Brownian Motion (Hurst)' },
            { id: 'stop_hunt_liquidity_voids', name: 'Stop-Hunt Liquidity Voids' },
            { id: 'orderbook_heatmap_entropy', name: 'Orderbook Heatmap Entropy (Shannon)' },
            { id: 'kalman_filter_true_midprice', name: 'Kalman Filter True Midprice' },
            { id: 'lyapunov_exponent_chaos', name: 'Lyapunov Exponent (Chaos Theory)' },
            { id: 'markov_transition_toxicity', name: 'Markov Transition Toxicity Prob' },
            { id: 'fourier_transform_cycle_phase', name: 'FFT Dominant Cycle Phase' }
        ]
    },
    {
        id: 'fx_exclusive_macro',
        title: 'Forex Exclusive Macro (Hybrid)',
        icon: Globe,
        description: 'Cross-pair arb, USD index divergence and peg defense.',
        source: 'hybrid_ohlcv_tick',
        features: [
            { id: 'synthetic_triangular_arb_pressure', name: 'Synthetic Triangular Arb Pressure' },
            { id: 'usd_index_tick_divergence', name: 'USD Index (DXY) Tick Divergence' },
            { id: 'central_bank_peg_defense_proxy', name: 'Central Bank Peg Defense Proxy' },
            { id: 'fx_session_overlap_intensity', name: 'FX Session Overlap Intensity' },
            { id: 'yield_differential_proxy', name: 'Yield Differential Proxy' },
            { id: 'interbank_spoofing_mirage', name: 'Interbank Spoofing Mirage (EBS)' },
            { id: 'cot_commercial_hedger_divergence', name: 'COT Commercial Hedger Divergence' },
            { id: 'retail_broker_book_imbalance', name: 'Retail Broker Book Trap (OANDA)' },
            { id: 'sovereign_wealth_fund_execution_proxy', name: 'Sovereign Wealth Fund Execution Proxy' }
        ]
    }
];

interface ForexAdvancedPipelineProps {
    selectedFeatures: string[];
    onToggleFeature: (featureId: string) => void;
    onSetMultipleFeatures: (featureIds: string[]) => void;
    disabled?: boolean;
    dataSource: string;
    setDataSource: (val: string) => void;
    // Scraper Props
    symbol: string;
    isTraining: boolean;
    timeframe: string;
    forexSnapshotFiles: string[];
    selectedForexFile: string;
    setSelectedForexFile: (v: string) => void;
    handleDeleteSnapshot: (e: React.MouseEvent) => void;
    forexScrapeJob: any;
    setForexScrapeJob: (job: any) => void;
    onStartCollector: (config: any) => void;
    onCancelCollector: () => void;
    // L2 Upload Props
    l2OrderbookFiles: string[];
    selectedL2File: string;
    setSelectedL2File: (v: string) => void;
    handleUploadL2Csv: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleDeleteL2Snapshot: (e: React.MouseEvent) => void;
    isUploadingL2: boolean;
    
    tickDataFiles: string[];
    selectedTickFile: string;
    setSelectedTickFile: (val: string) => void;
    handleUploadTickCsv: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleDeleteTickSnapshot: (e: React.MouseEvent) => void;
    isUploadingTick: boolean;
    tickBinningStrategy: string;
    setTickBinningStrategy: (val: string) => void;

    customIndicators: CustomIndicator[];
    setCustomIndicators: React.Dispatch<React.SetStateAction<CustomIndicator[]>>;
    
    asmcHtf?: string;
    setAsmcHtf?: (value: string) => void;
    asmcLtf?: string;
    setAsmcLtf?: (value: string) => void;

    onStartMerge?: () => void;
    hybridMergedFiles?: string[];
    selectedHybridFile?: string;
    setSelectedHybridFile?: (val: string) => void;
    isMerging?: boolean;
}

export const ForexAdvancedPipeline: React.FC<ForexAdvancedPipelineProps> = (props) => {
    const { dataSource, setDataSource } = props;
    const [expandedModule, setExpandedModule] = useState<string | null>('smc_order_flow');

    const handleSelectAll = (moduleId: string, features: {id: string}[], isAllSelected: boolean) => {
        if (props.disabled) return;
        
        let newSelection = [...props.selectedFeatures];
        if (isAllSelected) {
            // Remove all features from this module
            const moduleFeatureIds = features.map(f => f.id);
            newSelection = newSelection.filter(id => !moduleFeatureIds.includes(id));
        } else {
            // Add all
            features.forEach(f => {
                if (!newSelection.includes(f.id)) newSelection.push(f.id);
            });
        }
        props.onSetMultipleFeatures(newSelection);
    };

    return (
        <div className="flex flex-col h-full bg-[#0A0A0A]/90 border border-teal-500/30 rounded-[22px] shadow-[0_0_20px_rgba(20,184,166,0.1)] overflow-hidden relative">
            {/* Ambient Background Effects */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-teal-600/10 blur-[80px] rounded-full pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-600/10 blur-[80px] rounded-full pointer-events-none"></div>
            
            <div className="p-5 bg-black/40 border-b border-white/10 flex-shrink-0 relative z-20">
                <div className="flex items-center justify-between mb-4">
                    <label className="flex items-center gap-2 text-sm font-medium text-white">
                        <Database className="w-5 h-5 text-cyan-400" /> Data Source Engine
                    </label>
                </div>
                
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                    <button
                        onClick={() => { setDataSource('ohlcv'); setExpandedModule('smc_order_flow'); }}
                        disabled={props.isTraining}
                        className={`py-2 rounded-xl text-[11px] font-bold transition-all duration-300 ${dataSource === 'ohlcv' ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-[0_0_15px_rgba(56,189,248,0.4)]' : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/5 hover:text-white'}`}
                    >
                        Standard OHLCV
                    </button>
                    <button
                        onClick={() => { setDataSource('l2_orderbook'); setExpandedModule('l2_price_spread'); }}
                        disabled={props.isTraining}
                        className={`py-2 rounded-xl text-[11px] font-bold transition-all duration-300 ${dataSource === 'l2_orderbook' ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-[0_0_15px_rgba(168,85,247,0.4)]' : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/5 hover:text-white'}`}
                    >
                        Level 2 Orderbook
                    </button>
                    <button
                        onClick={() => { setDataSource('hybrid_ohlcv_tick'); setExpandedModule(null); }}
                        disabled={props.isTraining}
                        className={`py-2 rounded-xl text-[11px] font-bold transition-all duration-300 ${dataSource === 'hybrid_ohlcv_tick' ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)]' : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/5 hover:text-white'}`}
                    >
                        Hybrid Standard OHLCV + Historical Ticks
                    </button>

                    <button
                        onClick={() => { setDataSource('alt_data'); setExpandedModule('alt_data'); }}
                        disabled={props.isTraining}
                        className={`py-2 rounded-xl text-[11px] font-bold transition-all duration-300 ${dataSource === 'alt_data' ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)]' : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/5 hover:text-white'}`}
                    >
                        Alternative Data
                    </button>
                    <button
                        onClick={() => { setDataSource('l2_and_hybrid'); setExpandedModule(null); }}
                        disabled={props.isTraining}
                        className={`py-2 rounded-xl text-[11px] font-bold transition-all duration-300 ${dataSource === 'l2_and_hybrid' ? 'bg-gradient-to-r from-orange-600 to-red-600 text-white shadow-[0_0_15px_rgba(249,115,22,0.4)]' : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/5 hover:text-white'}`}
                    >
                        L2 Orderbook + Hybrid
                    </button>
                </div>
            </div>
            
            <div className="p-4 overflow-y-auto custom-scrollbar h-full relative z-10 space-y-3">
                {/* OHLCV SCRAPER INJECTION */}
                {dataSource === 'ohlcv' && (
                    <div className="mb-4 p-4 border border-white/10 rounded-xl bg-white/[0.02]">
                        <div className="mb-4">
                            <label className="block text-sm font-bold text-slate-300 mb-2">Select Dataset Snapshot (Parquet)</label>
                            <div className="flex items-center gap-2">
                                <select 
                                    value={props.selectedForexFile} 
                                    onChange={e => props.setSelectedForexFile(e.target.value)}
                                    disabled={props.isTraining}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-teal-500/50 outline-none"
                                >
                                    {props.forexSnapshotFiles.length === 0 && <option value="" className="text-slate-500">No snapshots available. Please collect data first.</option>}
                                    {props.forexSnapshotFiles.map(f => (
                                        <option key={f} value={f} className="bg-gray-900 text-white">{f}</option>
                                    ))}
                                </select>
                                {props.selectedForexFile && (
                                    <button
                                        onClick={props.handleDeleteSnapshot}
                                        disabled={props.isTraining}
                                        className="p-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl border border-red-500/20 transition-all flex items-center justify-center"
                                        title="Delete selected snapshot"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                )}
                            </div>
                        </div>

                        <ForexScraperPanel 
                            symbol={props.symbol}
                            isTraining={props.isTraining}
                            forexScrapeJob={props.forexScrapeJob}
                            setForexScrapeJob={props.setForexScrapeJob}
                            onStartCollector={props.onStartCollector}
                            onCancelCollector={props.onCancelCollector}
                            timeframe={props.timeframe}
                        />
                    </div>
                )}

                {/* LEVEL 2 CSV UPLOAD INJECTION */}
                {(dataSource === 'l2_orderbook' || dataSource === 'l2_and_hybrid') && (
                    <div className="mb-4 p-5 border border-purple-500/30 rounded-xl bg-purple-500/5 shadow-[inset_0_0_20px_rgba(168,85,247,0.05)]">
                        <div className="mb-5 text-center">
                            <h4 className="text-sm font-bold text-purple-400 mb-1">Custom L2 Orderbook Data</h4>
                            <p className="text-[10px] text-slate-400">Upload CSV files containing historical DOM/L2 data.</p>
                        </div>
                        
                        <div className="mb-5">
                            <label className="block text-[11px] font-bold text-slate-300 mb-2 uppercase tracking-wider">Select L2 Dataset (CSV)</label>
                            <div className="flex items-center gap-2">
                                <select 
                                    value={props.selectedL2File} 
                                    onChange={e => props.setSelectedL2File(e.target.value)}
                                    disabled={props.isTraining || props.isUploadingL2}
                                    className="w-full bg-black/40 border border-purple-500/20 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-purple-500/50 outline-none"
                                >
                                    {props.l2OrderbookFiles.length === 0 && <option value="" className="text-slate-500">No L2 datasets available. Please upload one.</option>}
                                    {props.l2OrderbookFiles.map(f => (
                                        <option key={f} value={f} className="bg-gray-900 text-white">{f}</option>
                                    ))}
                                </select>
                                {props.selectedL2File && (
                                    <button
                                        onClick={props.handleDeleteL2Snapshot}
                                        disabled={props.isTraining || props.isUploadingL2}
                                        className="p-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl border border-red-500/20 transition-all flex items-center justify-center"
                                        title="Delete selected L2 dataset"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="relative border-2 border-dashed border-purple-500/30 hover:border-purple-400/60 rounded-xl p-6 text-center transition-all bg-black/20 group">
                            <input 
                                type="file" 
                                accept=".csv"
                                onChange={props.handleUploadL2Csv}
                                disabled={props.isTraining || props.isUploadingL2}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            />
                            <div className="flex flex-col items-center justify-center pointer-events-none">
                                <div className="w-10 h-10 bg-purple-500/20 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                                    <Database className="w-5 h-5 text-purple-400" />
                                </div>
                                <span className="text-sm font-bold text-slate-300 group-hover:text-purple-300 transition-colors">
                                    {props.isUploadingL2 ? 'Uploading...' : 'Click or Drag to Upload CSV'}
                                </span>
                                <span className="text-[10px] text-slate-500 mt-1">Only .csv format is supported</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* HYBRID OHLCV + TICK INJECTION */}
                {(dataSource === 'hybrid_ohlcv_tick' || dataSource === 'l2_and_hybrid') && (
                    <HybridOhlcvTickPanel 
                        symbol={props.symbol}
                        isTraining={props.isTraining}
                        forexSnapshotFiles={props.forexSnapshotFiles}
                        selectedForexFile={props.selectedForexFile}
                        setSelectedForexFile={props.setSelectedForexFile}
                        handleDeleteSnapshot={props.handleDeleteSnapshot}
                        tickDataFiles={props.tickDataFiles}
                        selectedTickFile={props.selectedTickFile}
                        setSelectedTickFile={props.setSelectedTickFile}
                        handleUploadTickCsv={props.handleUploadTickCsv}
                        handleDeleteTickSnapshot={props.handleDeleteTickSnapshot}
                        isUploadingTick={props.isUploadingTick}
                        tickBinningStrategy={props.tickBinningStrategy}
                        setTickBinningStrategy={props.setTickBinningStrategy}
                        onStartMerge={props.onStartMerge}
                        hybridMergedFiles={props.hybridMergedFiles}
                        selectedHybridFile={props.selectedHybridFile}
                        setSelectedHybridFile={props.setSelectedHybridFile}
                        isMerging={props.isMerging}
                    />
                )}

                {/* CUSTOM INDICATOR BUILDER */}
                <CustomIndicatorBuilder 
                    dataSource={dataSource}
                    customIndicators={props.customIndicators}
                    setCustomIndicators={props.setCustomIndicators}
                    asmcHtf={props.asmcHtf}
                    setAsmcHtf={props.setAsmcHtf}
                    asmcLtf={props.asmcLtf}
                    setAsmcLtf={props.setAsmcLtf}
                    disabled={props.isTraining}
                />

                {/* ACCORDION MODULES */}
                {FOREX_MODULES.filter(m => {
                    if (dataSource === 'l2_and_hybrid') {
                        return m.source === 'l2_orderbook' || m.source === 'hybrid_ohlcv_tick';
                    }
                    return m.source === dataSource;
                }).map((module) => {
                    const ModuleIcon = module.icon;
                    const isExpanded = expandedModule === module.id;
                    
                    const moduleFeatureIds = module.features.map(f => f.id);
                    const selectedInModule = props.selectedFeatures.filter(id => moduleFeatureIds.includes(id));
                    const isAllSelected = selectedInModule.length === module.features.length;
                    const isPartiallySelected = selectedInModule.length > 0 && !isAllSelected;

                    return (
                        <div 
                            key={module.id} 
                            className={`rounded-xl border transition-all duration-300 overflow-hidden ${isExpanded ? 'border-teal-500/40 bg-teal-500/5' : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]'}`}
                        >
                            {/* Accordion Header */}
                            <div 
                                className="flex items-center justify-between p-3 cursor-pointer"
                                onClick={() => setExpandedModule(isExpanded ? null : module.id)}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg transition-colors ${isExpanded ? 'bg-teal-500/20 text-teal-300' : 'bg-white/5 text-slate-400'}`}>
                                        <ModuleIcon className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <h4 className={`text-sm font-bold tracking-wide transition-colors ${isExpanded ? 'text-teal-300' : 'text-slate-300'}`}>
                                            {module.title}
                                        </h4>
                                        {!isExpanded && (
                                            <p className="text-[10px] text-slate-500 mt-0.5">{module.description}</p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="text-[10px] font-mono text-teal-400 bg-teal-400/10 px-2 py-0.5 rounded-md">
                                        {selectedInModule.length} / {module.features.length}
                                    </div>
                                    <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                                </div>
                            </div>

                            {/* Accordion Body */}
                            {isExpanded && (
                                <div className="p-3 pt-0 border-t border-white/5 mt-2 space-y-1">
                                    <div className="flex items-center justify-between mb-3 px-2 py-1 bg-white/5 rounded-md">
                                        <span className="text-xs text-slate-400 font-medium">{module.description}</span>
                                        <button 
                                            disabled={props.disabled}
                                            onClick={(e) => { e.stopPropagation(); handleSelectAll(module.id, module.features, isAllSelected); }}
                                            className="text-[10px] uppercase font-bold tracking-wider text-teal-400 hover:text-teal-300 px-2 py-1 rounded hover:bg-teal-400/10 transition-colors"
                                        >
                                            {isAllSelected ? 'Deselect All' : 'Select All'}
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 gap-1">
                                        {module.features.map(feature => {
                                            const isSelected = props.selectedFeatures.includes(feature.id);
                                            return (
                                                <div 
                                                    key={feature.id}
                                                    onClick={() => !props.disabled && props.onToggleFeature(feature.id)}
                                                    className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-teal-500/10 hover:bg-teal-500/20' : 'hover:bg-white/5'} ${props.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                >
                                                    <div className={`transition-colors ${isSelected ? 'text-teal-400' : 'text-slate-600'}`}>
                                                        {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                                                    </div>
                                                    <span className={`text-xs font-medium ${isSelected ? 'text-teal-200' : 'text-slate-400'}`}>
                                                        {feature.name}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
