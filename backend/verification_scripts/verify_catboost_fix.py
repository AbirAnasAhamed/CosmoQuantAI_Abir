"""
Verify the full CatBoost decision tree extraction works end-to-end
using the same code now in ml_utils.py.
"""
import numpy as np
import catboost as cb
import pandas as pd
import sys
sys.path.insert(0, '/app')

from app.services.ml_utils import generate_real_explainability

np.random.seed(42)
n = 300
feature_names = ["obi", "spread", "microprice", "Effective_Spread", "Mid_Price_Acceleration", "WAP_Top_5"]
X = np.random.randn(n, len(feature_names))
y = (np.random.rand(n) > 0.5).astype(int)

split = int(n * 0.8)
X_train, X_test = X[:split], X[split:]
y_train, y_test = y[:split], y[split:]

model = cb.CatBoostClassifier(iterations=10, depth=3, random_seed=42, verbose=False)
X_train_df = pd.DataFrame(X_train, columns=feature_names)
model.fit(X_train_df, y_train)

X_test_df = pd.DataFrame(X_test, columns=feature_names)
y_pred = model.predict(X_test_df)

print("Running generate_real_explainability for CatBoost...")
result = generate_real_explainability(model, X_test, y_test, y_pred, feature_names, is_classification=True)

print("\n=== RESULT KEYS ===")
print(list(result.keys()))

print("\n=== DECISION TREE ===")
dt = result.get("decisionTree")
if dt:
    print("Nodes:")
    for n_ in dt['nodes']:
        print(f"  {n_}")
    print("Edges:")
    for e_ in dt['edges']:
        print(f"  {e_}")
    print(f"\n✅ SUCCESS: {len(dt['nodes'])} nodes, {len(dt['edges'])} edges generated for CatBoost!")
else:
    print("❌ FAILED: decisionTree key is missing from result!")

print("\n=== FEATURE IMPORTANCE ===")
fi = result.get("featureImportance", [])
print(f"  {len(fi)} features ranked")
for item in fi[:3]:
    print(f"  {item}")

print("\nVerification complete!")
