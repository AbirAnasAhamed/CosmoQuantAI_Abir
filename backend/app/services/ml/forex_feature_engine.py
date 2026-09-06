import pandas as pd
import pandas_ta as ta
import numpy as np
import logging

logger = logging.getLogger(__name__)

def generate_ohlcv_features(df: pd.DataFrame, selected_features: list[str]) -> pd.DataFrame:
    """
    Dynamically generates Forex OHLCV technical features based on user selection.
    
    Args:
        df (pd.DataFrame): DataFrame with 'open', 'high', 'low', 'close', and optionally 'volume' columns.
        selected_features (list[str]): List of feature IDs requested by the user.
        
    Returns:
        pd.DataFrame: The original DataFrame with appended feature columns.
    """
    if df.empty or not selected_features:
        return df
        
    # Safely handle column names (make a copy to avoid SettingWithCopy warnings if necessary)
    df.columns = [str(c).lower() for c in df.columns]
    
    # Map tick_volume or real_volume to volume for pandas_ta compatibility
    if 'volume' not in df.columns:
        if 'tick_volume' in df.columns:
            df['volume'] = df['tick_volume']
        elif 'real_volume' in df.columns:
            df['volume'] = df['real_volume']
            
    has_volume = 'volume' in df.columns

    try:
        # --- 1. Basic Price Action ---
        if 'log_return' in selected_features:
            df['log_return'] = np.log(df['close'] / df['close'].shift(1))
        if 'candle_body_size' in selected_features:
            df['candle_body_size'] = abs(df['open'] - df['close'])
        if 'upper_shadow' in selected_features:
            df['upper_shadow'] = df['high'] - df[['open', 'close']].max(axis=1)
        if 'lower_shadow' in selected_features:
            df['lower_shadow'] = df[['open', 'close']].min(axis=1) - df['low']
        if 'high_low_range' in selected_features:
            df['high_low_range'] = df['high'] - df['low']
        if 'typical_price' in selected_features:
            df['typical_price'] = (df['high'] + df['low'] + df['close']) / 3
        if 'weighted_close' in selected_features:
            df['weighted_close'] = (df['high'] + df['low'] + df['close'] * 2) / 4
        if 'median_price' in selected_features:
            df['median_price'] = (df['high'] + df['low']) / 2
        if 'body_to_range_ratio' in selected_features:
            range_val = df['high'] - df['low']
            df['body_to_range_ratio'] = np.where(range_val == 0, 0, abs(df['open'] - df['close']) / range_val)

        # --- 2. Trend & Moving Averages ---
        if 'sma' in selected_features:
            df.ta.sma(length=14, append=True)
        if 'ema' in selected_features:
            df.ta.ema(length=14, append=True)
        if 'wma' in selected_features:
            df.ta.wma(length=14, append=True)
        if 'hma' in selected_features:
            df.ta.hma(length=14, append=True)
        if 'price_to_sma_ratio' in selected_features:
            sma = ta.sma(df['close'], length=14)
            df['price_to_sma_ratio'] = np.where(sma == 0, np.nan, df['close'] / sma)
        if 'ma_crossover' in selected_features:
            short_ema = ta.ema(df['close'], length=9)
            long_ema = ta.ema(df['close'], length=21)
            if short_ema is not None and long_ema is not None:
                df['ma_crossover'] = short_ema - long_ema
        
        if any(f in selected_features for f in ['macd_line', 'macd_signal', 'macd_hist']):
            macd = df.ta.macd(fast=12, slow=26, signal=9, append=False)
            if macd is not None:
                if 'macd_line' in selected_features:
                    col = [c for c in macd.columns if c.startswith('MACD_')][0]
                    df['macd_line'] = macd[col]
                if 'macd_signal' in selected_features:
                    col = [c for c in macd.columns if c.startswith('MACDs_')][0]
                    df['macd_signal'] = macd[col]
                if 'macd_hist' in selected_features:
                    col = [c for c in macd.columns if c.startswith('MACDh_')][0]
                    df['macd_hist'] = macd[col]
                
        if 'parabolic_sar' in selected_features:
            psar = df.ta.psar(append=False)
            if psar is not None:
                # PSAR splits into long and short columns (one is NaN when the other is active)
                psar_long = [c for c in psar.columns if c.startswith('PSARl_')]
                psar_short = [c for c in psar.columns if c.startswith('PSARs_')]
                if psar_long and psar_short:
                    df['parabolic_sar'] = psar[psar_long[0]].fillna(psar[psar_short[0]])
                    
        if 'adx' in selected_features:
            adx = df.ta.adx(length=14, append=False)
            if adx is not None:
                col = [c for c in adx.columns if c.startswith('ADX_')][0]
                df['adx'] = adx[col]

        # --- 3. Momentum Oscillators ---
        if 'rsi' in selected_features:
            df.ta.rsi(length=14, append=True)
            
        if any(f in selected_features for f in ['stoch_k', 'stoch_d']):
            stoch = df.ta.stoch(k=14, d=3, smooth_k=3, append=False)
            if stoch is not None:
                if 'stoch_k' in selected_features:
                    col = [c for c in stoch.columns if c.startswith('STOCHk_')][0]
                    df['stoch_k'] = stoch[col]
                if 'stoch_d' in selected_features:
                    col = [c for c in stoch.columns if c.startswith('STOCHd_')][0]
                    df['stoch_d'] = stoch[col]
                    
        if 'williams_r' in selected_features:
            df.ta.willr(length=14, append=True)
        if 'roc' in selected_features:
            df.ta.roc(length=14, append=True)
        if 'cci' in selected_features:
            df.ta.cci(length=14, append=True)
        if 'momentum' in selected_features:
            df.ta.mom(length=10, append=True)
        if 'awesome_oscillator' in selected_features:
            df.ta.ao(append=True)
        if 'tsi' in selected_features:
            df.ta.tsi(append=True)

        # --- 4. Volatility Indicators ---
        if 'true_range' in selected_features:
            df.ta.true_range(append=True)
        if 'atr' in selected_features:
            df.ta.atr(length=14, append=True)
            
        if any(f in selected_features for f in ['bb_upper', 'bb_lower', 'bb_width', 'bb_pct_b']):
            bbands = df.ta.bbands(length=20, std=2, append=False)
            if bbands is not None:
                if 'bb_upper' in selected_features:
                    col = [c for c in bbands.columns if c.startswith('BBU_')][0]
                    df['bb_upper'] = bbands[col]
                if 'bb_lower' in selected_features:
                    col = [c for c in bbands.columns if c.startswith('BBL_')][0]
                    df['bb_lower'] = bbands[col]
                if 'bb_width' in selected_features:
                    col = [c for c in bbands.columns if c.startswith('BBB_')][0]
                    df['bb_width'] = bbands[col]
                if 'bb_pct_b' in selected_features:
                    col = [c for c in bbands.columns if c.startswith('BBP_')][0]
                    df['bb_pct_b'] = bbands[col]
                    
        if any(f in selected_features for f in ['keltner_upper', 'keltner_lower']):
            kc = df.ta.kc(length=20, append=False)
            if kc is not None:
                if 'keltner_upper' in selected_features:
                    col = [c for c in kc.columns if c.startswith('KCUe_')][0]
                    df['keltner_upper'] = kc[col]
                if 'keltner_lower' in selected_features:
                    col = [c for c in kc.columns if c.startswith('KCLe_')][0]
                    df['keltner_lower'] = kc[col]

        if any(f in selected_features for f in ['donchian_upper', 'donchian_lower']):
            donch = df.ta.donchian(lower_length=20, upper_length=20, append=False)
            if donch is not None:
                if 'donchian_upper' in selected_features:
                    col = [c for c in donch.columns if c.startswith('DCU_')][0]
                    df['donchian_upper'] = donch[col]
                if 'donchian_lower' in selected_features:
                    col = [c for c in donch.columns if c.startswith('DCL_')][0]
                    df['donchian_lower'] = donch[col]

        if 'historical_volatility' in selected_features:
            ret = np.log(df['close'] / df['close'].shift(1))
            df['historical_volatility'] = ret.rolling(window=20).std() * np.sqrt(252 * 1440) # Annualized for 1m
            
        if 'choppiness_index' in selected_features:
            df.ta.chop(length=14, append=True)

        # --- 5. Tick Volume Metrics ---
        if has_volume:
            if 'obv' in selected_features:
                df.ta.obv(append=True)
            if 'volume_sma' in selected_features:
                df['volume_sma'] = df['volume'].rolling(window=14).mean()
            if 'vroc' in selected_features:
                df['vroc'] = df['volume'].pct_change(periods=14)
            if 'mfi' in selected_features:
                df.ta.mfi(length=14, append=True)
            if 'force_index' in selected_features:
                df['force_index'] = (df['close'] - df['close'].shift(1)) * df['volume']
            if 'cmf' in selected_features:
                df.ta.cmf(length=20, append=True)
        else:
            if any(f in selected_features for f in ['obv', 'volume_sma', 'vroc', 'mfi', 'force_index', 'cmf']):
                logger.warning("Volume data missing, skipping volume-based metrics.")

        # --- 6. Statistical & Time-Series ---
        stat_features = [f for f in selected_features if f.startswith('stat_') or f in ['rolling_std', 'rolling_skewness', 'rolling_kurtosis']]
        if stat_features:
            from app.services.advanced_ml.features.forex.statistical_features import StatisticalFeatures
            df = StatisticalFeatures.calculate_all(df, requested_features=stat_features)

        # --- 7. Call Legacy SMC & Psychology Engine ---
        # If any legacy SMC, Candlestick, or Psychology features were selected, process them
        from app.services.ml.smc_feature_engine import generate_smc_and_pattern_features
        df = generate_smc_and_pattern_features(df, selected_features)

        # --- 8. Call NEW Advanced SMC & Market Structure Engine (54 Metrics) ---
        has_new_smc = any(f.startswith('smc_') for f in selected_features)
        if has_new_smc:
            try:
                from app.services.advanced_ml.features.forex.smc_market_structure_features import SMCMarketStructureFeatures
                df = SMCMarketStructureFeatures.calculate_all(df)
            except ImportError as e:
                logger.error(f"Could not import SMCMarketStructureFeatures: {e}")

        # --- 9. Call NEW Advanced Candlestick Pattern Engine (65 Metrics) ---
        has_new_cdl = any(f.startswith('cdl_') for f in selected_features)
        if has_new_cdl:
            try:
                from app.services.advanced_ml.features.forex.candlestick_pattern_features import CandlestickPatternFeatures
                df = CandlestickPatternFeatures.calculate_all(df)
            except Exception as e:
                logger.error(f"\n{'='*60}\nCRITICAL PIPELINE ERROR in Candlestick Engine:\n{e}\n{'='*60}")
                raise e  # Fail Fast! Stop Training immediately.

        # --- 10. Call NEW Advanced Market Psychology Engine (49 Metrics) ---
        has_psychology = any(f.startswith('psych_') for f in selected_features)
        if has_psychology:
            try:
                from app.services.advanced_ml.features.forex.market_psychology.market_psychology_features import MarketPsychologyEngine
                engine = MarketPsychologyEngine(df)
                df = engine.generate_all_features()
            except Exception as e:
                logger.error(f"\n{'='*60}\nCRITICAL PIPELINE ERROR in Psychology Engine:\n{e}\n{'='*60}")
                raise e  # Fail Fast! Stop Training immediately.

        # --- 11. Call NEW Advanced ICT Time & Macro Dynamics Engine (26 Metrics) ---
        has_ict = any(f.startswith('ict_') for f in selected_features)
        if has_ict:
            try:
                from app.services.advanced_ml.features.forex.ict_macro.ict_macro_features import ICTMacroEngine
                engine = ICTMacroEngine(df)
                df = engine.generate_all_features()
            except Exception as e:
                logger.error(f"\n{'='*60}\nCRITICAL PIPELINE ERROR in ICT Macro Engine:\n{e}\n{'='*60}")
                raise e  # Fail Fast! Stop Training immediately.

    except Exception as e:
        # Re-raise critical training errors
        if "CRITICAL ERROR" in str(e):
            raise e
        logger.error(f"Error calculating some features: {e}")
        
    return df
