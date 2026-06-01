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
        needed_cols = features.copy()
        if 'Close' not in needed_cols:
            needed_cols.append('Close')
        if 'Target' in df.columns and 'Target' not in needed_cols:
            needed_cols.append('Target')
            
        res_df = df[needed_cols].copy()
        
        # FIX: Ensure no NaNs or Infs
        res_df.replace([np.inf, -np.inf], np.nan, inplace=True)
        res_df.ffill(inplace=True)
        res_df.fillna(0, inplace=True)
        
        # Normalize features for RL Neural Network (MlpPolicy)
        from sklearn.preprocessing import StandardScaler
        if len(features) > 0:
            scaler = StandardScaler()
            scaled_vals = scaler.fit_transform(res_df[features].values)
            scaled_vals = np.nan_to_num(scaled_vals, nan=0.0)
            # Strict clip to prevent extreme outliers from blowing up SAC gradients
            scaled_vals = np.clip(scaled_vals, -10.0, 10.0)
            res_df[features] = scaled_vals
            
        res_df['Raw_Close'] = df['Close'].copy()
        return res_df
