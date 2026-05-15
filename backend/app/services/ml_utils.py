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
    import pandas as pd
    
    # Ensure feature_names is a plain list for safe .index() calls
    feature_names = list(feature_names)
    
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
        # FIX: Use DataFrame to preserve feature names -> eliminates "X does not have valid feature names" warnings
        sample_size = min(100, len(X_test))
        X_sample_np = X_test[:sample_size]
        X_sample_df = pd.DataFrame(X_sample_np, columns=feature_names)
        
        if type(model).__name__ in ['RandomForestClassifier', 'RandomForestRegressor', 'XGBClassifier', 'XGBRegressor', 'LGBMClassifier', 'LGBMRegressor', 'CatBoostClassifier', 'CatBoostRegressor']:
            explainer = shap.TreeExplainer(model)
            shap_values = explainer.shap_values(X_sample_df)
            
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
                    f_val = X_sample_np[:, f_idx]  # use numpy for indexing
                    
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
                
                # FIX: Use DataFrame for PDP to avoid feature name warning
                X_test_df = pd.DataFrame(X_test, columns=feature_names)
                pd_results = partial_dependence(model, X_test_df, features=[f_idx], grid_resolution=20)
                
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
        if type(model).__name__ in ['XGBClassifier', 'XGBRegressor']:
            # XGBoost: extract first tree from booster using trees_to_dataframe()
            tree_df = model.get_booster().trees_to_dataframe()
            # Filter only tree 0
            tree0 = tree_df[tree_df['Tree'] == 0].copy()
            
            nodes = []
            edges = []
            node_count = 0
            
            # BFS through nodes using Node ID column
            queue = [('0-0', 1)]  # (node_id, depth)
            visited = set()
            
            while queue and node_count < 7:
                node_id, depth = queue.pop(0)
                if node_id in visited:
                    continue
                visited.add(node_id)
                node_count += 1
                
                row = tree0[tree0['ID'] == node_id]
                if row.empty:
                    continue
                row = row.iloc[0]
                
                feature = str(row.get('Feature', 'Leaf'))
                
                if feature == 'Leaf':
                    val = float(row.get('Gain', 0))
                    if is_classification:
                        class_idx = 1 if val > 0 else 0
                        label = f"Class {class_idx}"
                        color = "green" if class_idx == 1 else "red"
                    else:
                        label = f"Val: {val:.3f}"
                        color = "gray"
                    nodes.append({"id": node_id, "label": label, "type": "leaf", "color": color})
                elif depth <= 3:
                    split_val = float(row.get('Split', 0))
                    nodes.append({
                        "id": node_id,
                        "label": f"{feature} <= {split_val:.2f}",
                        "type": "condition"
                    })
                    
                    yes_child = str(row.get('Yes', ''))
                    no_child  = str(row.get('No', ''))
                    
                    if yes_child and yes_child != 'nan':
                        edges.append({"source": node_id, "target": yes_child, "label": "Yes"})
                        queue.append((yes_child, depth + 1))
                    if no_child and no_child != 'nan':
                        edges.append({"source": node_id, "target": no_child, "label": "No"})
                        queue.append((no_child, depth + 1))
            
            result["decisionTree"] = {"nodes": nodes, "edges": edges}
        
        elif type(model).__name__ in ['RandomForestClassifier', 'RandomForestRegressor']:
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
        elif type(model).__name__ in ['CatBoostClassifier', 'CatBoostRegressor']:
            import json, tempfile, os as _os
            
            # CatBoost uses "oblivious trees" (symmetric trees).
            # Each level splits ALL branches on the SAME feature.
            # We export to JSON to read the splits and leaf_values.
            tmp = tempfile.mktemp(suffix='.json')
            model.save_model(tmp, format='json')
            with open(tmp) as f:
                raw = json.load(f)
            _os.remove(tmp)
            
            float_features = raw.get('features_info', {}).get('float_features', [])
            # Build feature index -> name mapping from the model JSON
            feat_idx_to_name = {}
            for ff in float_features:
                feat_idx_to_name[ff['feature_index']] = ff.get('feature_id', f"Feat_{ff['feature_index']}")
            
            trees = raw.get('oblivious_trees', [])
            nodes = []
            edges = []
            
            if trees:
                tree0 = trees[0]
                splits = tree0.get('splits', [])
                leaf_values = tree0.get('leaf_values', [])
                depth = len(splits)
                
                # Build top-down condition nodes (one per level in an oblivious tree)
                for level, sp in enumerate(splits[:3]):  # max 3 levels
                    feat_idx = sp.get('float_feature_index', 0)
                    border = sp.get('border', 0.0)
                    feat_name = feat_idx_to_name.get(feat_idx, f"Feat_{feat_idx}")
                    
                    node_id = f"cond_{level}"
                    nodes.append({
                        "id": node_id,
                        "label": f"{feat_name} <= {border:.2f}",
                        "type": "condition"
                    })
                    
                    if level > 0:
                        parent_id = f"cond_{level-1}"
                        edges.append({"source": parent_id, "target": node_id, "label": "Yes"})
                
                # Add leaf nodes (2^depth leaves)
                for i, lv in enumerate(leaf_values[:4]):  # show max 4 leaves
                    leaf_id = f"leaf_{i}"
                    if is_classification:
                        class_idx = 1 if lv > 0 else 0
                        label = f"Class {class_idx}"
                        color = "green" if class_idx == 1 else "red"
                    else:
                        label = f"Val: {lv:.3f}"
                        color = "gray"
                    
                    nodes.append({
                        "id": leaf_id,
                        "label": label,
                        "type": "leaf",
                        "color": color
                    })
                    
                    # Connect last condition node to leaves
                    last_cond = f"cond_{min(len(splits)-1, 2)}"
                    label_edge = "Yes" if i % 2 == 0 else "No"
                    edges.append({"source": last_cond, "target": leaf_id, "label": label_edge})
            
            result["decisionTree"] = {
                "nodes": nodes,
                "edges": edges
            }
    except Exception as e:
        print(f"Failed to generate decision tree logic: {e}")

    return result

