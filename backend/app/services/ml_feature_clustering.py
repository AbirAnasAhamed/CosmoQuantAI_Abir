import numpy as np
import pandas as pd
from scipy.cluster import hierarchy
from scipy.spatial.distance import squareform
from sklearn.metrics import accuracy_score, mean_squared_error

def get_feature_clusters(df, features, threshold=0.5):
    """
    Clusters features based on their Spearman rank correlation.
    Returns a dictionary mapping cluster_id to a list of features.
    """
    # Calculate Spearman rank correlation
    corr = np.abs(df[features].corr(method='spearman').values)
    
    # Handle NaN correlations (e.g. from constant features with 0 variance)
    corr = np.nan_to_num(corr, nan=0.0)
    np.fill_diagonal(corr, 1.0)
    
    # Distance matrix
    # Clip correlations to avoid precision issues
    corr = np.clip(corr, 0, 1)
    distance_matrix = np.sqrt(0.5 * (1 - corr))
    
    # Linkage matrix using Ward
    linkage = hierarchy.ward(squareform(distance_matrix, checks=False))
    
    # Form flat clusters
    cluster_ids = hierarchy.fcluster(linkage, threshold, criterion='distance')
    
    clusters = {}
    for i, cluster_id in enumerate(cluster_ids):
        if cluster_id not in clusters:
            clusters[cluster_id] = []
        clusters[cluster_id].append(features[i])
        
    return clusters

def clustered_mda(model, X_val_df, y_val, clusters, is_classification=True, n_repeats=5):
    """
    Calculates Clustered Mean Decrease Accuracy/Error.
    Instead of shuffling one feature, it shuffles an entire cluster of correlated features.
    """
    # Baseline score
    baseline_pred = model.predict(X_val_df)
    if is_classification:
        # Handle probability vs class outputs
        if len(baseline_pred.shape) > 1 and baseline_pred.shape[1] > 1:
            baseline_pred = np.argmax(baseline_pred, axis=1)
        elif not np.issubdtype(baseline_pred.dtype, np.integer):
            baseline_pred = (baseline_pred > 0.5).astype(int)
        baseline_score = accuracy_score(y_val, baseline_pred)
    else:
        baseline_score = -mean_squared_error(y_val, baseline_pred) # Negative MSE so higher is better
        
    cluster_importance = {}
    
    for cluster_id, cluster_features in clusters.items():
        scores = []
        for _ in range(n_repeats):
            X_shuffled = X_val_df.copy()
            # Shuffle all features in the cluster identically
            idx = np.random.permutation(len(X_shuffled))
            for feature in cluster_features:
                X_shuffled[feature] = X_shuffled[feature].values[idx]
                
            pred = model.predict(X_shuffled)
            if is_classification:
                if len(pred.shape) > 1 and pred.shape[1] > 1:
                    pred = np.argmax(pred, axis=1)
                elif not np.issubdtype(pred.dtype, np.integer):
                    pred = (pred > 0.5).astype(int)
                score = accuracy_score(y_val, pred)
            else:
                score = -mean_squared_error(y_val, pred)
                
            scores.append(baseline_score - score)
            
        mean_decrease = np.mean(scores)
        # Assign this cluster importance evenly to its features
        for feature in cluster_features:
            cluster_importance[feature] = mean_decrease / len(cluster_features)
            
    # Normalize
    total_imp = sum(abs(v) for v in cluster_importance.values())
    if total_imp > 0:
        for k in cluster_importance:
            cluster_importance[k] = cluster_importance[k] / total_imp
            
    # Format log
    log = "\n[Clustered MDA Feature Importance (Top 5 Clusters)]\n"
    # Sort clusters by total importance
    cluster_scores = {cid: sum(cluster_importance[f] for f in feats) for cid, feats in clusters.items()}
    sorted_clusters = sorted(cluster_scores.items(), key=lambda x: x[1], reverse=True)[:5]
    
    for cid, score in sorted_clusters:
        feats_str = ", ".join(clusters[cid][:3])
        if len(clusters[cid]) > 3:
            feats_str += f" (+{len(clusters[cid])-3} more)"
        log += f"- Cluster {cid} [{feats_str}]: {score*100:.2f}%\n"
        
    return cluster_importance, log
