import numpy as np
import pandas as pd
import ccxt
from hmmlearn.hmm import GaussianHMM
import logging
from typing import Dict, Any, List

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class RegimeService:
    def __init__(self, symbol: str = 'BTC/USDT', timeframe: str = '1h', limit: int = 2000):
        self.symbol = symbol
        self.timeframe = timeframe
        self.limit = limit
        self.exchange = ccxt.binance()
        self.model = GaussianHMM(n_components=4, covariance_type="full", n_iter=100, random_state=42)
        
    def fetch_data(self) -> pd.DataFrame:
        """Fetches OHLCV data from Binance."""
        try:
            ohlcv = self.exchange.fetch_ohlcv(self.symbol, self.timeframe, limit=self.limit)
            df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
            df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
            return df
        except Exception as e:
            logger.error(f"Error fetching data: {e}")
            raise

    def prepare_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Calculates Log Returns and Rolling Volatility."""
        df = df.copy()
        # Log Returns
        df['log_return'] = np.log(df['close'] / df['close'].shift(1))
        
        # Rolling Volatility (Standard Deviation of Log Returns) - 24 period window (1 day for 1h data)
        df['volatility'] = df['log_return'].rolling(window=24).std()
        
        # Scale features to avoid numerical instability with HMM (small variances)
        # Using percentage terms (x 100)
        df['log_return'] = df['log_return'] * 100
        df['volatility'] = df['volatility'] * 100
        
        # Handle Inf values if any (e.g. log(0)) and drop NaNs
        df.replace([np.inf, -np.inf], np.nan, inplace=True)
        df.dropna(inplace=True)
        return df

    def fit_predict(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Fits HMM model and predicts regimes."""
        # Feature matrix
        X = df[['log_return', 'volatility']].values
        
        # Fit model
        self.model.fit(X)
        
        # Predict states
        hidden_states = self.model.predict(X)
        df['state'] = hidden_states
        
        # Calculate stats for each state to map them
        state_stats = []
        for i in range(self.model.n_components):
            state_mask = (hidden_states == i)
            mean_return = X[state_mask, 0].mean()
            mean_volatility = X[state_mask, 1].mean()
            state_stats.append({
                'state': i,
                'mean_return': mean_return,
                'mean_volatility': mean_volatility
            })
            
        # Sort/Map States
        # Mapping logic:
        # We want: [Bull Stable, Bull Volatile, Bear Stable, Bear Volatile]
        #
        # Let's categorize based on Return and Volatility relative to the global mean/median or just relative sorting.
        #
        # A robust way:
        # 1. Sort by Mean Return. Top 2 are Bullish, Bottom 2 are Bearish.
        # 2. Within Bullish: Higher Volatility -> Bull Volatile, Lower -> Bull Stable
        # 3. Within Bearish: Higher Volatility -> Bear Volatile, Lower -> Bear Stable
        
        sorted_by_return = sorted(state_stats, key=lambda x: x['mean_return'], reverse=True)
        bullish_states = sorted_by_return[:2]
        bearish_states = sorted_by_return[2:]
        
        # Sort bullish by volatility
        bullish_states.sort(key=lambda x: x['mean_volatility'])
        bull_stable = bullish_states[0]
        bull_volatile = bullish_states[1]
        
        # Sort bearish by volatility
        bearish_states.sort(key=lambda x: x['mean_volatility'])
        bear_stable = bearish_states[0]
        bear_volatile = bearish_states[1]
        
        # Create mapping dictionary {original_state_id: 'Label'}
        regime_map = {
            bull_stable['state']: 'Bull Stable',
            bull_volatile['state']: 'Bull Volatile',
            bear_stable['state']: 'Bear Stable',
            bear_volatile['state']: 'Bear Volatile'
        }
        
        # Assign mapped labels to dataframe
        df['regime'] = df['state'].map(regime_map)
        
        # Get current state info
        current_state_idx = hidden_states[-1]
        current_regime = regime_map[current_state_idx]
        
        # Calculate Trend Score (-1 to 1) and Volatility Score (0 to 1) for the Compass
        # Normalize stats for scores
        # Simplified scoring based on the regime properties
        
        # Trend Score:
        # Bull Volatile: 1.0 (Strong Up)
        # Bull Stable: 0.5 (Steady Up)
        # Bear Stable: -0.5 (Steady Down)
        # Bear Volatile: -1.0 (Strong Down)
        
        trend_score_map = {
            'Bull Volatile': 1.0, 
            'Bull Stable': 0.5,
            'Bear Stable': -0.5,
            'Bear Volatile': -1.0
        }
        
        # Volatility Score (Normalized across states):
        # We can use the rank or the actual volatility value normalized.
        # Let's use a mapping for simplicity and consistency with the "Compass" metaphor.
        # Volatile regimes -> High score (0.8 - 1.0)
        # Stable regimes -> Low score (0.0 - 0.4)
        
        volatility_score_map = {
            'Bull Volatile': 0.9,
            'Bull Stable': 0.2,
            'Bear Stable': 0.3,
            'Bear Volatile': 0.9
        }

        current_trend_score = trend_score_map[current_regime]
        current_vol_score = volatility_score_map[current_regime]
        
        # Transition Matrix
        transition_matrix = self.model.transmat_
        
        # Output structure
        result = {
            "current_regime": current_regime,
            "trend_score": current_trend_score,
            "volatility_score": current_vol_score,
            "transition_matrix": transition_matrix.tolist(),
            "regime_map": regime_map,
            # Return last 100 points for validaton/charting
            "history": df[['timestamp', 'close', 'regime', 'log_return', 'volatility']].tail(100).to_dict(orient='records')
        }
        
        return result

    def execute(self):
        """Main execution method."""
        df = self.fetch_data()
        df = self.prepare_features(df)
        result = self.fit_predict(df)
        return result

# Simple test block
if __name__ == "__main__":
    service = RegimeService()
    try:
        result = service.execute()
        print(f"Current Regime: {result['current_regime']}")
        print(f"Trend Score: {result['trend_score']}")
        print(f"Volatility Score: {result['volatility_score']}")
        print(f"Regime Map: {result['regime_map']}")
    except Exception as e:
        print(f"Error: {e}")
