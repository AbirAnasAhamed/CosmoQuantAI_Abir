import os
import joblib
import torch
import torch.nn as nn
import numpy as np
import pandas as pd
import logging
import warnings

# Suppress sklearn feature names warning
warnings.filterwarnings("ignore", message="X does not have valid feature names")

from app.db.session import SessionLocal
from app.models.ml_model import CustomMLModel, ModelVersion
from app.services.ml_architectures import SimpleLSTM, SimpleGRU, CNN1D, DeepLOB, TimeSeriesTransformer
from app.services.auto_feature_selector import calculate_l2_advanced_features

logger = logging.getLogger(__name__)

class MLL2Predictor:
    """
    Standalone predictor for Custom L2 Machine Learning Models.
    Used by WallHunter to validate entry triggers.
    """
    def __init__(self, ai_model_id: str):
        self.ai_model_id = ai_model_id
        self.model = None
        self.model_type = None
        self.prediction_target = "classification"  # default
        self.is_loaded = False
        self._feature_mismatch_logged = False  # throttle warning — log once only
        self._load_model()

        # State for stateful features (OFI, CVD need previous tick)
        self._prev_bb_p = None
        self._prev_bb_v = None
        self._prev_ba_p = None
        self._prev_ba_v = None
        self._cumulative_ofi = 0.0
        self._ofi_prev = 0.0
        self._prev_level1_imb = 0.5
        self._last_log_time = 0.0
        self.bg_engine = None
        self.l2_history = []
        self.bullish_threshold = 0.5
        self.bearish_threshold = 0.5
        self.scaler = None
        self._dynamic_features_history = []
        self.last_features_list = []
        self.sequence_length = 15
        self._feature_sequence = []

    async def start_background_engine(self, symbol: str):
        """Starts the background engine if complex features are needed."""
        if not self.model_features:
            return
        from app.strategies.helpers.background_feature_engine import BackgroundFeatureEngine
        self.bg_engine = BackgroundFeatureEngine(symbol, self.model_features)
        await self.bg_engine.start()

    async def stop_background_engine(self):
        """Stops the background engine if running."""
        if self.bg_engine:
            await self.bg_engine.stop()

    def _load_model(self):
        if not self.ai_model_id:
            logger.error("MLL2Predictor: No ai_model_id provided.")
            return

        db = SessionLocal()
        try:
            db_model = db.query(CustomMLModel).filter(CustomMLModel.id == self.ai_model_id).first()
            if not db_model or not db_model.active_version_id:
                logger.error(f"MLL2Predictor: Model {self.ai_model_id} not found or has no active version.")
                return

            db_version = db.query(ModelVersion).filter(ModelVersion.id == db_model.active_version_id).first()
            if not db_version:
                logger.error(f"MLL2Predictor: Active version {db_model.active_version_id} not found.")
                return

            self.model_type = db_model.model_type
            file_path = db_version.file_path
            
            # L2 Predictor defaults to classification for spoofing detection
            self.prediction_target = "classification"

            # Use .zip for RL models
            if self.model_type in ["PPO-RL", "SAC-RL", "A2C-RL", "DQN-RL"]:
                file_path = file_path.replace(".pkl", ".zip").replace(".pt", ".zip")

            if not os.path.exists(file_path):
                logger.error(f"MLL2Predictor: Model file not found at {file_path}")
                return

            logger.info(f"🤖 Loading L2 AI Model {self.model_type} from {file_path}...")
            
            # Attempt to load metadata (features list and prediction target)
            self.model_features = None
            metadata_path = file_path.replace(".zip", ".json").replace(".pkl", ".json").replace(".pt", ".json")
            if os.path.exists(metadata_path):
                import json
                try:
                    with open(metadata_path, "r") as f:
                        meta = json.load(f)
                        self.model_features = meta.get("features")
                        # Override prediction target if specified in metadata
                        if "prediction_target" in meta:
                            self.prediction_target = meta.get("prediction_target")
                        elif "target_type" in meta:
                            self.prediction_target = meta.get("target_type")
                except Exception as e:
                    logger.warning(f"MLL2Predictor: Failed to load metadata: {e}")

            # Attempt to load scaler
            model_dir = os.path.dirname(file_path)
            scaler_path = os.path.join(model_dir, "scaler.pkl")
            if os.path.exists(scaler_path):
                try:
                    self.scaler = joblib.load(scaler_path)
                    logger.info(f"MLL2Predictor: Scaler loaded successfully from {scaler_path}.")
                except Exception as e:
                    logger.warning(f"MLL2Predictor: Failed to load scaler: {e}")

            if self.model_type in ["Random Forest", "XGBoost", "LightGBM", "CatBoost"]:
                self.model = joblib.load(file_path)
                self.is_loaded = True
            elif self.model_type in ["LSTM", "GRU", "1D-CNN", "DeepLOB", "Transformer"]:
                # Determine input size
                input_size = len(self.model_features) if self.model_features else 3
                
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
                    self.is_loaded = True
                except Exception as e:
                    logger.error(f"MLL2Predictor: Error loading {self.model_type} state_dict: {e}. Feature count might not match.")
                    self.model = None
            elif self.model_type in ["PPO-RL", "SAC-RL", "A2C-RL", "DQN-RL"]:
                try:
                    from stable_baselines3 import PPO, SAC, A2C, DQN
                    loaded = False
                    algos = {"PPO-RL": PPO, "SAC-RL": SAC, "A2C-RL": A2C, "DQN-RL": DQN}
                    preferred_algo = algos.get(self.model_type)
                    
                    # Try preferred first, then others if user selected wrong type
                    for algo in [preferred_algo] + [a for a in algos.values() if a != preferred_algo]:
                        try:
                            self.model = algo.load(file_path)
                            self.is_loaded = True
                            loaded = True
                            break
                        except Exception:
                            continue
                            
                    if not loaded:
                        logger.error(f"MLL2Predictor: Error loading {self.model_type} model with any SB3 algorithm.")
                        self.model = None
                except Exception as e:
                    logger.error(f"MLL2Predictor: Error loading {self.model_type} model module: {e}")
                    self.model = None

            if self.is_loaded:
                logger.info(f"✅ L2 AI Model {self.model_type} loaded successfully.")
                
        except Exception as e:
            logger.error(f"MLL2Predictor: Failed to load model: {e}")
        finally:
            db.close()

    def update_l2_memory(self, orderbook):
        """Continuously maintains L2 history for advanced feature calculation."""
        import datetime
        bids_raw = orderbook.get('bids', [])[:20]
        asks_raw = orderbook.get('asks', [])[:20]

        if not bids_raw or not asks_raw:
            return

        bids = [[float(x[0]), float(x[1])] for x in bids_raw if len(x) >= 2]
        asks = [[float(x[0]), float(x[1])] for x in asks_raw if len(x) >= 2]

        if not bids or not asks:
            return

        best_bid = bids[0][0]
        best_ask = asks[0][0]
        best_bid_v = bids[0][1]
        best_ask_v = asks[0][1]

        bid_vol_10 = sum(x[1] for x in bids[:10])
        ask_vol_10 = sum(x[1] for x in asks[:10])
        total_vol_10 = bid_vol_10 + ask_vol_10

        obi = bid_vol_10 / (total_vol_10 + 1e-9)
        spread = (best_ask - best_bid) / (best_bid + 1e-9)
        
        if total_vol_10 > 0:
            microprice = ((bid_vol_10 * best_ask) + (ask_vol_10 * best_bid)) / total_vol_10
        else:
            microprice = (best_bid + best_ask) / 2

        # Advanced Continuous OFI State Tracking
        if self._prev_bb_p is not None:
            if best_bid > self._prev_bb_p: e_b = best_bid_v
            elif best_bid == self._prev_bb_p: e_b = best_bid_v - self._prev_bb_v
            else: e_b = -self._prev_bb_v

            if best_ask < self._prev_ba_p: e_a = best_ask_v
            elif best_ask == self._prev_ba_p: e_a = best_ask_v - self._prev_ba_v
            else: e_a = -self._prev_ba_v

            ofi = e_b - e_a
        else:
            ofi = 0.0

        ofi_acceleration = ofi - self._ofi_prev
        level1_imb = best_bid_v / (best_bid_v + best_ask_v + 1e-9)
        imbalance_momentum = level1_imb - self._prev_level1_imb
        self._cumulative_ofi += ofi

        self._prev_bb_p = best_bid
        self._prev_bb_v = best_bid_v
        self._prev_ba_p = best_ask
        self._prev_ba_v = best_ask_v
        self._ofi_prev = ofi
        self._prev_level1_imb = level1_imb

        self.l2_history.append({
            "timestamp": datetime.datetime.utcnow(),
            "Close": microprice,
            "bids": bids,
            "asks": asks,
            "obi": obi,
            "spread": spread,
            "microprice": microprice,
            "ofi": ofi,
            "ofi_acceleration": ofi_acceleration,
            "imbalance_momentum": imbalance_momentum,
            "cvd_proxy": self._cumulative_ofi
        })
        
        # Keep rolling window of 15 ticks
        if len(self.l2_history) > 15:
            self.l2_history.pop(0)

    def predict(self, orderbook: dict, current_price: float, side: str) -> bool:
        """
        Validates if the target_side (long/short) aligns with the AI's prediction.
        Returns True if valid, False if rejected by AI.
        target_side: "long" | "short"
        """
        if not self.is_loaded or self.model is None:
            logger.warning("MLL2Predictor: Model is not loaded. Allowing trade by default.")
            return True

        try:
            # 1. Extract L2 Features — all 8 training features
            bids_raw = orderbook.get('bids', [])[:20]
            asks_raw = orderbook.get('asks', [])[:20]

            if not bids_raw or not asks_raw:
                logger.warning("MLL2Predictor: Missing bids/asks in orderbook. Skipping AI filter.")
                return True

            bids = [[float(x[0]), float(x[1])] for x in bids_raw if len(x) >= 2]
            asks = [[float(x[0]), float(x[1])] for x in asks_raw if len(x) >= 2]

            best_bid = bids[0][0]
            best_bid_v = bids[0][1]
            best_ask = asks[0][0]
            best_ask_v = asks[0][1]

            bid_vol_10 = sum(x[1] for x in bids[:10])
            ask_vol_10 = sum(x[1] for x in asks[:10])
            total_vol_10 = bid_vol_10 + ask_vol_10
            bid_vol_5 = sum(x[1] for x in bids[:5])
            ask_vol_5 = sum(x[1] for x in asks[:5])
            total_vol_5 = bid_vol_5 + ask_vol_5

            bid_vol_all = sum(x[1] for x in bids)
            ask_vol_all = sum(x[1] for x in asks)

            obi = bid_vol_10 / (total_vol_10 + 1e-9)
            spread = (best_ask - best_bid) / (best_bid + 1e-9)
            total_vol = bid_vol_10 + ask_vol_10
            if total_vol > 0:
                microprice = ((bid_vol_10 * best_ask) + (ask_vol_10 * best_bid)) / total_vol
            else:
                microprice = (best_bid + best_ask) / 2

            if self._prev_bb_p is not None:
                if best_bid > self._prev_bb_p: e_b = best_bid_v
                elif best_bid == self._prev_bb_p: e_b = best_bid_v - self._prev_bb_v
                else: e_b = -self._prev_bb_v

                if best_ask < self._prev_ba_p: e_a = best_ask_v
                elif best_ask == self._prev_ba_p: e_a = best_ask_v - self._prev_ba_v
                else: e_a = -self._prev_ba_v

                ofi = e_b - e_a
            else:
                ofi = 0.0
            ofi_acceleration = ofi - self._ofi_prev

            level1_imb = best_bid_v / (best_bid_v + best_ask_v + 1e-9)
            imbalance_momentum = level1_imb - self._prev_level1_imb
            depth_ratio = bid_vol_all / (ask_vol_all + 1e-9)
            self._cumulative_ofi += ofi
            cvd_proxy = self._cumulative_ofi
            multi_level_imb_top5 = bid_vol_5 / (total_vol_5 + 1e-9)

            self._prev_bb_p = best_bid
            self._prev_bb_v = best_bid_v
            self._prev_ba_p = best_ask
            self._prev_ba_v = best_ask_v
            self._ofi_prev = ofi
            self._prev_level1_imb = level1_imb

            if self.model_features:
                calculated_features = {
                    "obi": obi, "spread": spread, "microprice": microprice,
                    "ofi_acceleration": ofi_acceleration, "imbalance_momentum": imbalance_momentum,
                    "depth_ratio": depth_ratio, "cvd_proxy": cvd_proxy,
                    "multi_level_imb_top5": multi_level_imb_top5, "Close": microprice
                }
                
                # Fetch background features if available
                bg_features = {}
                if self.bg_engine:
                    bg_features = self.bg_engine.get_latest_features()
                    
                # Advanced L2 Features integration
                adv_l2_features = {}
                if getattr(self, 'model_features', None) and any("WAP" in f or "Distance" in f or "Proxy" in f for f in self.model_features):
                    if len(self.l2_history) >= 2:
                        df_hist = pd.DataFrame(self.l2_history)
                        try:
                            df_adv, _ = calculate_l2_advanced_features(df_hist)
                            if not df_adv.empty:
                                adv_l2_features = df_adv.iloc[-1].to_dict()
                        except Exception as e:
                            import traceback
                            logger.error(f"MLL2Predictor Adv L2 Error: {e}\n{traceback.format_exc()}")

                # Merge: L2 calculated takes precedence over background for overlapping ones
                merged_features = {**bg_features, **calculated_features, **adv_l2_features}
                
                features_list = [merged_features.get(f, 0.0) for f in self.model_features]
                
                # Calculate feature health (non-zero features)
                # We only consider it missing if it's not in merged_features or if it's NaN. 
                # Legitimate 0.0 values (like false boolean flags) are counted as active.
                self.last_active_features = sum(1 for f in self.model_features if f in merged_features and not pd.isna(merged_features[f]))
                self.total_model_features = len(self.model_features)
            else:
                features_list = [
                    obi, spread, microprice, ofi_acceleration, imbalance_momentum,
                    depth_ratio, cvd_proxy, multi_level_imb_top5
                ]
                self.last_active_features = 8
                self.total_model_features = 8

            # Dynamic padding to handle missing features or different model requirements (e.g. PPO-RL)
            expected_features = len(features_list)
            if hasattr(self.model, 'n_features_in_'):
                expected_features = self.model.n_features_in_
            elif hasattr(self.model, 'observation_space'):
                expected_features = self.model.observation_space.shape[0]

            if expected_features > len(features_list):
                missing_count = expected_features - len(features_list)
                if missing_count > 10:
                    if not self._feature_mismatch_logged:
                        logger.error(
                            f"MLL2Predictor: Severe feature mismatch! Model expects {expected_features} features, "
                            f"but L2 provides {len(features_list)}. Missing metadata (.json)? "
                            "Failing open to prevent garbage predictions."
                        )
                        self._feature_mismatch_logged = True
                    raise ValueError(f"Too many missing features ({missing_count}). Cannot predict reliably.")
                
                if not self._feature_mismatch_logged:
                    logger.warning(
                        f"MLL2Predictor: Model expects {expected_features} features, but L2 provides "
                        f"{len(features_list)}. Padding with last known or zeros. "
                    )
                    self._feature_mismatch_logged = True
                    
                if self.last_features_list and len(self.last_features_list) == expected_features:
                    features_list.extend(self.last_features_list[len(features_list):])
                else:
                    features_list.extend([0.0] * missing_count)
            elif expected_features < len(features_list):
                features_list = features_list[:expected_features]
                
            self.last_features_list = features_list.copy()
                        
            features = np.array(features_list).reshape(1, -1)
            
            # Apply feature scaling
            if self.scaler is not None:
                features = self.scaler.transform(features)
                features = np.nan_to_num(features, nan=0.0)
                features = np.clip(features, -10.0, 10.0)
            elif self.model_type not in ["Random Forest", "XGBoost", "LightGBM", "CatBoost"]:
                # Dynamic scaling fallback for NNs/RL without saved scaler
                self._dynamic_features_history.append(features_list)
                if len(self._dynamic_features_history) > 1000:
                    self._dynamic_features_history.pop(0)
                if len(self._dynamic_features_history) > 1:
                    hist_arr = np.array(self._dynamic_features_history)
                    mean = np.mean(hist_arr, axis=0)
                    std = np.std(hist_arr, axis=0)
                    std[std == 0] = 1.0 # prevent div by zero
                    features = (features - mean) / std
                    features = np.nan_to_num(features, nan=0.0)
                    features = np.clip(features, -10.0, 10.0)

            # Maintain sequence buffer for sequence-based models
            self._feature_sequence.append(features[0])
            if len(self._feature_sequence) > self.sequence_length:
                self._feature_sequence.pop(0)
                
            seq_features = np.array(self._feature_sequence)
            if len(seq_features) < self.sequence_length:
                pad_length = self.sequence_length - len(seq_features)
                padding = np.tile(seq_features[0], (pad_length, 1))
                seq_features = np.vstack([padding, seq_features])

            # 2. Predict
            if self.model_type in ["Random Forest", "XGBoost", "LightGBM", "CatBoost"]:
                if self.prediction_target == "classification" and hasattr(self.model, "predict_proba"):
                    try:
                        pred = float(self.model.predict_proba(features)[0][1])
                    except Exception:
                        pred = float(self.model.predict(features)[0])
                else:
                    pred = float(self.model.predict(features)[0])
            elif self.model_type in ["LSTM", "GRU"]:
                X_t = torch.FloatTensor(seq_features).unsqueeze(0) # (1, seq_len, num_features)
                with torch.no_grad():
                    pred = self.model(X_t).item()
            elif self.model_type in ["1D-CNN", "DeepLOB", "Transformer"]:
                X_t = torch.FloatTensor(seq_features).unsqueeze(0) # (1, seq_len, num_features)
                with torch.no_grad():
                    pred = self.model(X_t).item()
            elif self.model_type in ["PPO-RL", "SAC-RL", "A2C-RL", "DQN-RL"]:
                action, _ = self.model.predict(features[0].astype(np.float32), deterministic=True)
                
                # Handle both array and scalar action outputs
                if isinstance(action, np.ndarray):
                    val = action.item() if action.size == 1 else action[0]
                else:
                    val = action
                    
                # Handle continuous vs discrete action spaces
                if hasattr(self.model, 'action_space') and type(self.model.action_space).__name__ == 'Box':
                    # Continuous action space: > 0.33 means Buy, < -0.33 means Sell, else Neutral
                    if val > 0.33:
                        pred = 1.0
                    elif val < -0.33:
                        pred = 0.0
                    else:
                        pred = 0.5
                else:
                    # Discrete action space: 1 = Buy, 2 = Sell, 0 = Neutral
                    if val == 1:
                        pred = 1.0
                    elif val == 2:
                        pred = 0.0
                    else:
                        pred = 0.5
            else:
                return True

            # 3. Interpret Prediction
            is_bullish = False
            self.last_prediction_score = float(pred)
            
            import time
            if time.time() - self._last_log_time > 10.0:
                logger.info(f"🤖 MLL2Predictor: Target={side.upper()}, Pred={pred:.4f}")
                self._last_log_time = time.time()

            if self.prediction_target == "classification" or self.model_type in ["PPO-RL", "SAC-RL", "A2C-RL", "DQN-RL"]:
                is_long = (side.lower() in ("long", "buy"))
                if is_long:
                    return pred > self.bullish_threshold
                else:
                    # If user sets Bearish Threshold to 60% (0.6), they want > 60% bearish confidence.
                    # Since pred is bullish probability, bearish probability is (1 - pred).
                    # We need (1 - pred) > threshold => pred < (1 - threshold)
                    return pred < (1.0 - self.bearish_threshold)
            else:
                is_bullish = (pred > current_price)
                is_long = (side.lower() in ("long", "buy"))
                if is_long:
                    return is_bullish
                else:
                    return not is_bullish

        except Exception as e:
            logger.error(f"MLL2Predictor: Prediction error: {e}")
            return True # Fail open