def apply_data_cleaning(df, config, add_log):
    """Apply data cleaning strategies (missing values, outliers)."""
    import numpy as np
    
    initial_len = len(df)
    
    # 1. Missing Data Strategy
    missing_strategy = config.get("missing_data_strategy", "drop")
    if missing_strategy == "ffill":
        add_log("Applying Forward Fill (ffill) for missing data...")
        df.ffill(inplace=True)
        df.dropna(inplace=True) # Drop remaining NaNs (e.g. at the beginning)
    elif missing_strategy == "mean":
        add_log("Applying Mean Imputation for missing data...")
        df.fillna(df.mean(), inplace=True)
        df.dropna(inplace=True)
    else:
        # Default: drop
        df.dropna(inplace=True)
        
    dropped = initial_len - len(df)
    if dropped > 0 and missing_strategy == "drop":
        add_log(f"Dropped {dropped} rows containing missing values.")
        
    # 2. Outlier Removal
    outlier_strategy = config.get("outlier_removal", "none")
    if outlier_strategy == "zscore" and len(df) > 10:
        add_log("Applying Z-Score outlier removal (>3 std dev)...")
        from scipy import stats
        num_cols = df.select_dtypes(include=[np.number]).columns
        z_scores = np.abs(stats.zscore(df[num_cols].fillna(0)))
        z_scores = np.nan_to_num(z_scores) # Handle constant columns
        df = df[(z_scores < 3).all(axis=1)]
        add_log(f"Removed {initial_len - len(df) - dropped} outlier rows using Z-Score.")
    elif outlier_strategy == "iqr" and len(df) > 10:
        add_log("Applying IQR outlier clipping...")
        num_cols = df.select_dtypes(include=[np.number]).columns
        Q1 = df[num_cols].quantile(0.25)
        Q3 = df[num_cols].quantile(0.75)
        IQR = Q3 - Q1
        lower_bound = Q1 - 1.5 * IQR
        upper_bound = Q3 + 1.5 * IQR
        # Clip values to bounds instead of dropping to preserve time series continuity
        df[num_cols] = df[num_cols].clip(lower=lower_bound, upper=upper_bound, axis=1)
        add_log("Clipped outliers using IQR method.")
        
    return df
