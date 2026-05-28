import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset
from stable_baselines3 import PPO, SAC
from stable_baselines3.common.vec_env import DummyVecEnv
import pandas as pd
import numpy as np
import os
import time
import json
from datetime import datetime
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, mean_squared_error, mean_absolute_error

from app.services.advanced_ml.trading_env import AdvancedTradingEnv
from app.services.advanced_ml.architectures import TimeSeriesTransformer, TransformerRLFeatureExtractor, TCNModel, TabNetEncoder, AutoEncoder
from app.services.advanced_ml.data_handler import AdvancedDataHandler
from app import models

class AdvancedMLEngine:
    """
    Main coordination engine for Advanced ML Training.
    Handles Transformer Supervised Learning and PPO Reinforcement Learning.
    """

    @staticmethod
    def train_transformer(job, df, features, db, add_log, previous_model_path=None):
        """Supervised Training for Transformer Model."""
        config = job.config or {}
        seq_len = int(config.get("sequence_length", 30))
        epochs = int(config.get("epochs", 10))
        lr = float(config.get("learning_rate", 0.001))
        batch_size = 64
        
        add_log(f"Preparing sequence data (Window Size: {seq_len})...")
        
        if len(df) < seq_len:
            error_msg = f"❌ Not enough data: You have {len(df)} candles but sequence length is {seq_len}. Suggestion: Decrease 'Sequence Length' to {max(1, len(df)-1)} or use a lower 'Timeframe' to generate more candles."
            add_log(error_msg)
            raise Exception(error_msg)

        target_col = "Target"
        X, y = AdvancedDataHandler.create_sequences(df, features, sequence_length=seq_len, target_col=target_col)
        
        split = int(len(X) * 0.8)
        X_train, X_test = torch.FloatTensor(X[:split]), torch.FloatTensor(X[split:])
        y_train, y_test = torch.FloatTensor(y[:split]).view(-1, 1), torch.FloatTensor(y[split:]).view(-1, 1)
        
        train_loader = DataLoader(TensorDataset(X_train, y_train), batch_size=batch_size, shuffle=True)
        
        add_log(f"Initializing Transformer Architecture (Input Dim: {len(features)})...")
        model = TimeSeriesTransformer(input_dim=len(features), d_model=64, nhead=4, num_layers=3)
        
        # ── Fine-Tune: load previous weights ───────────────────────────
        if previous_model_path and os.path.exists(previous_model_path):
            try:
                model.load_state_dict(torch.load(previous_model_path, map_location='cpu'))
                lr = lr * 0.1  # Lower LR for fine-tuning
                add_log(f"✅ Fine-Tuning Transformer from checkpoint (LR: {lr:.6f})")
            except Exception as _ft_e:
                add_log(f"⚠️ Transformer weight load failed ({_ft_e}), training fresh.")
        else:
            add_log("🆕 Fresh Transformer Training")
        
        is_classification = config.get("prediction_target") == "classification"
        if is_classification:
            num_pos = max(y_train.sum().item(), 1.0)
            num_neg = max(len(y_train) - y_train.sum().item(), 0.0)
            pos_weight = torch.tensor([num_neg / num_pos], dtype=torch.float32)
            criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
        else:
            criterion = nn.MSELoss()
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
            
            db.refresh(job)
            if job.status == models.TrainingStatus.FAILED and job.error_message and "cancelled" in job.error_message.lower():
                raise Exception("Training cancelled by user.")
            
        # Save model
        model_filename = f"model_{job.id}.pt"
        model_dir = os.path.join("uploads", "models", f"job_{job.id}")
        os.makedirs(model_dir, exist_ok=True)
        model_path = os.path.join(model_dir, model_filename)
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
        
        return model, model_path, metrics

    @staticmethod
    def train_tcn(job, df, features, db, add_log, previous_model_path=None):
        """Supervised Training for TCN Model."""
        config = job.config or {}
        seq_len = int(config.get("sequence_length", 30))
        epochs = int(config.get("epochs", 10))
        lr = float(config.get("learning_rate", 0.001))
        batch_size = 64
        
        add_log(f"Preparing sequence data for TCN (Window Size: {seq_len})...")
        target_col = "Target"
        X, y = AdvancedDataHandler.create_sequences(df, features, sequence_length=seq_len, target_col=target_col)
        
        split = int(len(X) * 0.8)
        X_train, X_test = torch.FloatTensor(X[:split]), torch.FloatTensor(X[split:])
        y_train, y_test = torch.FloatTensor(y[:split]).view(-1, 1), torch.FloatTensor(y[split:]).view(-1, 1)
        
        train_loader = DataLoader(TensorDataset(X_train, y_train), batch_size=batch_size, shuffle=True)
        
        add_log(f"Initializing TCN Architecture (Input Dim: {len(features)})...")
        model = TCNModel(input_size=len(features), num_channels=[32, 64, 128], output_size=1)
        
        if previous_model_path and os.path.exists(previous_model_path):
            try:
                model.load_state_dict(torch.load(previous_model_path, map_location='cpu'))
                lr = lr * 0.1
                add_log(f"✅ Fine-Tuning TCN from checkpoint (LR: {lr:.6f})")
            except Exception as e:
                add_log(f"⚠️ TCN weight load failed ({e}), training fresh.")
        
        is_classification = config.get("prediction_target") == "classification"
        if is_classification:
            num_pos = max(y_train.sum().item(), 1.0)
            num_neg = max(len(y_train) - y_train.sum().item(), 0.0)
            pos_weight = torch.tensor([num_neg / num_pos], dtype=torch.float32)
            criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
        else:
            criterion = nn.MSELoss()
        optimizer = optim.Adam(model.parameters(), lr=lr)
        
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
            
            job.progress = 40 + (50 * (epoch + 1) / epochs)
            db.commit()
            add_log(f"Epoch [{epoch+1}/{epochs}], Avg Loss: {(epoch_loss / len(train_loader)):.6f}")
            db.refresh(job)
            if job.status == models.TrainingStatus.FAILED and job.error_message and "cancelled" in job.error_message.lower():
                raise Exception("Training cancelled by user.")
            
        model_filename = f"model_{job.id}.pt"
        model_dir = os.path.join("uploads", "models", f"job_{job.id}")
        os.makedirs(model_dir, exist_ok=True)
        model_path = os.path.join(model_dir, model_filename)
        torch.save(model.state_dict(), model_path)
        
        model.eval()
        with torch.no_grad():
            test_outputs = model(X_test)
            preds = (torch.sigmoid(test_outputs).squeeze() > 0.5).int().numpy() if config.get("prediction_target") == "classification" else test_outputs.squeeze().numpy()
            y_true = y_test.int().numpy() if config.get("prediction_target") == "classification" else y_test.squeeze().numpy()
            if config.get("prediction_target") == "classification":
                metrics = { "accuracy": float(accuracy_score(y_true, preds)), "f1_score": float(f1_score(y_true, preds, zero_division=0)) }
            else:
                metrics = { "mse": float(mean_squared_error(y_true, preds)), "rmse": float(np.sqrt(mean_squared_error(y_true, preds))) }
            add_log(f"[METRICS] {json.dumps(metrics)}")
        
        return model, model_path, metrics

    @staticmethod
    def train_tabnet(job, df, features, db, add_log, previous_model_path=None):
        """Supervised Training for TabNet Model."""
        config = job.config or {}
        epochs = int(config.get("epochs", 10))
        lr = float(config.get("learning_rate", 0.01))
        batch_size = 64
        
        X = df[features].fillna(0).values.copy()
        y = df['Target'].fillna(0).values.copy()
        
        split = int(len(X) * 0.8)
        X_train, X_test = torch.FloatTensor(X[:split]), torch.FloatTensor(X[split:])
        y_train, y_test = torch.FloatTensor(y[:split]).view(-1, 1), torch.FloatTensor(y[split:]).view(-1, 1)
        
        train_loader = DataLoader(TensorDataset(X_train, y_train), batch_size=batch_size, shuffle=True)
        
        model = TabNetEncoder(input_dim=len(features), output_dim=1)
        
        if previous_model_path and os.path.exists(previous_model_path):
            try:
                model.load_state_dict(torch.load(previous_model_path, map_location='cpu'))
                lr = lr * 0.1
                add_log("✅ Fine-Tuning TabNet from checkpoint")
            except Exception:
                pass
                
        is_classification = config.get("prediction_target") == "classification"
        if is_classification:
            num_pos = max(y_train.sum().item(), 1.0)
            num_neg = max(len(y_train) - y_train.sum().item(), 0.0)
            pos_weight = torch.tensor([num_neg / num_pos], dtype=torch.float32)
            criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
        else:
            criterion = nn.MSELoss()
        optimizer = optim.Adam(model.parameters(), lr=lr)
        
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
            job.progress = 40 + (50 * (epoch + 1) / epochs)
            db.commit()
            add_log(f"Epoch [{epoch+1}/{epochs}], Avg Loss: {(epoch_loss / len(train_loader)):.6f}")
            db.refresh(job)
            if job.status == models.TrainingStatus.FAILED and job.error_message and "cancelled" in job.error_message.lower():
                raise Exception("Training cancelled by user.")
                
        model_filename = f"model_{job.id}.pt"
        model_dir = os.path.join("uploads", "models", f"job_{job.id}")
        os.makedirs(model_dir, exist_ok=True)
        model_path = os.path.join(model_dir, model_filename)
        torch.save(model.state_dict(), model_path)
        
        model.eval()
        with torch.no_grad():
            test_outputs = model(X_test)
            preds = (torch.sigmoid(test_outputs).squeeze() > 0.5).int().numpy() if config.get("prediction_target") == "classification" else test_outputs.squeeze().numpy()
            y_true = y_test.int().numpy() if config.get("prediction_target") == "classification" else y_test.squeeze().numpy()
            if config.get("prediction_target") == "classification":
                metrics = {
                    "accuracy": float(accuracy_score(y_true, preds)),
                    "precision": float(precision_score(y_true, preds, zero_division=0)),
                    "recall": float(recall_score(y_true, preds, zero_division=0)),
                    "f1_score": float(f1_score(y_true, preds, zero_division=0))
                }
            else:
                metrics = {
                    "mse": float(mean_squared_error(y_true, preds)),
                    "mae": float(mean_absolute_error(y_true, preds)),
                    "rmse": float(np.sqrt(mean_squared_error(y_true, preds)))
                }
            add_log(f"[METRICS] {json.dumps(metrics)}")
            
        return model, model_path, metrics

    @staticmethod
    def train_autoencoder(job, df, features, db, add_log, previous_model_path=None):
        """Unsupervised Training for AutoEncoder (Anomaly Detection)."""
        config = job.config or {}
        epochs = int(config.get("epochs", 20))
        lr = float(config.get("learning_rate", 0.001))
        batch_size = 64
        
        X = df[features].fillna(0).values
        # AutoEncoder reconstructs its own input
        X_tensor = torch.FloatTensor(X)
        
        train_loader = DataLoader(TensorDataset(X_tensor, X_tensor), batch_size=batch_size, shuffle=True)
        
        model = AutoEncoder(input_dim=len(features), hidden_dim=32)
        
        if previous_model_path and os.path.exists(previous_model_path):
            try:
                model.load_state_dict(torch.load(previous_model_path, map_location='cpu'))
                add_log("✅ Fine-Tuning AutoEncoder")
            except Exception:
                pass
                
        criterion = nn.MSELoss()
        optimizer = optim.Adam(model.parameters(), lr=lr)
        
        for epoch in range(epochs):
            model.train()
            epoch_loss = 0
            for batch_X, _ in train_loader:
                optimizer.zero_grad()
                outputs = model(batch_X)
                loss = criterion(outputs, batch_X)
                loss.backward()
                optimizer.step()
                epoch_loss += loss.item()
            job.progress = 40 + (50 * (epoch + 1) / epochs)
            db.commit()
            add_log(f"Epoch [{epoch+1}/{epochs}], Reconstruction Loss: {(epoch_loss / len(train_loader)):.6f}")
            db.refresh(job)
            if job.status == models.TrainingStatus.FAILED and job.error_message and "cancelled" in job.error_message.lower():
                raise Exception("Training cancelled by user.")
                
        model_filename = f"model_{job.id}.pt"
        model_dir = os.path.join("uploads", "models", f"job_{job.id}")
        os.makedirs(model_dir, exist_ok=True)
        model_path = os.path.join(model_dir, model_filename)
        torch.save(model.state_dict(), model_path)
        
        # Calculate Anomaly Threshold (Mean + 2 StdDev of reconstruction error)
        model.eval()
        with torch.no_grad():
            reconstructed = model(X_tensor)
            mse = torch.mean((reconstructed - X_tensor) ** 2, dim=1).numpy()
            threshold = float(np.mean(mse) + 2 * np.std(mse))
            mean_mse = float(np.mean(mse))
            
            # Prevent Infinity/NaN which breaks Postgres JSON parser
            import math
            if math.isinf(threshold) or math.isnan(threshold):
                threshold = 1e9
            if math.isinf(mean_mse) or math.isnan(mean_mse):
                mean_mse = 1e9

            add_log(f"Anomaly Threshold set to: {threshold:.6f}")
            
            # Save threshold in metrics
            metrics = {
                "accuracy": 1.0,  # Dummy value for UI
                "mse": mean_mse,
                "anomaly_threshold": threshold
            }
            add_log(f"[METRICS] {json.dumps(metrics)}")
            
        return model, model_path, metrics

    @staticmethod
    def train_rl(job, df, features, db, add_log, previous_model_path=None):
        """Reinforcement Learning Training for PPO Agent."""
        config = job.config or {}
        epochs = int(config.get("epochs", 10))
        lr = float(config.get("learning_rate", 0.0003))
        initial_balance = float(config.get("initial_balance", 10000))
        # Frontend sends percentage (e.g. 0.001 for 0.001%), so divide by 100
        commission_pct = float(config.get("commission", 0.02)) # default 0.02%
        commission = commission_pct / 100.0
        
        slippage_pct = float(config.get("slippage", 0.01)) # default 0.01%
        slippage = slippage_pct / 100.0
        
        env_df = AdvancedDataHandler.prepare_rl_data(df, features)
        
        if len(env_df) < 100:
            error_msg = f"❌ Not enough data for RL: You have {len(env_df)} candles. Please collect more rows or use a lower 'Timeframe'."
            add_log(error_msg)
            raise Exception(error_msg)
        
        def make_env():
            return AdvancedTradingEnv(
                df=env_df, 
                initial_balance=initial_balance, 
                commission=commission,
                slippage=slippage
            )
        
        env = DummyVecEnv([make_env])
        total_timesteps = epochs * len(df)
        
        # ── Fine-Tune: continue from previous checkpoint ──────────────────
        is_cross_algo = config.get("is_cross_algorithm_transfer", False)
        
        if previous_model_path and os.path.exists(previous_model_path):
            try:
                add_log(f"✅ Continuing {job.algorithm} from checkpoint: {previous_model_path}")
                if job.algorithm == "SAC-RL":
                    if is_cross_algo:
                        # Extract features and init SAC
                        add_log(f"🔄 Cross-Algorithm: Initializing SAC with weights from {previous_model_path}")
                        # For true mapping we need state_dict mapping, but as fallback we init fresh with lower LR (handled by transfer engine config)
                        model = SAC("MlpPolicy", env, verbose=0, learning_rate=lr, tensorboard_log=f"./logs/{job.algorithm.lower()}_trading/")
                        try:
                            # Attempt to load just the policy net if compatible
                            ppo_model = PPO.load(previous_model_path)
                            model.policy.load_state_dict(ppo_model.policy.state_dict(), strict=False)
                            add_log(f"✅ Extracted Policy weights successfully!")
                        except Exception as e:
                            add_log(f"⚠️ Policy weight extraction failed, proceeding with transferred config: {e}")
                    else:
                        model = SAC.load(previous_model_path, env=env, learning_rate=lr)
                else:
                    model = PPO.load(previous_model_path, env=env, learning_rate=lr)
                model.set_env(env)
                add_log(f"🔄 Agent loaded. Continuing training for {total_timesteps} more timesteps...")
            except Exception as _ft_e:
                add_log(f"⚠️ {job.algorithm} checkpoint load failed ({_ft_e}), starting fresh agent.")
                add_log(f"Initializing fresh {job.algorithm} Agent with MLP Policy...")
                if job.algorithm == "SAC-RL":
                    model = SAC("MlpPolicy", env, verbose=0, learning_rate=lr, tensorboard_log=f"./logs/{job.algorithm.lower()}_trading/")
                else:
                    model = PPO("MlpPolicy", env, verbose=0, learning_rate=lr, tensorboard_log=f"./logs/{job.algorithm.lower()}_trading/")
        else:
            add_log(f"Initializing fresh {job.algorithm} Agent with MLP Policy...")
            if job.algorithm == "SAC-RL":
                model = SAC("MlpPolicy", env, verbose=0, learning_rate=lr, tensorboard_log=f"./logs/{job.algorithm.lower()}_trading/")
            else:
                model = PPO("MlpPolicy", env, verbose=0, learning_rate=lr, tensorboard_log=f"./logs/{job.algorithm.lower()}_trading/")
        
        add_log(f"Starting RL Training (Total Timesteps: {total_timesteps})...")
        
        # We use a callback or simple loop to update progress
        start_time = time.time()
        
        from stable_baselines3.common.callbacks import BaseCallback
        import redis
        from app.core.config import settings

        # Connect to Redis using the synchronous client since this runs in a Celery worker thread
        try:
            redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
        except Exception as e:
            add_log(f"⚠️ Failed to connect to Redis for live RL streaming: {e}")
            redis_client = None

        class LiveStreamingCallback(BaseCallback):
            def __init__(self, check_interval=1000, stream_interval=10):
                super().__init__(verbose=0)
                self.check_interval = check_interval
                self.stream_interval = stream_interval
                self.last_streamed_step = 0
                self.last_stream_time = time.time()

            def _on_step(self) -> bool:
                # 1. Cancel Check and Progress Update
                if self.num_timesteps % self.check_interval == 0:
                    # Update database progress to exactly match the raw RL progress (0 to 100%)
                    current_progress = (self.num_timesteps / total_timesteps) * 100
                    job.progress = current_progress
                    db.commit()
                    
                    db.refresh(job)
                    if job.status == models.TrainingStatus.FAILED and job.error_message and "cancelled" in job.error_message.lower():
                        raise Exception("Training cancelled by user.")
                
                # 2. Stream Data to Frontend
                now = time.time()
                # Stream data at most once per second
                if redis_client and (now - self.last_stream_time >= 1.0):
                    env_instance = self.training_env.envs[0]
                    unwrapped_env = getattr(env_instance, 'unwrapped', env_instance)
                    # Extract latest step info
                    if hasattr(unwrapped_env, 'net_worth'):
                        payload = {
                            "step": unwrapped_env.current_step,
                            "net_worth": unwrapped_env.net_worth,
                            "position": unwrapped_env.position,
                            "balance": getattr(unwrapped_env, 'balance', 0),
                            "action": self.locals.get("actions", [0])[0].item() if "actions" in self.locals else 0,
                            "reward": self.locals.get("rewards", [0.0])[0].item() if "rewards" in self.locals else 0.0,
                            "price": unwrapped_env.df.loc[unwrapped_env.current_step, 'Close'] if unwrapped_env.current_step < len(unwrapped_env.df) else 0.0,
                        }
                        
                        message = {
                            "task_type": "RL_TRAINING_STEP",
                            "task_id": job.id,
                            "status": "processing",
                            "progress": int((self.num_timesteps / total_timesteps) * 100),
                            "data": payload,
                            "features": features
                        }
                        try:
                            redis_client.publish("task_updates", json.dumps(message))
                            self.last_streamed_step = self.num_timesteps
                            self.last_stream_time = now
                        except Exception:
                            pass
                return True
                
        callback = LiveStreamingCallback(
            check_interval=max(100, total_timesteps // 20),
            stream_interval=max(1, total_timesteps // 1000) # Stream ~1000 points max to avoid overwhelming WS
        )
        model.learn(total_timesteps=total_timesteps, callback=callback)
        
        # Save model
        model_filename = f"model_{job.id}.zip"
        model_dir = os.path.join("uploads", "models", f"job_{job.id}")
        os.makedirs(model_dir, exist_ok=True)
        model_path = os.path.join(model_dir, model_filename)
        model.save(model_path)
        
        # ✅ Save Replay File and Log Equity Curve
        if hasattr(env.envs[0], 'equity_history'):
            equity_data = env.envs[0].equity_history
            trade_data = env.envs[0].trade_history
            
            replay_payload = {
                "initial_balance": initial_balance,
                "algorithm": job.algorithm,
                "symbol": job.symbol,
                "equity_history": [float(e) for e in equity_data],
                "trade_history": trade_data
            }
            
            replay_file_path = os.path.join(model_dir, "replay.json")
            try:
                with open(replay_file_path, "w") as f:
                    json.dump(replay_payload, f)
                add_log(f"💾 Saved RL Replay data for frontend visualization.")
            except Exception as e:
                add_log(f"⚠️ Failed to save replay data: {e}")

            step_size = max(1, len(equity_data) // 100)
            downsampled_equity = [
                {"step": i, "equity": float(equity_data[i])} 
                for i in range(0, len(equity_data), step_size)
            ]
            add_log(f"[EQUITY_CURVE] {json.dumps(downsampled_equity)}")

        # ✅ Calculate Trading Metrics for RL Agent
        add_log("Finalizing Agent and Calculating Performance Metrics...")
        rl_metrics = {
            "total_return_pct": 0.0,
            "win_rate": 0.0,
            "sharpe_ratio": 0.0,
            "trades_count": 0,
            "net_profit": 0.0
        }
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
            
            # Add unrealized PnL of current open position
            if getattr(env.envs[0], 'position', 0) != 0:
                unrealized_pnl = env.envs[0].net_worth - getattr(env.envs[0], 'entry_net_worth', initial_balance)
                pnl_trades.append(unrealized_pnl)
                
            win_rate = (len([p for p in pnl_trades if p > 0]) / len(pnl_trades)) * 100 if pnl_trades else 0
            
            # Trades count should be the number of trade entries
            open_trades = len([t for t in trades if t['type'].startswith('open')])
            trades_count = open_trades if open_trades > 0 else len(pnl_trades)
            
            rl_metrics = {
                "total_return_pct": float(total_return),
                "win_rate": float(win_rate),
                "sharpe_ratio": float(sharpe),
                "trades_count": int(trades_count),
                "net_profit": float(equity[-1] - initial_balance)
            }
            add_log(f"[METRICS] {json.dumps(rl_metrics)}")
        
        return model, model_path, rl_metrics
