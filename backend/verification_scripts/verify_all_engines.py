"""
Comprehensive verification of all 4 tree-based engines:
Random Forest, XGBoost, LightGBM, CatBoost
Tests: y-scaling fix, feature name fix, decision tree extraction
"""
import numpy as np
import pandas as pd
import sys
sys.path.insert(0, '/app')

from app.services.ml_utils import generate_real_explainability

np.random.seed(42)
n = 300
feature_names = ["obi", "spread", "microprice", "Effective_Spread", "Mid_Price_Acceleration", "WAP_Top_5"]
X_np = np.random.randn(n, len(feature_names))
y = (np.random.rand(n) > 0.5).astype(int)  # proper binary labels, NOT scaled

split = int(n * 0.8)
X_train_np, X_test_np = X_np[:split], X_np[split:]
y_train, y_test = y[:split], y[split:]

X_train_df = pd.DataFrame(X_train_np, columns=feature_names)
X_test_df  = pd.DataFrame(X_test_np,  columns=feature_names)

PASS = "✅ PASS"
FAIL = "❌ FAIL"

results = {}

print("=" * 65)
print("  CosmoQuantAI — All Engine Decision Tree Verification")
print("=" * 65)

# ─────────────────────────── 1. Random Forest ────────────────────────────
print("\n[ 1/4 ] Random Forest")
try:
    from sklearn.ensemble import RandomForestClassifier
    model = RandomForestClassifier(n_estimators=10, max_depth=3, random_state=42)
    model.fit(X_train_df, y_train)
    y_pred = model.predict(X_test_df)
    
    result = generate_real_explainability(model, X_test_np, y_test, y_pred, feature_names, is_classification=True)
    dt = result.get("decisionTree", {})
    nodes = dt.get("nodes", [])
    edges = dt.get("edges", [])
    
    has_condition = any(n["type"] == "condition" for n in nodes)
    has_leaf      = any(n["type"] == "leaf" for n in nodes)
    has_class1    = any("Class 1" in n.get("label", "") for n in nodes)
    
    status = PASS if (has_condition and has_leaf and has_class1 and len(edges) > 0) else FAIL
    print(f"  Decision Tree: {status} | {len(nodes)} nodes, {len(edges)} edges")
    print(f"  Has conditions: {has_condition} | Has Class 1: {has_class1}")
    results["Random Forest"] = status
except Exception as e:
    print(f"  {FAIL}: {e}")
    results["Random Forest"] = FAIL

# ─────────────────────────── 2. XGBoost ──────────────────────────────────
print("\n[ 2/4 ] XGBoost")
try:
    from xgboost import XGBClassifier
    model = XGBClassifier(n_estimators=10, max_depth=3, random_state=42, eval_metric='logloss')
    model.fit(X_train_df, y_train, eval_set=[(X_test_df, y_test)], verbose=False)
    y_pred = model.predict(X_test_df)
    
    result = generate_real_explainability(model, X_test_np, y_test, y_pred, feature_names, is_classification=True)
    dt = result.get("decisionTree", {})
    nodes = dt.get("nodes", [])
    edges = dt.get("edges", [])
    
    has_condition = any(n["type"] == "condition" for n in nodes)
    has_leaf      = any(n["type"] == "leaf" for n in nodes)
    
    status = PASS if (has_condition and has_leaf and len(edges) > 0) else FAIL
    print(f"  Decision Tree: {status} | {len(nodes)} nodes, {len(edges)} edges")
    print(f"  Sample nodes: {[n['label'] for n in nodes[:3]]}")
    results["XGBoost"] = status
except Exception as e:
    print(f"  {FAIL}: {e}")
    results["XGBoost"] = FAIL

# ─────────────────────────── 3. LightGBM ─────────────────────────────────
print("\n[ 3/4 ] LightGBM")
try:
    import lightgbm as lgb
    model = lgb.LGBMClassifier(n_estimators=10, max_depth=3, random_state=42, verbose=-1)
    model.fit(X_train_df, y_train, eval_set=[(X_test_df, y_test)])
    y_pred = model.predict(X_test_df)
    
    result = generate_real_explainability(model, X_test_np, y_test, y_pred, feature_names, is_classification=True)
    dt = result.get("decisionTree", {})
    nodes = dt.get("nodes", [])
    edges = dt.get("edges", [])
    
    has_condition = any(n["type"] == "condition" for n in nodes)
    has_leaf      = any(n["type"] == "leaf" for n in nodes)
    
    status = PASS if (has_condition and has_leaf and len(edges) > 0) else FAIL
    print(f"  Decision Tree: {status} | {len(nodes)} nodes, {len(edges)} edges")
    print(f"  Sample nodes: {[n['label'] for n in nodes[:3]]}")
    results["LightGBM"] = status
except Exception as e:
    print(f"  {FAIL}: {e}")
    results["LightGBM"] = FAIL

# ─────────────────────────── 4. CatBoost ─────────────────────────────────
print("\n[ 4/4 ] CatBoost")
try:
    import catboost as cb
    model = cb.CatBoostClassifier(iterations=10, depth=3, random_seed=42, verbose=False)
    model.fit(X_train_df, y_train, eval_set=(X_test_df, y_test))
    y_pred = model.predict(X_test_df)
    
    result = generate_real_explainability(model, X_test_np, y_test, y_pred, feature_names, is_classification=True)
    dt = result.get("decisionTree", {})
    nodes = dt.get("nodes", [])
    edges = dt.get("edges", [])
    
    has_condition = any(n["type"] == "condition" for n in nodes)
    has_leaf      = any(n["type"] == "leaf" for n in nodes)
    
    status = PASS if (has_condition and has_leaf and len(edges) > 0) else FAIL
    print(f"  Decision Tree: {status} | {len(nodes)} nodes, {len(edges)} edges")
    print(f"  Sample nodes: {[n['label'] for n in nodes[:3]]}")
    results["CatBoost"] = status
except Exception as e:
    print(f"  {FAIL}: {e}")
    results["CatBoost"] = FAIL

# ─────────────────────────── SUMMARY ──────────────────────────────────────
print("\n" + "=" * 65)
print("  FINAL SUMMARY")
print("=" * 65)
all_pass = True
for engine, status in results.items():
    print(f"  {engine:20s} : {status}")
    if FAIL in status:
        all_pass = False

print()
if all_pass:
    print("  🎉 ALL ENGINES PASSED! Decision Tree Logic is working correctly.")
else:
    print("  ⚠️  Some engines failed. Check errors above.")
print("=" * 65)
