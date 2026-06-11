import numpy as np
import pandas as pd

def apply_data_split(X, y, config, add_log):
    """
    Splits data based on the requested split_method (random, chronological, walk_forward).
    """
    split_method = config.get("split_method", "chronological")
    train_ratio = config.get("train_ratio", 80.0) / 100.0
    
    if split_method == "random":
        add_log(f"Applying Random Split (Train: {train_ratio*100:.0f}%)")
        from sklearn.model_selection import train_test_split
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, train_size=train_ratio, random_state=42, shuffle=True
        )
    elif split_method == "walk_forward":
        # Walk forward is typically handled at training loop level. For initial split, we act like chronological,
        # but log it explicitly. Walk-forward logic handles the rest internally.
        add_log(f"Applying Initial Walk-Forward Split (Train: {train_ratio*100:.0f}%)")
        split = int(len(X) * train_ratio)
        X_train, X_test = X[:split], X[split:]
        y_train, y_test = y[:split], y[split:]
    elif split_method == "purged_cv":
        purge_len = int(config.get("purge_length", 5))
        add_log(f"Applying Purged Cross-Validation Split (Train: {train_ratio*100:.0f}%, Purge: {purge_len} bars)")
        split = int(len(X) * train_ratio)
        train_end = max(0, split - purge_len)
        X_train, X_test = X[:train_end], X[split:]
        y_train, y_test = y[:train_end], y[split:]
    else:
        # Default chronological
        add_log(f"Applying Chronological Split (Train: {train_ratio*100:.0f}%)")
        split = int(len(X) * train_ratio)
        X_train, X_test = X[:split], X[split:]
        y_train, y_test = y[:split], y[split:]
        
    return X_train, X_test, y_train, y_test

def apply_imbalance_strategy(X_train, y_train, config, add_log, is_classification):
    """
    Applies SMOTE or Undersampling to the training data.
    class_weights are handled by the model parameters directly.
    """
    if not is_classification:
        return X_train, y_train
        
    strategy = config.get("imbalance_strategy", "none")
    
    y_train_flat = y_train.ravel()
    unique_classes, class_counts = np.unique(y_train_flat, return_counts=True)
    
    if len(unique_classes) < 2:
        return X_train, y_train
        
    m_count = class_counts.min()
    
    if strategy == "smote":
        if class_counts.max() / max(m_count, 1) > 1.2:
            try:
                from imblearn.over_sampling import SMOTE
                k_neighbors = max(1, min(5, m_count - 1))
                add_log(f"Applying SMOTE Oversampling (k={k_neighbors}) to balance classes...")
                smote = SMOTE(sampling_strategy='auto', k_neighbors=k_neighbors, random_state=42)
                X_train, y_train_res = smote.fit_resample(X_train, y_train_flat)
                y_train = y_train_res.reshape(-1, 1)
            except ImportError:
                add_log("⚠️ imbalanced-learn not installed. Skipping SMOTE.")
            except Exception as e:
                add_log(f"⚠️ Failed to apply SMOTE: {e}")
    elif strategy == "undersampling":
        if class_counts.max() / max(m_count, 1) > 1.2:
            try:
                from imblearn.under_sampling import RandomUnderSampler
                add_log(f"Applying Random Undersampling to balance classes...")
                rus = RandomUnderSampler(random_state=42)
                X_train, y_train_res = rus.fit_resample(X_train, y_train_flat)
                y_train = y_train_res.reshape(-1, 1)
            except ImportError:
                add_log("⚠️ imbalanced-learn not installed. Skipping Undersampling.")
            except Exception as e:
                add_log(f"⚠️ Failed to apply Undersampling: {e}")
    elif strategy == "class_weights":
        add_log("Imbalance Strategy: Class Weights. Leaving data as is (handled by algorithm).")
        
    return X_train, y_train
