import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset
from stable_baselines3 import PPO
from stable_baselines3.common.vec_env import DummyVecEnv
import pandas as pd
import numpy as np
import os
import time
import json
from datetime import datetime
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, mean_squared_error, mean_absolute_error

from app.services.advanced_ml.trading_env import AdvancedTradingEnv
from app.services.advanced_ml.architectures import TimeSeriesTransformer, TransformerRLFeatureExtractor
from app.services.advanced_ml.data_handler import AdvancedDataHandler
from app import models

class AdvancedMLEngine:
    """
    Main coordination engine for Advanced ML Training.
    Handles Transformer Supervised Learning and PPO Reinforcement Learning.
    """

    @staticmethod
    def train_transformer(job, df, features, db, add_log):
        """Supervised Training for Transformer Model."""
        config = job.config or {}
        seq_len = int(config.get("sequence_length", 30))
        epochs = int(config.get("epochs", 10))
        lr = float(config.get("learning_rate", 0.001))
        batch_size = 64
        
        add_log(f"Preparing sequence data (Window Size: {seq_len})...")
        
        # ✅ Smart Validation: Check if we have enough data for the chosen sequence length
        if len(df) < seq_len:
            error_msg = f"❌ Not enough data: You have {len(df)} candles but sequence length is {seq_len}. Suggestion: Decrease 'Sequence Length' to {max(1, len(df)-1)} or use a lower 'Timeframe' to generate more candles."
            add_log(error_msg)
            raise Exception(error_msg)

        X, y = AdvancedDataHandler.create_sequences(df, features, sequence_length=seq_len)
        
        # Split
        split = int(len(X) * 0.8)
        X_train, X_test = torch.FloatTensor(X[:split]), torch.FloatTensor(X[split:])
        y_train, y_test = torch.FloatTensor(y[:split]).view(-1, 1), torch.FloatTensor(y[split:]).view(-1, 1)
        
        train_loader = DataLoader(TensorDataset(X_train, y_train), batch_size=batch_size, shuffle=True)
        
        add_log(f"Initializing Transformer Architecture (Input Dim: {len(features)})...")
        model = TimeSeriesTransformer(input_dim=len(features), d_model=64, nhead=4, num_layers=3)
        
        criterion = nn.MSELoss() if config.get("prediction_target") != "classification" else nn.BCEWithLogitsLoss()
        optimizer = optim.Adam(model.parameters(), lr=lr)
        
        add_log(f"Starting Supervised Training for {epochs} epochs...")
        for epoch in range(epochs):
            model.train()
            epoch_loss = 0
            for batch_X, batch_y in train_loader:
                optimizer.zero_grad()
                outputs = model(batch_X)
                loss = criterion(outputs, batch_y)
                loss.backward()
                optimizer.step()
                epoch_loss += loss.item()
            
            avg_loss = epoch_loss / len(train_loader)
            job.progress = 40 + (50 * (epoch + 1) / epochs)
            db.commit()
            add_log(f"Epoch [{epoch+1}/{epochs}], Avg Loss: {avg_loss:.6f}")
            
        # Save model
        model_filename = f"model_{job.id}.pt"
        model_path = os.path.join("uploads", "models", model_filename)
        os.makedirs(os.path.dirname(model_path), exist_ok=True)
        torch.save(model.state_dict(), model_path)
        
        # ✅ Calculate Final Metrics for UI
        add_log("Finalizing Model and Calculating Performance Metrics...")
        model.eval()
        with torch.no_grad():
            test_outputs = model(X_test)
            
            if config.get("prediction_target") == "classification":
                # Classification Metrics
                preds = (torch.sigmoid(test_outputs).squeeze() > 0.5).int().numpy()
                y_true = y_test.int().numpy()
                metrics = {
                    "accuracy": float(accuracy_score(y_true, preds)),
                    "precision": float(precision_score(y_true, preds, zero_division=0)),
                    "recall": float(recall_score(y_true, preds, zero_division=0)),
                    "f1_score": float(f1_score(y_true, preds, zero_division=0))
                }
            else:
                # Regression Metrics
                preds = test_outputs.squeeze().numpy()
                y_true = y_test.squeeze().numpy()
                metrics = {
                    "mse": float(mean_squared_error(y_true, preds)),
                    "mae": float(mean_absolute_error(y_true, preds)),
                    "rmse": float(np.sqrt(mean_squared_error(y_true, preds)))
                }
            
            add_log(f"[METRICS] {json.dumps(metrics)}")
        
        return model, model_path

    @staticmethod
    def train_ppo_rl(job, df, features, db, add_log):
        """Reinforcement Learning Training for PPO Agent."""
        config = job.config or {}
        epochs = int(config.get("epochs", 10))
        lr = float(config.get("learning_rate", 0.0003))
        initial_balance = float(config.get("initial_balance", 10000))
        commission = float(config.get("commission", 0.001))
        
        # Prepare Data for Env
        env_df = AdvancedDataHandler.prepare_rl_data(df, features)
        
        # ✅ Smart Validation for RL
        if len(env_df) < 100:
            error_msg = f"❌ Not enough data for RL: You have {len(env_df)} candles. Please collect more rows or use a lower 'Timeframe'."
            add_log(error_msg)
            raise Exception(error_msg)
        
        # Create Vectorized Environment
        def make_env():
            return AdvancedTradingEnv(
                df=env_df, 
                initial_balance=initial_balance, 
                commission=commission
            )
        
        env = DummyVecEnv([make_env])
        
        add_log("Initializing PPO Agent with MLP Policy...")
        # Note: In future we can use TransformerRLFeatureExtractor here
        model = PPO(
            "MlpPolicy", 
            env, 
            verbose=0, 
            learning_rate=lr,
            tensorboard_log="./logs/ppo_trading/"
        )
        
        total_timesteps = epochs * len(df)
        add_log(f"Starting RL Training (Total Timesteps: {total_timesteps})...")
        
        # We use a callback or simple loop to update progress
        start_time = time.time()
        model.learn(total_timesteps=total_timesteps)
        
        model.save(model_path)
        
        # ✅ Log Equity Curve for Frontend Visualization
        if hasattr(env.envs[0], 'equity_history'):
            equity_data = env.envs[0].equity_history
            step_size = max(1, len(equity_data) // 100)
            downsampled_equity = [
                {"step": i, "equity": float(equity_data[i])} 
                for i in range(0, len(equity_data), step_size)
            ]
            add_log(f"[EQUITY_CURVE] {json.dumps(downsampled_equity)}")

        # ✅ Calculate Trading Metrics for RL Agent
        add_log("Finalizing Agent and Calculating Performance Metrics...")
        if hasattr(env.envs[0], 'equity_history') and len(env.envs[0].equity_history) > 1:
            equity = np.array(env.envs[0].equity_history)
            returns = np.diff(equity) / equity[:-1]
            
            # 1. Total Return
            total_return = (equity[-1] - initial_balance) / initial_balance * 100
            
            # 2. Sharpe Ratio (Simplified)
            sharpe = (np.mean(returns) / (np.std(returns) + 1e-9)) * np.sqrt(252 * 24 * 60) # Scaled for minute data
            
            # 3. Win Rate from trade_history
            trades = env.envs[0].trade_history
            pnl_trades = [t['pnl'] for t in trades if 'pnl' in t]
            win_rate = (len([p for p in pnl_trades if p > 0]) / len(pnl_trades)) * 100 if pnl_trades else 0
            
            rl_metrics = {
                "total_return_pct": float(total_return),
                "win_rate": float(win_rate),
                "sharpe_ratio": float(sharpe),
                "trades_count": int(len(pnl_trades)),
                "net_profit": float(equity[-1] - initial_balance)
            }
            add_log(f"[METRICS] {json.dumps(rl_metrics)}")
        
        return model, model_path
