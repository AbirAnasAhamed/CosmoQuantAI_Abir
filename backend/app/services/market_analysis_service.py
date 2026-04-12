import pandas as pd
import numpy as np
from typing import List, Dict, Any
from datetime import datetime, timedelta
from app.services.quant_engine import calculate_correlation_matrix, calculate_cointegration, calculate_z_score, detect_lead_lag

class MarketAnalysisService:
    def get_correlation_data(self, symbols: List[str], timeframe: str) -> Dict[str, Any]:
        """
        Get correlation matrix and cointegration analysis for a list of symbols.
        
        Args:
            symbols (List[str]): List of trading pairs (e.g., ['BTC/USDT', 'ETH/USDT']).
            timeframe (str): Timeframe (e.g., '1h', '1d').

        Returns:
            Dict[str, Any]: Dictionary containing 'matrix', 'lead_lag_matrix', and 'cointegrated_pairs'.
        """
        # 1. Fetch OHLCV Data (Mocked for now as per instructions)
        # Using a fixed seed for consistency during dev/test
        np.random.seed(42)  
        
        # Simulate fetching 100 periods of data
        periods = 100
        dates = pd.date_range(end=datetime.now(), periods=periods, freq=timeframe)
        
        data = {}
        # Generate some correlated random walks
        base_series = np.cumsum(np.random.randn(periods))
        
        # Create a dictionary to hold the series for DataFrame creation
        series_dict = {}

        # Base for BTC
        btc_series = base_series + np.random.randn(periods) * 0.1 + 30000
        series_dict['BTC/USDT'] = btc_series
        
        for symbol in symbols:
            if symbol == 'BTC/USDT':
                continue
                
            # Create some variety
            if symbol == 'ETH/USDT':
                # Make ETH follow BTC by 2 steps (lag -2)
                # ETH[t] ~ BTC[t-2]
                # BTC leads ETH.
                # If we shift BTC forward by 2, it matches ETH?
                # No, if BTC leads, BTC happens first.
                # ETH is a delayed version of BTC.
                # ETH[t] = BTC[t-2] + noise.
                # So we take BTC, shift it by 2 (fill with something), adds noise.
                # pd.Series(btc).shift(2) -> [NaN, NaN, btc[0], btc[1]...]
                # So index t has value from t-2. 
                eth_series = pd.Series(btc_series).shift(2)
                eth_series = eth_series.bfill() # Fill start
                eth_series = eth_series + np.random.randn(periods) * 0.1 * 10 # scale
                series_dict[symbol] = eth_series.values
            else:
                noise = np.random.randn(periods) * 0.5
                trend = np.linspace(0, np.random.randint(-10, 10), periods)
                price_series = base_series + trend + noise + 1000 
                series_dict[symbol] = price_series
            
        df = pd.DataFrame(series_dict, index=dates)
        # Ensure all requested symbols are in df (handle case where BTC wasn't in input but we used it)
        # If 'BTC/USDT' not in symbols, we might have added it extra, but let's assume it is in list generally.
        # But to be safe, only keep requested symbols
        df = df[symbols]
        
        # 2. Calculate Correlation Matrix
        correlation_matrix = calculate_correlation_matrix(df)
        
        # 3. Calculate Lead-Lag Matrix & Cointegration
        cointegrated_pairs = []
        lead_lag_matrix = {s: {} for s in symbols}
        
        # Initialize lead_lag_matrix with 0s
        for r in symbols:
            for c in symbols:
                lead_lag_matrix[r][c] = 0

        # Iterate through unique pairs
        for i in range(len(symbols)):
            for j in range(len(symbols)): # Full matrix for lead/lag
                sym_a = symbols[i]
                sym_b = symbols[j]
                
                if i == j:
                    lead_lag_matrix[sym_a][sym_b] = 0
                    continue
                
                # Only calculate if we haven't already (symmetric? No, lag(A,B) = -lag(B,A))
                # calculated[a][b] = lag. calculated[b][a] = -lag.
                # Let's just calc for all or optimize.
                # detect_lead_lag(A, B) -> lag k.
                # detect_lead_lag(B, A) -> lag -k approximately.
                # Let's compute single direction to save time if j > i
                if j > i:
                    res = detect_lead_lag(df[sym_a], df[sym_b])
                    lag = res['lag']
                    lead_lag_matrix[sym_a][sym_b] = lag
                    lead_lag_matrix[sym_b][sym_a] = -lag
                
                # Cointegration (only upper triangle)
                if j > i:
                     # Cointegration Test
                    coint_res = calculate_cointegration(df[sym_a], df[sym_b])
                    
                    if coint_res['is_cointegrated']:
                        spread = df[sym_a] - df[sym_b]
                        z_score = calculate_z_score(spread)
                        
                        cointegrated_pairs.append({
                            "asset_a": sym_a,
                            "asset_b": sym_b,
                            "score": coint_res['score'],
                            "p_value": coint_res['p_value'],
                            "is_cointegrated": coint_res['is_cointegrated'],
                            "z_score": z_score
                        })
                    
        return {
            "matrix": correlation_matrix,
            "lead_lag_matrix": lead_lag_matrix,
            "cointegrated_pairs": cointegrated_pairs
        }


    def get_rolling_correlation(self, symbol_a: str, symbol_b: str, timeframe: str = "1h", window: int = 30) -> List[Dict[str, Any]]:
        """
        Get rolling correlation history for two assets.
        """
        # Mock data generation (consistent with get_correlation_data)
        np.random.seed(42)
        periods = 200 # More history for rolling
        dates = pd.date_range(end=datetime.now(), periods=periods, freq=timeframe)
        
        # Base series
        base_series = np.cumsum(np.random.randn(periods))
        
        # Symbol A (base + noise)
        series_a = base_series + np.random.randn(periods) * 0.5 + 1000
        
        # Symbol B (correlated or not based on random choice? Let's make them correlated for demo)
        # Or even better, let's make correlation change over time
        # First half correlated, second half less correlated
        noise_b = np.random.randn(periods)
        series_b = base_series.copy()
        
        # Introduce regime change in correlation
        split = periods // 2
        series_b[split:] = series_b[split:] * -1 # Flip correlation in second half
        
        series_b = series_b + noise_b * 0.5 + 2000
        
        # Create DataFrames
        df_a = pd.Series(series_a, index=dates)
        df_b = pd.Series(series_b, index=dates)
        
        from app.services.quant_engine import calculate_rolling_correlation
        return calculate_rolling_correlation(df_a, df_b, window=window)

market_analysis_service = MarketAnalysisService()

