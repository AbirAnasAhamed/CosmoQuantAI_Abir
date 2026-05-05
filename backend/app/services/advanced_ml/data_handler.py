import numpy as np
import pandas as pd
from typing import Tuple, List

class AdvancedDataHandler:
    """
    Handles data preparation for advanced ML models.
    Converts tabular data into time-series sequences (Sliding Windows).
    """
    
    @staticmethod
    def create_sequences(
        df: pd.DataFrame, 
        features: List[str], 
        sequence_length: int = 60,
        target_col: str = 'Target'
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Transforms a DataFrame into 3D sequences for Transformer/LSTM.
        
        Args:
            df: The input DataFrame.
            features: List of feature column names.
            sequence_length: Number of past steps to include in each sequence.
            target_col: The column to use as target (optional).
            
        Returns:
            X: (samples, sequence_length, feature_count)
            y: (samples,)
        """
        X_data = df[features].values
        y_data = df[target_col].values if target_col in df.columns else None
        
        X, y = [], []
        
        for i in range(len(df) - sequence_length + 1):
            X.append(X_data[i : i + sequence_length])
            if y_data is not None:
                # Target is usually at the end of the sequence or the step after
                y.append(y_data[i + sequence_length - 1])
                
        return np.array(X), np.array(y)

    @staticmethod
    def prepare_rl_data(
        df: pd.DataFrame, 
        features: List[str], 
        sequence_length: int = 1
    ) -> pd.DataFrame:
        """
        Prepares data specifically for the TradingEnv.
        If sequence_length > 1, it 'rolls' the features into the columns?
        Actually, for Transformer-RL, we often keep the Env returning 1 step, 
        and the Policy handles the internal state (like LSTM/Transformer memory).
        
        However, if using a non-recurrent policy with a window, we flatten the window.
        """
        # For now, we return the filtered dataframe. 
        # The environment will handle the current step.
        needed_cols = features + ['Close']
        if 'Target' in df.columns:
            needed_cols.append('Target')
            
        return df[needed_cols].copy()
