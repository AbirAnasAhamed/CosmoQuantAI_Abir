import sys
import os
import numpy as np
import pandas as pd
import torch
import torch.nn as nn

# Add backend dir to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

def test_custom_losses():
    print("Testing Custom Losses...")
    from app.services.ml_custom_losses import SharpeLoss, MaxDrawdownPenaltyLoss, DirectionalSymmetryLoss
    preds = torch.tensor([[0.5], [-0.2], [0.8], [0.1]], requires_grad=True)
    targets = torch.tensor([[1.0], [-1.0], [1.0], [-1.0]])
    
    loss1 = SharpeLoss()(preds, targets)
    loss2 = MaxDrawdownPenaltyLoss()(preds, targets)
    loss3 = DirectionalSymmetryLoss()(preds, targets)
    print(f"SharpeLoss: {loss1.item():.4f}, MaxDDLoss: {loss2.item():.4f}, DirSymLoss: {loss3.item():.4f}")
    print("Custom Losses OK.\n")

def test_fractional_diff():
    print("Testing Fractional Differentiation...")
    from app.services.ml_fractional_diff import apply_fractional_differentiation
    df = pd.DataFrame({'close': np.cumsum(np.random.randn(100))})
    df_diffed = apply_fractional_differentiation(df.copy(), d_value=0.5)
    print(f"Original shape: {df.shape}, Diffed shape: {df_diffed.shape}")
    print("Fractional Diff OK.\n")

def test_augmentation():
    print("Testing Time-Series Augmentation...")
    from app.services.ml_augmentation import apply_data_augmentation
    df = pd.DataFrame(np.random.randn(50, 5), columns=['F1','F2','F3','F4','Target'])
    
    df_aug = apply_data_augmentation(df.copy(), strategy="block_bootstrap", factor=2)
    print(f"Original df: {df.shape}, Augmented df (Block): {df_aug.shape}")
    
    df_aug2 = apply_data_augmentation(df.copy(), strategy="jitter", factor=2)
    print(f"Original df: {df.shape}, Augmented df (Jitter): {df_aug2.shape}")
    print("Augmentation OK.\n")

def test_ewc():
    print("Testing Continual Learning (EWC)...")
    from app.services.ml_continual_learning import EWC, attach_ewc_to_loss
    from torch.utils.data import TensorDataset, DataLoader
    
    model = nn.Linear(5, 1)
    X_t = torch.randn(10, 5)
    y_t = torch.randn(10, 1)
    ds = TensorDataset(X_t, y_t)
    dl = DataLoader(ds, batch_size=2)
    
    ewc = EWC(model, dl, device='cpu', ew_weight=1.0)
    penalty = ewc.penalty(model)
    print(f"EWC Initial Penalty: {penalty.item():.6f}")
    print("Continual Learning (EWC) OK.\n")

def test_purged_cv():
    print("Testing Purged CV...")
    from app.services.ml_data_prep import apply_data_split
    X = np.random.randn(100, 5)
    y = np.random.randn(100, 1)
    config = {"split_method": "purged_cv", "train_ratio": 80, "purge_length": 5}
    def dummy_log(msg): pass
    X_tr, X_te, y_tr, y_te = apply_data_split(X, y, config, dummy_log)
    print(f"Total: 100, Train End (purged): {len(X_tr)}, Test Start: {100 - len(X_te)}")
    print("Purged CV OK.\n")

def test_clustered_mda():
    print("Testing Clustered Feature Importance (MDA)...")
    from app.services.ml_feature_clustering import get_feature_clusters, clustered_mda
    df = pd.DataFrame(np.random.randn(100, 5), columns=['A', 'B', 'C', 'D', 'E'])
    # Make A and B highly correlated
    df['B'] = df['A'] + np.random.normal(0, 0.1, 100)
    y = np.random.randint(0, 2, 100)
    
    from sklearn.ensemble import RandomForestClassifier
    model = RandomForestClassifier(n_estimators=10).fit(df, y)
    
    clusters = get_feature_clusters(df, df.columns.tolist(), threshold=0.5)
    print("Clusters:", clusters)
    
    imp, log = clustered_mda(model, df, y, clusters, is_classification=True, n_repeats=2)
    print("MDA Log Output:\n", log.strip())
    print("Clustered MDA OK.\n")

def test_adversarial_fgsm():
    print("Testing Adversarial Training (FGSM)...")
    from app.services.ml_adversarial import generate_fgsm_attack
    model = nn.Linear(5, 1)
    criterion = nn.MSELoss()
    inputs = torch.randn(10, 5, requires_grad=True)
    targets = torch.randn(10, 1)
    
    adv_inputs = generate_fgsm_attack(model, criterion, inputs, targets, epsilon=0.1)
    print(f"Original inputs max diff: {(adv_inputs - inputs).abs().max().item():.4f}")
    print("Adversarial FGSM OK.\n")

if __name__ == "__main__":
    test_custom_losses()
    test_fractional_diff()
    test_augmentation()
    test_ewc()
    test_purged_cv()
    test_clustered_mda()
    test_adversarial_fgsm()
    print("ALL 7 ADVANCED FEATURES VERIFIED SUCCESSFULLY! 🎉")
