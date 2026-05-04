import pandas_ta as ta
import pandas as pd
import numpy as np
import os
import joblib
import torch
import torch.nn as nn
from app.db.session import SessionLocal
from app import models

# -----------------------------------------------------------
# 1. Base Interface for Live Strategies
# -----------------------------------------------------------
class BaseLiveStrategy:
    def __init__(self, config):
        self.config = config

    def check_signal(self, df: pd.DataFrame):
        """
        Input: DataFrame with OHLCV data
        Output: (Signal, Reason, Price)
        Signal: "BUY", "SELL", or "HOLD"
        """
        raise NotImplementedError("Subclasses must implement check_signal method")

# -----------------------------------------------------------
# 2. Concrete Strategy Implementations
# -----------------------------------------------------------

class RSIStrategy(BaseLiveStrategy):
    """
    RSI Strategy: Buy if Oversold (<30), Sell if Overbought (>70) (Optional logic)
    """
    def check_signal(self, df):
        period = int(self.config.get('period', 14))
        lower_band = float(self.config.get('lower', 30))
        upper_band = float(self.config.get('upper', 70))

        # Calculate RSI
        df['rsi'] = ta.rsi(df['close'], length=period)
        
        if df['rsi'].iloc[-1] is None:
            return "HOLD", "Not enough data", df['close'].iloc[-1]

        current_rsi = df['rsi'].iloc[-1]
        current_price = df['close'].iloc[-1]

        if current_rsi < lower_band:
            return "BUY", f"RSI Oversold ({current_rsi:.2f})", current_price
        
        # ✅ FIX: SELL Condition Enabled
        elif current_rsi > upper_band:
            return "SELL", f"RSI Overbought ({current_rsi:.2f})", current_price
        
        return "HOLD", f"RSI Neutral ({current_rsi:.2f})", current_price

class MACDStrategy(BaseLiveStrategy):
    """
    MACD Strategy: Buy (Golden Cross), Sell (Death Cross)
    """
    def check_signal(self, df):
        fast = int(self.config.get('fast_period', 12))
        slow = int(self.config.get('slow_period', 26))
        signal_span = int(self.config.get('signal_period', 9))

        # Calculate MACD
        macd_df = ta.macd(df['close'], fast=fast, slow=slow, signal=signal_span)
        
        if macd_df is None or macd_df.empty:
             return "HOLD", "Not enough data", df['close'].iloc[-1]

        # pandas_ta returns columns like MACD_12_26_9, MACDs_12_26_9, MACDh_12_26_9
        macd_col = f"MACD_{fast}_{slow}_{signal_span}"
        signal_col = f"MACDs_{fast}_{slow}_{signal_span}"

        current_macd = macd_df[macd_col].iloc[-1]
        current_signal = macd_df[signal_col].iloc[-1]
        prev_macd = macd_df[macd_col].iloc[-2]
        prev_signal = macd_df[signal_col].iloc[-2]
        current_price = df['close'].iloc[-1]

        # Crossover Logic
        # 1. Golden Cross (BUY)
        if prev_macd < prev_signal and current_macd > current_signal:
            return "BUY", "MACD Golden Cross", current_price
            
        # 2. Death Cross (SELL)
        elif prev_macd > prev_signal and current_macd < current_signal:
            return "SELL", "MACD Death Cross", current_price
        
        return "HOLD", f"MACD: {current_macd:.2f} | Sig: {current_signal:.2f}", current_price

class BollingerBandsStrategy(BaseLiveStrategy):
    """
    Bollinger Bands: Buy < Lower, Sell > Upper
    """
    def check_signal(self, df):
        period = int(self.config.get('period', 20))
        std_dev = float(self.config.get('devfactor', 2.0))

        bb = ta.bbands(df['close'], length=period, std=std_dev)
        
        if bb is None:
            return "HOLD", "Not enough data", df['close'].iloc[-1]

        lower_col = f"BBL_{period}_{std_dev}"
        upper_col = f"BBU_{period}_{std_dev}"

        current_price = df['close'].iloc[-1]
        lower_band = bb[lower_col].iloc[-1]
        upper_band = bb[upper_col].iloc[-1]

        if current_price < lower_band:
            return "BUY", f"Price below Lower BB ({lower_band:.2f})", current_price
            
        elif current_price > upper_band:
            return "SELL", f"Price above Upper BB ({upper_band:.2f})", current_price

        return "HOLD", f"Price within Bands", current_price

