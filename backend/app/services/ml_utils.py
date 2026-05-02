import json
import numpy as np
from sklearn.metrics import accuracy_score, r2_score, mean_squared_error, mean_absolute_error, f1_score

def extract_feature_importance(model, feature_names):
    """Extract feature importance from a tree-based model."""
    if hasattr(model, 'feature_importances_'):
        importances = model.feature_importances_
        # Normalize just in case
        if np.sum(importances) > 0:
            importances = importances / np.sum(importances)
        
        feature_dict = {str(name): float(imp) for name, imp in zip(feature_names, importances)}
        return f"[FEATURE_IMPORTANCE] {json.dumps(feature_dict)}"
    return ""

def calculate_classification_metrics(y_true, y_pred):
    """Calculate metrics for classification."""
    acc = accuracy_score(y_true, y_pred)
    f1 = f1_score(y_true, y_pred, average='weighted')
    
    metrics = {
        "Accuracy": acc,
        "F1_Score": f1
    }
    return f"[METRICS] {json.dumps(metrics)}"

def calculate_regression_metrics(y_true, y_pred):
    """Calculate metrics for regression."""
    r2 = r2_score(y_true, y_pred)
    mse = mean_squared_error(y_true, y_pred)
    mae = mean_absolute_error(y_true, y_pred)
    
    metrics = {
        "R2_Score": r2,
        "MSE": mse,
        "MAE": mae
    }
    return f"[METRICS] {json.dumps(metrics)}"
