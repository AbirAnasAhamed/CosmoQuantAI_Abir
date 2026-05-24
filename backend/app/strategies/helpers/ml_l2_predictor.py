import os
import joblib
import torch
import torch.nn as nn
import numpy as np
import logging
import warnings

# Suppress sklearn feature names warning
warnings.filterwarnings("ignore", message="X does not have valid feature names")

from app.db.session import SessionLocal
from app.models.ml_model import CustomMLModel, ModelVersion
from app.services.ml_architectures import SimpleLSTM, SimpleGRU, CNN1D, DeepLOB, TimeSeriesTransformer

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

            # Use .zip for PPO
            if self.model_type == "PPO-RL":
                file_path = file_path.replace(".pkl", ".zip").replace(".pt", ".zip")

            if not os.path.exists(file_path):
                logger.error(f"MLL2Predictor: Model file not found at {file_path}")
                return

            logger.info(f"🤖 Loading L2 AI Model {self.model_type} from {file_path}...")
            
            # Attempt to load metadata (features list)
            self.model_features = None
            metadata_path = file_path.replace(".zip", ".json").replace(".pkl", ".json").replace(".pt", ".json")
            if os.path.exists(metadata_path):
                import json
                try:
                    with open(metadata_path, "r") as f:
                        meta = json.load(f)
                        self.model_features = meta.get("features")
                except Exception as e:
                    logger.warning(f"MLL2Predictor: Failed to load metadata: {e}")

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
            elif self.model_type == "PPO-RL":
                try:
                    from stable_baselines3 import PPO
                    self.model = PPO.load(file_path)
                    self.is_loaded = True
                except Exception as e:
                    logger.error(f"MLL2Predictor: Error loading PPO-RL model: {e}")
                    self.model = None

            if self.is_loaded:
                logger.info(f"✅ L2 AI Model {self.model_type} loaded successfully.")
                
        except Exception as e:
            logger.error(f"MLL2Predictor: Failed to load model: {e}")
        finally:
            db.close()

    def predict(self, orderbook, current_price, target_side) -> bool:
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
                if best_bid >= self._prev_bb_p: e_b = best_bid_v
                elif best_bid == self._prev_bb_p: e_b = best_bid_v - self._prev_bb_v
                else: e_b = -self._prev_bb_v

                if best_ask <= self._prev_ba_p: e_a = best_ask_v
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
                features_list = [calculated_features.get(f, 0.0) for f in self.model_features]
            else:
                features_list = [
                    obi, spread, microprice, ofi_acceleration, imbalance_momentum,
                    depth_ratio, cvd_proxy, multi_level_imb_top5
                ]

            # Dynamic padding to handle missing features or different model requirements (e.g. PPO-RL)
            expected_features = len(features_list)
            if hasattr(self.model, 'n_features_in_'):
                expected_features = self.model.n_features_in_
            elif hasattr(self.model, 'observation_space'):
                expected_features = self.model.observation_space.shape[0]

            if expected_features > len(features_list):
                if not self._feature_mismatch_logged:
                    logger.warning(
                        f"MLL2Predictor: Model expects {expected_features} features, but L2 provides "
                        f"{len(features_list)}. Padding with zeros. "
                    )
                    self._feature_mismatch_logged = True
                features_list.extend([0.0] * (expected_features - len(features_list)))
            elif expected_features < len(features_list):
                features_list = features_list[:expected_features]
                        
            features = np.array(features_list).reshape(1, -1)

            # 2. Predict
            if self.model_type in ["Random Forest", "XGBoost", "LightGBM", "CatBoost"]:
                pred = self.model.predict(features)[0]
            elif self.model_type in ["LSTM", "GRU"]:
                X_t = torch.FloatTensor(features).unsqueeze(1)
                with torch.no_grad():
                    pred = self.model(X_t).item()
            elif self.model_type in ["1D-CNN", "DeepLOB", "Transformer"]:
                X_t = torch.FloatTensor(features)
                with torch.no_grad():
                    pred = self.model(X_t).item()
            elif self.model_type == "PPO-RL":
                action, _ = self.model.predict(features[0].astype(np.float32), deterministic=True)
                # action: 1 = Buy/Up, 0 = Sell/Down
                pred = 1.0 if action == 1 else 0.0
            else:
                return True

            # 3. Interpret Prediction
            is_bullish = False
            
            if self.prediction_target == "classification":
                is_bullish = (pred > 0.5)
            else:
                is_bullish = (pred > current_price)

            logger.info(f"🤖 MLL2Predictor: Target={target_side.upper()}, Bullish={is_bullish}, Pred={pred:.4f}")

            normalized_side = target_side.lower()
            is_long = normalized_side in ("long", "buy")
            if is_long:
                return is_bullish
            else:
                return not is_bullish

        except Exception as e:
            logger.error(f"MLL2Predictor: Prediction error: {e}")
            return True # Fail open