class SMACrossoverStrategy(BaseLiveStrategy):
    """
    Simple Moving Average Crossover: Buy (Fast > Slow), Sell (Fast < Slow)
    """
    def check_signal(self, df):
        fast_p = int(self.config.get('fast_period', 10))
        slow_p = int(self.config.get('slow_period', 30))

        df['fast_sma'] = ta.sma(df['close'], length=fast_p)
        df['slow_sma'] = ta.sma(df['close'], length=slow_p)

        if df['fast_sma'].iloc[-1] is None or df['slow_sma'].iloc[-1] is None:
             return "HOLD", "Not enough data", df['close'].iloc[-1]

        curr_fast = df['fast_sma'].iloc[-1]
        curr_slow = df['slow_sma'].iloc[-1]
        prev_fast = df['fast_sma'].iloc[-2]
        prev_slow = df['slow_sma'].iloc[-2]
        current_price = df['close'].iloc[-1]

        # 1. Golden Cross (BUY)
        if prev_fast < prev_slow and curr_fast > curr_slow:
            return "BUY", f"SMA Cross UP ({fast_p} > {slow_p})", current_price
            
        # 2. Death Cross (SELL)
        elif prev_fast > prev_slow and curr_fast < curr_slow:
             return "SELL", f"SMA Cross DOWN ({fast_p} < {slow_p})", current_price

        return "HOLD", f"Fast: {curr_fast:.2f} | Slow: {curr_slow:.2f}", current_price

class CustomMLStrategy(BaseLiveStrategy):
    """
    AI Model Strategy: Loads a trained model (.pkl, .pt, or .zip) from the ML Registry and runs prediction.
    Buy if prediction suggests UP, Sell if prediction suggests DOWN.
    """
    def __init__(self, config):
        super().__init__(config)
        self.model = None
        self.model_type = None
        self.scaler_x = None # Optional: If we saved scaler, we would load it. Here we will do on-the-fly min-max for simplicity
        
        ai_model_id = config.get("ai_model_id")
        if not ai_model_id:
            print("❌ CustomMLStrategy Error: No ai_model_id provided in config")
            return
            
        # Fetch model from DB
        db = SessionLocal()
        try:
            db_model = db.query(models.CustomMLModel).filter(models.CustomMLModel.id == ai_model_id).first()
            if not db_model or not db_model.active_version_id:
                print(f"❌ CustomMLStrategy Error: Model {ai_model_id} not found or no active version")
                return
                
            db_version = db.query(models.ModelVersion).filter(models.ModelVersion.id == db_model.active_version_id).first()
            if not db_version:
                print(f"❌ CustomMLStrategy Error: Version {db_model.active_version_id} not found")
                return
                
            self.model_type = db_model.model_type
            file_path = db_version.file_path
            
            if self.model_type == "PPO-RL":
                file_path = file_path.replace(".pkl", ".zip").replace(".pt", ".zip")
            
            if not os.path.exists(file_path):
                print(f"❌ CustomMLStrategy Error: Model file not found at {file_path}")
                return
                
            print(f"🤖 Loading AI Model {self.model_type} from {file_path}...")
            
            if self.model_type in ["Random Forest", "XGBoost", "LightGBM", "CatBoost"]:
                self.model = joblib.load(file_path)
            elif self.model_type in ["LSTM", "GRU", "1D-CNN", "DeepLOB", "Transformer"]:
                from app.services.ml_architectures import SimpleLSTM, SimpleGRU, CNN1D, DeepLOB, TimeSeriesTransformer
                
                # Assume input size is exactly what it was during training (OHLCV + RSI + MACD) = ~7-9 features
                # Let's assume input_size=5 for now (we might need to handle this more robustly)
                input_size = 5
                
                if self.model_type == "LSTM":
                    self.model = SimpleLSTM(input_size=input_size, hidden_size=64, num_layers=2, output_size=1)
                elif self.model_type == "GRU":
                    self.model = SimpleGRU(input_size=input_size, hidden_size=64, num_layers=2, output_size=1)
                elif self.model_type == "1D-CNN":
                    self.model = CNN1D(input_size=input_size, output_size=1)
                elif self.model_type == "DeepLOB":
                    self.model = DeepLOB(input_size=input_size, output_size=1)
                elif self.model_type == "Transformer":
                    self.model = TimeSeriesTransformer(input_size=input_size, output_size=1)
                    
                try:
                    self.model.load_state_dict(torch.load(file_path))
                    self.model.eval()
                except Exception as e:
                    print(f"⚠️ Error loading {self.model_type} state_dict: {e}. Ensure feature count matches.")
                    self.model = None
            elif self.model_type == "PPO-RL":
                try:
                    from stable_baselines3 import PPO
                    self.model = PPO.load(file_path)
                except Exception as e:
                    print(f"⚠️ Error loading PPO-RL model: {e}")
                    self.model = None
            
            if self.model is not None:
                print(f"✅ AI Model {self.model_type} loaded successfully.")
            
        finally:
            db.close()

    def check_signal(self, df):
        if self.model is None:
            return "HOLD", "Model not loaded", df['close'].iloc[-1]
            
        current_price = df['close'].iloc[-1]
        
        # Prepare Data (Ensure same indicators as training)
        df_copy = df.copy()
        
        # We assume RSI and MACD were used as they are defaults in training
        df_copy.ta.rsi(append=True)
        df_copy.ta.macd(append=True)
        df_copy.ta.bbands(append=True)
        df_copy.dropna(inplace=True)
        
        if df_copy.empty:
            return "HOLD", "Not enough data for indicators", current_price
            
        # Extract features (exclude OHLCV as done in training)
        features = [col for col in df_copy.columns if col not in ['Open', 'High', 'Low', 'Close', 'Volume', 'Adj Close', 'timestamp']]
        if not features:
            features = ['Close']
            
        # Get the latest row of features
        latest_features = df_copy[features].iloc[-1].values.reshape(1, -1)
        
        # We need to scale. Since we didn't save the scaler, we'll scale based on the recent window.
        recent_window = df_copy[features].tail(100).values
        min_val = np.min(recent_window, axis=0)
        max_val = np.max(recent_window, axis=0)
        
        # Avoid division by zero
        range_val = max_val - min_val
        range_val[range_val == 0] = 1 
        
        scaled_features = (latest_features - min_val) / range_val
        
        # Predict
        try:
            if self.model_type in ["Random Forest", "XGBoost", "LightGBM", "CatBoost"]:
                pred_scaled = self.model.predict(scaled_features)[0]
            elif self.model_type in ["LSTM", "GRU"]:
                X_t = torch.FloatTensor(scaled_features).unsqueeze(1)
                pred_scaled = self.model(X_t).item()
            elif self.model_type in ["1D-CNN", "DeepLOB", "Transformer"]:
                X_t = torch.FloatTensor(scaled_features)
                pred_scaled = self.model(X_t).item()
            elif self.model_type == "PPO-RL":
                action, _ = self.model.predict(scaled_features[0].astype(np.float32), deterministic=True)
                # Ensure the threshold logic works (pred_scaled > current_close_scaled + threshold)
                # For RL, we'll bypass that logic and return immediately:
                if action == 1:
                    return "BUY", "RL Agent Predicts UP", current_price
                else:
                    return "SELL", "RL Agent Predicts DOWN", current_price
            else:
                return "HOLD", "Unsupported Model Type", current_price
                
            # The model predicts the next scaled Close price.
            current_close_scaled = (current_price - np.min(df_copy['close'].tail(100))) / max(1, np.max(df_copy['close'].tail(100)) - np.min(df_copy['close'].tail(100)))
            
            # Simple Logic: If predicted next close > current close + threshold -> BUY
            threshold = 0.001
            if pred_scaled > current_close_scaled + threshold:
                return "BUY", f"AI Predicts UP (Pred: {pred_scaled:.4f} > Curr: {current_close_scaled:.4f})", current_price
            elif pred_scaled < current_close_scaled - threshold:
                return "SELL", f"AI Predicts DOWN (Pred: {pred_scaled:.4f} < Curr: {current_close_scaled:.4f})", current_price
                
            return "HOLD", f"AI Predicts NEUTRAL (Pred: {pred_scaled:.4f})", current_price
            
        except Exception as e:
            return "HOLD", f"Prediction Error: {str(e)}", current_price

