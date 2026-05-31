"""
Verify CatBoost tree structure so we can extract Decision Tree Logic correctly.
"""
import numpy as np
import catboost as cb
import pandas as pd

np.random.seed(42)
n = 300
feature_names = ["obi", "spread", "microprice", "Effective_Spread", "Mid_Price_Acceleration", "WAP_Top_5"]
X = pd.DataFrame(np.random.randn(n, len(feature_names)), columns=feature_names)
y = (np.random.rand(n) > 0.5).astype(int)

split = int(n * 0.8)
X_train, X_test = X[:split], X[split:]
y_train, y_test = y[:split], y[split:]

model = cb.CatBoostClassifier(iterations=10, depth=3, random_seed=42, verbose=False)
model.fit(X_train, y_train, eval_set=(X_test, y_test))

print("=== CatBoost Tree Structure Exploration ===\n")

# Method 1: get_tree_splits / get_tree_leaf_values (CatBoost native)
print("[Method 1] model._tree_count:", model._tree_count)

try:
    splits = model.get_tree_splits(0, X_train)
    print("[Method 1] get_tree_splits(0) type:", type(splits))
    print("[Method 1] get_tree_splits(0) value:", splits[:5] if hasattr(splits, '__len__') else splits)
except Exception as e:
    print(f"[Method 1] get_tree_splits failed: {e}")

# Method 2: get_all_params and use underlying pool
try:
    import json
    # Save to json and parse
    import tempfile, os
    tmp = tempfile.mktemp(suffix='.json')
    model.save_model(tmp, format='json')
    with open(tmp) as f:
        raw = json.load(f)
    os.remove(tmp)
    
    print("\n[Method 2] JSON model top-level keys:", list(raw.keys()))
    
    if 'oblivious_trees' in raw:
        tree0 = raw['oblivious_trees'][0]
        print("[Method 2] First oblivious_tree keys:", list(tree0.keys()))
        print("[Method 2] splits:", tree0.get('splits', [])[:3])
        print("[Method 2] leaf_values:", tree0.get('leaf_values', [])[:8])
    
    # Also check model_info
    model_info = raw.get('model_info', {})
    print("[Method 2] model_info keys:", list(model_info.keys()))
    
    features_info = raw.get('features_info', {})
    print("[Method 2] features_info keys:", list(features_info.keys()))
    float_features = features_info.get('float_features', [])
    print("[Method 2] float_features sample:", float_features[:2])

except Exception as e:
    print(f"[Method 2] JSON export failed: {e}")

# Method 3: iterate_tree_structure (available in newer CatBoost)
try:
    print("\n[Method 3] Checking iterate_tree_structure...")
    gen = model._object._iterate_tree_structure(model._object._model, 0)
    for item in gen:
        print(" item:", item)
        break
except Exception as e:
    print(f"[Method 3] iterate_tree_structure not available: {e}")

print("\n=== Done ===")
print(f"CatBoost version: {cb.__version__}")
