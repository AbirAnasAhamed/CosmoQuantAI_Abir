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

def generate_real_explainability(model, X_test, y_test, y_pred, feature_names, is_classification=True):
    """Generate real explainability metrics for the model."""
    import traceback
    
    result = {}
    
    # 1. Feature Importance
    try:
        if hasattr(model, 'feature_importances_'):
            importances = model.feature_importances_
            if np.sum(importances) > 0:
                importances = importances / np.sum(importances)
            fi_list = [{"name": str(name), "value": float(imp)} for name, imp in zip(feature_names, importances)]
            # Sort by value descending and keep top 10
            fi_list = sorted(fi_list, key=lambda x: x["value"], reverse=True)[:10]
            result["featureImportance"] = fi_list
    except Exception as e:
        print(f"Failed to generate feature importance: {e}")
        
    # 2. Confusion Matrix
    try:
        if is_classification:
            from sklearn.metrics import confusion_matrix
            cm = confusion_matrix(np.round(y_test).astype(int), np.round(y_pred).astype(int))
            classes = ["Class 0", "Class 1"]
            if cm.shape[0] == 3:
                classes = ["Hold", "Buy", "Sell"]
                
            result["confusionMatrix"] = {
                "classes": classes[:cm.shape[0]],
                "matrix": cm.tolist()
            }
    except Exception as e:
        print(f"Failed to generate confusion matrix: {e}")

    # 3. Time Series Data (Actual vs Predicted)
    try:
        # Take the last 50 points to avoid huge payloads
        subset_len = min(50, len(y_test))
        ts_data = []
        for i in range(subset_len):
            ts_data.append({
                "time": f"T-{subset_len-i}",
                "actual": float(y_test[len(y_test) - subset_len + i]),
                "predicted": float(y_pred[len(y_pred) - subset_len + i])
            })
        result["timeSeriesData"] = ts_data
    except Exception as e:
        print(f"Failed to generate time series data: {e}")

    # 4. SHAP Summary
    try:
        import shap
        # Sample data to speed up SHAP calculation
        X_sample = X_test[:min(100, len(X_test))]
        
        if type(model).__name__ in ['RandomForestClassifier', 'RandomForestRegressor', 'XGBClassifier', 'XGBRegressor', 'LGBMClassifier', 'LGBMRegressor', 'CatBoostClassifier', 'CatBoostRegressor']:
            explainer = shap.TreeExplainer(model)
            shap_values = explainer.shap_values(X_sample)
            
            if isinstance(shap_values, list):
                shap_values = shap_values[1] # Use positive class
            elif hasattr(shap_values, "shape") and len(shap_values.shape) == 3:
                shap_values = shap_values[:, :, 1]
                
            shap_summary = []
            
            if "featureImportance" in result and result["featureImportance"]:
                top_features = [f["name"] for f in result["featureImportance"][:5]]
            else:
                top_features = feature_names[:5]
                
            for feature in top_features:
                if feature in feature_names:
                    f_idx = feature_names.index(feature)
                    f_shap = shap_values[:, f_idx]
                    f_val = X_sample[:, f_idx]
                    
                    val_min, val_max = np.min(f_val), np.max(f_val)
                    for i in range(len(f_shap)):
                        impact = float(f_shap[i])
                        is_high = False
                        if val_max > val_min:
                            is_high = ((f_val[i] - val_min) / (val_max - val_min)) > 0.5
                            
                        shap_summary.append({
                            "feature": feature,
                            "impact": impact,
                            "value": "High" if is_high else "Low"
                        })
            result["shapSummary"] = shap_summary
    except Exception as e:
        print(f"Failed to generate SHAP summary: {e}")

    # 5. PDP Data
    try:
        from sklearn.inspection import partial_dependence
        if "featureImportance" in result and result["featureImportance"]:
            top_feature = result["featureImportance"][0]["name"]
            if top_feature in feature_names:
                f_idx = feature_names.index(top_feature)
                
                pd_results = partial_dependence(model, X_test, features=[f_idx], grid_resolution=20)
                
                if isinstance(pd_results, dict):
                    if 'values' in pd_results:
                        grid = pd_results['values'][0]
                    elif 'grid_values' in pd_results:
                        grid = pd_results['grid_values'][0]
                    else:
                        grid = list(pd_results.values())[0][0]
                    avg_preds = pd_results['average'][0]
                else:
                    avg_preds, grid = pd_results[0], pd_results[1]
                    avg_preds = avg_preds[0]
                    grid = grid[0]
                    
                pdp_data = []
                for x, y in zip(grid, avg_preds):
                    pdp_data.append({
                        "x": float(x),
                        "y": float(y)
                    })
                result["pdpData"] = pdp_data
    except Exception as e:
        print(f"Failed to generate PDP data: {e}")
        
    # 6. Decision Tree Logic
    try:
        if type(model).__name__ in ['RandomForestClassifier', 'RandomForestRegressor']:
            tree = model.estimators_[0].tree_
            
            nodes = []
            edges = []
            
            queue = [(0, 1)] # node_id, depth
            node_count = 0
            
            while queue and node_count < 7: # max 7 nodes
                node_id, depth = queue.pop(0)
                node_count += 1
                
                str_id = str(node_id)
                
                if tree.children_left[node_id] != tree.children_right[node_id] and depth < 3: # Not a leaf
                    feat_idx = tree.feature[node_id]
                    feat_name = feature_names[feat_idx] if feat_idx < len(feature_names) else f"Feat_{feat_idx}"
                    threshold = tree.threshold[node_id]
                    
                    nodes.append({
                        "id": str_id,
                        "label": f"{feat_name} <= {threshold:.2f}",
                        "type": "condition"
                    })
                    
                    left_child = tree.children_left[node_id]
                    right_child = tree.children_right[node_id]
                    
                    edges.append({"source": str_id, "target": str(left_child), "label": "Yes"})
                    edges.append({"source": str_id, "target": str(right_child), "label": "No"})
                    
                    queue.append((left_child, depth+1))
                    queue.append((right_child, depth+1))
                else:
                    val = tree.value[node_id][0]
                    if is_classification:
                        class_idx = np.argmax(val)
                        label = f"Class {class_idx}"
                        color = "green" if class_idx == 1 else "red"
                    else:
                        label = f"Val: {val[0]:.2f}"
                        color = "gray"
                        
                    nodes.append({
                        "id": str_id,
                        "label": label,
                        "type": "leaf",
                        "color": color
                    })
            
            result["decisionTree"] = {
                "nodes": nodes,
                "edges": edges
            }
        elif type(model).__name__ in ['LGBMClassifier', 'LGBMRegressor']:
            tree_info = model.booster_.dump_model()['tree_info'][0]['tree_structure']
            
            nodes = []
            edges = []
            
            queue = [(tree_info, "0", 1)] # node_dict, id, depth
            node_count = 0
            
            while queue and node_count < 7: # max 7 nodes
                curr_node, node_id, depth = queue.pop(0)
                node_count += 1
                
                if 'split_feature' in curr_node and depth < 3:
                    feat_idx = curr_node['split_feature']
                    feat_name = feature_names[feat_idx] if feat_idx < len(feature_names) else f"Feat_{feat_idx}"
                    threshold = curr_node['threshold']
                    
                    nodes.append({
                        "id": node_id,
                        "label": f"{feat_name} <= {threshold:.2f}",
                        "type": "condition"
                    })
                    
                    left_child = curr_node.get('left_child')
                    right_child = curr_node.get('right_child')
                    
                    if left_child:
                        left_id = f"{node_id}_L"
                        edges.append({"source": node_id, "target": left_id, "label": "Yes"})
                        queue.append((left_child, left_id, depth+1))
                        
                    if right_child:
                        right_id = f"{node_id}_R"
                        edges.append({"source": node_id, "target": right_id, "label": "No"})
                        queue.append((right_child, right_id, depth+1))
                else:
                    val = curr_node.get('leaf_value', 0)
                    if is_classification:
                        class_idx = 1 if val > 0 else 0
                        label = f"Class {class_idx}"
                        color = "green" if class_idx == 1 else "red"
                    else:
                        label = f"Val: {val:.2f}"
                        color = "gray"
                        
                    nodes.append({
                        "id": node_id,
                        "label": label,
                        "type": "leaf",
                        "color": color
                    })
            
            result["decisionTree"] = {
                "nodes": nodes,
                "edges": edges
            }
    except Exception as e:
        print(f"Failed to generate decision tree logic: {e}")

    return result
