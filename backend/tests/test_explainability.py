import os
import sys
import json
import numpy as np

# Ensure the backend directory is in the path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__))))

from sklearn.ensemble import RandomForestClassifier
from sklearn.datasets import make_classification
from sklearn.model_selection import train_test_split

# Import our target function
from app.services.ml_utils import generate_real_explainability

def run_verification():
    print("=== ML Explainability Verification Script ===")
    
    # 1. Generate Dummy Data
    print("\n1. Generating dummy dataset...")
    X, y = make_classification(n_samples=500, n_features=10, n_informative=5, n_redundant=2, random_state=42)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    feature_names = [f"Feature_{i}" for i in range(10)]
    print(f"   X_test shape: {X_test.shape}, y_test shape: {y_test.shape}")
    
    # 2. Train a Model
    print("\n2. Training Random Forest model...")
    model = RandomForestClassifier(n_estimators=50, max_depth=5, random_state=42)
    model.fit(X_train, y_train)
    
    # 3. Predict
    print("\n3. Generating predictions...")
    y_pred = model.predict(X_test)
    
    # 4. Call generate_real_explainability
    print("\n4. Running generate_real_explainability...")
    try:
        explain_data = generate_real_explainability(
            model=model, 
            X_test=X_test, 
            y_test=y_test, 
            y_pred=y_pred, 
            feature_names=feature_names, 
            is_classification=True
        )
        
        print("\n=== Verification Results ===")
        print(f"[OK] Function executed successfully. Returned dictionary keys: {list(explain_data.keys())}")
        
        if "featureImportance" in explain_data:
            print(f"[OK] Feature Importance: Generated {len(explain_data['featureImportance'])} items.")
            print(f"   Top feature: {explain_data['featureImportance'][0]['name']} ({explain_data['featureImportance'][0]['value']:.4f})")
            
        if "confusionMatrix" in explain_data:
            cm = explain_data["confusionMatrix"]
            print(f"[OK] Confusion Matrix: {len(cm['classes'])} classes. Matrix shape: {len(cm['matrix'])}x{len(cm['matrix'][0])}")
            
        if "timeSeriesData" in explain_data:
            print(f"[OK] Time Series Data: {len(explain_data['timeSeriesData'])} data points generated.")
            
        if "shapSummary" in explain_data:
            print(f"[OK] SHAP Summary: {len(explain_data['shapSummary'])} points generated.")
            if explain_data['shapSummary']:
                sample = explain_data['shapSummary'][0]
                print(f"   Sample point: Feature '{sample['feature']}', Impact {sample['impact']:.4f}, Value '{sample['value']}'")
                
        if "pdpData" in explain_data:
            print(f"[OK] PDP Data: {len(explain_data['pdpData'])} points generated.")
            
        if "decisionTree" in explain_data:
            dt = explain_data["decisionTree"]
            print(f"[OK] Decision Tree: {len(dt['nodes'])} nodes, {len(dt['edges'])} edges generated.")
            
        print("\nAll explainability modules are working correctly! ")
        
    except Exception as e:
        import traceback
        print("\n[ERROR] Error during execution:")
        print(traceback.format_exc())

if __name__ == "__main__":
    run_verification()
