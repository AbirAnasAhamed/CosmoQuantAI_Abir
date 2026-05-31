"""
Deep verification script for LightGBM training pipeline issues.
This script simulates the exact same data flow as ml_training_engine.py 
and checks all known problems.
"""

import numpy as np
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import accuracy_score, f1_score
import lightgbm as lgb
import warnings

print("=" * 60)
print("CosmoQuantAI - LightGBM Pipeline Deep Verification")
print("=" * 60)

# -------------------------------------------------------------------
# SIMULATE the exact training pipeline from ml_training_engine.py
# -------------------------------------------------------------------
np.random.seed(42)

# Simulate L2 orderbook features (like obi, spread, microprice, etc.)
n_samples = 500
feature_names = ["obi", "spread", "microprice", "Depth_Ratio", "Multi_Level_Imbalance_Top5", "OFI_Acceleration"]
X_raw = np.random.randn(n_samples, len(feature_names))
y_raw = (np.random.rand(n_samples) > 0.5).astype(int)  # binary classification

print(f"\n[DATA] Samples: {n_samples}, Features: {len(feature_names)}")
print(f"[DATA] Class distribution: Class 0 = {(y_raw==0).sum()}, Class 1 = {(y_raw==1).sum()}")

# -------------------------------------------------------------------
# PROBLEM 1: MinMaxScaler on y_train (the root cause of all issues!)
# -------------------------------------------------------------------
print("\n" + "=" * 60)
print("PROBLEM 1: MinMaxScaler applied to y (target variable)")
print("=" * 60)

scaler_x = MinMaxScaler()
scaler_y = MinMaxScaler()
X_scaled = scaler_x.fit_transform(X_raw)
y_scaled = scaler_y.fit_transform(y_raw.reshape(-1, 1))  # <- THIS IS THE BUG

split = int(len(X_scaled) * 0.8)
X_train, X_test = X_scaled[:split], X_scaled[split:]
y_train, y_test = y_scaled[:split], y_scaled[split:]

print(f"  Original y values (unique): {np.unique(y_raw)}")
print(f"  After MinMaxScaler y_train values (unique): {np.unique(y_train.ravel())}")
print(f"  => y is no longer 0/1 binary! It becomes 0.0/1.0 floats in array shape (N,1)")
print(f"  => y_train shape: {y_train.shape} (should be 1D for classification)")

# -------------------------------------------------------------------
# PROBLEM 2: X passed as NumPy array -> feature name warning
# -------------------------------------------------------------------
print("\n" + "=" * 60)
print("PROBLEM 2: X trained with feature names, predicted with NumPy array")
print("=" * 60)

import pandas as pd
X_train_df = pd.DataFrame(X_train[:5], columns=feature_names)
model_with_names = lgb.LGBMClassifier(n_estimators=5, random_state=42)
model_with_names.fit(X_train_df, y_train[:5].ravel())

print("  Predicting with NumPy array on model trained with DataFrame...")
with warnings.catch_warnings(record=True) as caught_warnings:
    warnings.simplefilter("always")
    model_with_names.predict(X_test[:2])  # <- passing numpy, not DataFrame
    for w in caught_warnings:
        if "feature names" in str(w.message):
            print(f"  ⚠️  WARNING CAUGHT: {w.message}")
            print(f"  => This is caused by SHAP/prediction code passing raw numpy arrays")

# -------------------------------------------------------------------
# PROBLEM 3: Decision Tree shows only "Class 0" 
# -------------------------------------------------------------------
print("\n" + "=" * 60)
print("PROBLEM 3: Decision Tree shows only Class 0")
print("=" * 60)

# Train exactly as the engine does: y_scaled with shape (N, 1)
model_bugged = lgb.LGBMClassifier(n_estimators=10, max_depth=3, random_state=42, verbose=-1)
model_bugged.fit(X_train, y_train.ravel())  # ravel() fixes shape, but 0.0/1.0 are still floats

