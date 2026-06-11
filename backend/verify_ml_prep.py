import sys
import numpy as np
import pandas as pd
import warnings

# Suppress warnings for cleaner output
warnings.filterwarnings('ignore')

# Append backend path so imports work
sys.path.append('d:/CosmoQuantAI_Abir/backend')

from app.services.ml_data_prep import apply_data_split, apply_imbalance_strategy

def mock_logger(msg):
    print(f"  --> LOG: {msg}")

def test_split():
    print("=== Testing apply_data_split ===")
    X = np.arange(100).reshape(50, 2)
    y = np.arange(50)
    
    # 1. Random Split
    config_random = {"split_method": "random", "train_ratio": 80}
    Xr_train, Xr_test, yr_train, yr_test = apply_data_split(X, y, config_random, mock_logger)
    print(f"  Result: Random Split - Train size: {len(Xr_train)}, Test size: {len(Xr_test)}")
    assert len(Xr_train) == 40 and len(Xr_test) == 10
    
    # 2. Chronological Split
    config_chrono = {"split_method": "chronological", "train_ratio": 70}
    Xc_train, Xc_test, yc_train, yc_test = apply_data_split(X, y, config_chrono, mock_logger)
    print(f"  Result: Chronological Split - Train size: {len(Xc_train)}, Test size: {len(Xc_test)}")
    assert len(Xc_train) == 35 and len(Xc_test) == 15
    
def test_imbalance():
    print("\n=== Testing apply_imbalance_strategy ===")
    # Create imbalanced dataset (90 class 0, 10 class 1)
    X = np.random.rand(100, 2)
    y = np.array([0]*90 + [1]*10).reshape(-1, 1)
    
    print(f"  Initial Class distribution: {{0: 90, 1: 10}}")
    
    # 1. SMOTE
    config_smote = {"imbalance_strategy": "smote"}
    Xs_train, ys_train = apply_imbalance_strategy(X, y, config_smote, mock_logger, is_classification=True)
    uniq, counts = np.unique(ys_train, return_counts=True)
    print(f"  Result: SMOTE - Class distribution: {dict(zip(uniq, counts))}")
    assert counts[0] == counts[1]
    
    # 2. Undersampling
    config_under = {"imbalance_strategy": "undersampling"}
    Xu_train, yu_train = apply_imbalance_strategy(X, y, config_under, mock_logger, is_classification=True)
    uniq, counts = np.unique(yu_train, return_counts=True)
    print(f"  Result: Undersampling - Class distribution: {dict(zip(uniq, counts))}")
    assert counts[0] == counts[1] == 10

if __name__ == "__main__":
    try:
        test_split()
        test_imbalance()
        print("\n✅ Verification Completed Successfully! All modular ML components work perfectly.")
    except Exception as e:
        print(f"\n❌ Verification Failed: {e}")