# -----------------------------------------------------------
# 3. Strategy Factory
# -----------------------------------------------------------
class LiveStrategyFactory:
    """
    Factory class to return the correct strategy instance based on name
    """
    @staticmethod
    def get_strategy(strategy_name: str, config: dict) -> BaseLiveStrategy:
        strategy_map = {
            "RSI Strategy": RSIStrategy,
            "RSI": RSIStrategy, # Alias
            
            "MACD Trend": MACDStrategy,
            "MACD": MACDStrategy, # Alias
            
            "Bollinger Bands": BollingerBandsStrategy,
            "Bollinger": BollingerBandsStrategy, # Alias
            
            "SMA Cross": SMACrossoverStrategy,
            "SMA Cross": SMACrossoverStrategy,
            "SMA": SMACrossoverStrategy, # Alias
            
            "ai_model_bot": CustomMLStrategy,
            "AI Model": CustomMLStrategy
        }
        
        # ✅ Dynamic Strategy Loader
        if strategy_name == "Custom Visual Protocol":
            from app.strategies.dynamic_strategy import DynamicStrategyExecutor
            strategy_map["Custom Visual Protocol"] = DynamicStrategyExecutor
        
        # ডিফল্ট হিসেবে RSI সেট করা হলো যদি নাম না মেলে
        strategy_class = strategy_map.get(strategy_name, RSIStrategy)
        
        # কনসোলে প্রিন্ট করা কোন স্ট্র্যাটেজি লোড হলো
        print(f"🔧 Strategy Factory: Loading '{strategy_name}' using {strategy_class.__name__}")
        
        return strategy_class(config)