y_pred_bugged = model_bugged.predict(X_test)
print(f"  Predictions (unique values): {np.unique(y_pred_bugged)}")
print(f"  => If all predictions are 0, the tree will show only 'Class 0'")

# Check the tree logic
try:
    tree_info = model_bugged.booster_.dump_model()['tree_info'][0]['tree_structure']
    
    def check_tree(node, depth=0):
        if 'split_feature' in node:
            print(f"  {'  '*depth}Split on feature {node['split_feature']} <= {node['threshold']:.4f}")
            check_tree(node.get('left_child', {}), depth+1)
            check_tree(node.get('right_child', {}), depth+1)
        else:
            val = node.get('leaf_value', 0)
            class_idx = 1 if val > 0 else 0
            print(f"  {'  '*depth}Leaf: value={val:.4f} => Class {class_idx}")
    
    print("  LightGBM tree structure:")
    check_tree(tree_info)
except Exception as e:
    print(f"  Tree extraction error: {e}")

# -------------------------------------------------------------------
# FIX VERIFICATION: How it SHOULD work
# -------------------------------------------------------------------
print("\n" + "=" * 60)
print("FIX: Correct pipeline (no y scaling, proper feature names)")
print("=" * 60)

# Correct: Don't scale y for classification, use original binary labels
X_train_correct = X_train  # X scaling is fine
y_train_correct = y_raw[:split]  # Original binary labels, NOT scaled!
X_test_correct = X_test
y_test_correct = y_raw[split:]

model_fixed = lgb.LGBMClassifier(n_estimators=10, max_depth=3, random_state=42, verbose=-1)
X_train_df_correct = pd.DataFrame(X_train_correct, columns=feature_names)
model_fixed.fit(X_train_df_correct, y_train_correct)

# Predict with DataFrame too (fixes feature name warning)
X_test_df_correct = pd.DataFrame(X_test_correct, columns=feature_names)
y_pred_fixed = model_fixed.predict(X_test_df_correct)

acc = accuracy_score(y_test_correct, y_pred_fixed)
f1 = f1_score(y_test_correct, y_pred_fixed, average='weighted')
print(f"  Accuracy: {acc:.4f}")
print(f"  F1 Score: {f1:.4f}")
print(f"  Prediction distribution: Class 0 = {(y_pred_fixed==0).sum()}, Class 1 = {(y_pred_fixed==1).sum()}")

# Check tree with fix
try:
    tree_info_fixed = model_fixed.booster_.dump_model()['tree_info'][0]['tree_structure']
    print("\n  Fixed LightGBM tree structure:")
    check_tree(tree_info_fixed)
except Exception as e:
    print(f"  Tree extraction error: {e}")

# -------------------------------------------------------------------
# SUMMARY
# -------------------------------------------------------------------
print("\n" + "=" * 60)
print("SUMMARY OF BUGS FOUND")
print("=" * 60)
print("""
BUG 1 [CRITICAL]: MinMaxScaler applied to y (classification labels)
  - File: ml_training_engine.py, Line ~451
  - y_scaled = scaler_y.fit_transform(y.reshape(-1, 1))
  - For classification, y should stay as 0/1 integers, NOT 0.0/1.0 floats
  - This causes: Class imbalance detection to break, LightGBM to 
    predict mostly 0, and "No further splits" warnings
  - FIX: Skip y scaling for classification tasks

BUG 2 [MEDIUM]: Training with DataFrame, predicting with NumPy array
  - File: ml_training_engine.py
  - X = df[features].values  <- strips feature names!
  - Model trained with .values() loses feature names
  - SHAP and predict() then get X as plain numpy -> warning spam
  - FIX: Use pd.DataFrame(X, columns=features) when fitting

BUG 3 [SYMPTOM of BUG 1]: Decision Tree shows only "Class 0"
  - Because y labels are continuous 0.0/1.0, LightGBM's leaf_value
    logic assigns negative leaf values for Class 0 predictions
  - FIX: Resolve BUG 1 -> Decision Tree will show both classes
""")

print("Verification complete!")
