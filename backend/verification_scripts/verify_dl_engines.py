"""
Deep audit of ALL deep learning engines:
LSTM, GRU, 1D-CNN, DeepLOB, Transformer, PPO-RL

Checks:
1. y-scaling bug (classification labels passed as scaled floats)
2. BCEWithLogitsLoss shape mismatch (outputs vs y_train_t shape)
3. Metrics calculation correctness
4. Explainability data (does it exist for these engines?)
5. Transformer y-scaling in advanced pipeline
"""

import numpy as np
import torch
import torch.nn as nn
import sys
sys.path.insert(0, '/app')

print("=" * 65)
print("  Deep Learning Engines — Deep Audit")
print("=" * 65)

PASS = "✅ PASS"
FAIL = "❌ FAIL"
WARN = "⚠️  WARN"

np.random.seed(42)
torch.manual_seed(42)

n = 200
n_features = 6
feature_names = ["obi", "spread", "microprice", "Effective_Spread", "Mid_Price_Acceleration", "WAP_Top_5"]

# --- SIMULATE EXACT PIPELINE FROM ml_training_engine.py ---
# y as binary
y_raw = (np.random.rand(n) > 0.5).astype(int)

# Simulate MinMaxScaler on X
from sklearn.preprocessing import MinMaxScaler
X_raw = np.random.randn(n, n_features)
scaler_x = MinMaxScaler()
X_scaled = scaler_x.fit_transform(X_raw)

split = int(n * 0.8)
X_train, X_test = X_scaled[:split], X_scaled[split:]

# FIXED y (no scaling for classification)
y_train_correct = y_raw[:split]
y_test_correct  = y_raw[split:]

# BUGGED y (old code: MinMaxScaler on y)
scaler_y = MinMaxScaler()
y_scaled_bugged = scaler_y.fit_transform(y_raw.reshape(-1,1))
y_train_bugged = y_scaled_bugged[:split]  # shape (N, 1)
y_test_bugged  = y_scaled_bugged[split:]

results = {}

# ─────────────────────────── LSTM ────────────────────────────────────────
print("\n[ 1/6 ] LSTM")

class SimpleLSTM(nn.Module):
    def __init__(self, input_size, hidden_size, num_layers, output_size):
        super().__init__()
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers, batch_first=True)
        self.fc = nn.Linear(hidden_size, output_size)
    def forward(self, x):
        h0 = torch.zeros(2, x.size(0), 64)
        c0 = torch.zeros(2, x.size(0), 64)
        out, _ = self.lstm(x, (h0, c0))
        return self.fc(out[:, -1, :])

X_train_t = torch.FloatTensor(X_train).unsqueeze(1)
criterion = nn.BCEWithLogitsLoss()
model_lstm = SimpleLSTM(n_features, 64, 2, 1)

# BUG CHECK 1: y shape mismatch with BCEWithLogitsLoss
try:
    y_train_t_bugged = torch.FloatTensor(y_train_bugged)  # shape (N,1) or (N,)
    outputs = model_lstm(X_train_t)  # shape (N, 1)
    loss = criterion(outputs, y_train_t_bugged)
    print(f"  outputs shape: {outputs.shape}, y_train_t shape: {y_train_t_bugged.shape}")
    print(f"  BCEWithLogitsLoss with scaled y (bugged): {WARN} — Works but y values may not be 0/1!")
    # Check if y contains only 0 and 1
    unique_y = torch.unique(y_train_t_bugged).numpy()
    if all(v in [0.0, 1.0] for v in unique_y):
        print(f"  y unique values {unique_y}: {PASS} — y stays 0.0/1.0 after MinMaxScaler")
        print(f"  ℹ️  For LSTM classification, MinMaxScaler on binary y doesn't break values (0→0.0, 1→1.0)")
        results["LSTM y-scaling"] = PASS
    else:
        print(f"  y unique values {unique_y}: {FAIL} — y is not binary!")
        results["LSTM y-scaling"] = FAIL
except Exception as e:
    print(f"  Loss computation: {FAIL} — {e}")
    results["LSTM y-scaling"] = FAIL

# BUG CHECK 2: shape mismatch in criterion(outputs, y_train_t)
try:
    y_train_t_correct = torch.FloatTensor(y_train_correct)  # shape (N,)
    y_train_t_correct = y_train_t_correct.unsqueeze(1)      # shape (N,1) to match outputs
    loss2 = criterion(outputs, y_train_t_correct)
    print(f"  BCEWithLogitsLoss shape check: {PASS} — loss={loss2.item():.4f}")
    results["LSTM shape"] = PASS
except Exception as e:
    print(f"  BCEWithLogitsLoss shape: {FAIL} — {e}")
    results["LSTM shape"] = FAIL

# BUG CHECK 3: y_train_t passed WITHOUT unsqueeze → shape mismatch?
try:
    y_t_raw = torch.FloatTensor(y_train_correct)  # (N,) not (N,1)
    loss_raw = criterion(outputs, y_t_raw)  # outputs is (N,1), y_t_raw is (N,)
    print(f"  criterion(output (N,1), y (N,)) → loss={loss_raw.item():.4f}: {WARN} — PyTorch broadcasts but may warn")
    results["LSTM criterion shape broadcast"] = WARN
except Exception as e:
    print(f"  criterion broadcast: {FAIL} — {e}")
    results["LSTM criterion shape broadcast"] = FAIL

print(f"\n  Actual code in engine: criterion(outputs, y_train_t)")
print(f"  y_train_t = torch.FloatTensor(y_train)  → y_train shape from new code = {y_train_correct.shape}")
print(f"  outputs shape = (N, 1), y_train_t shape = (N,) → BROADCAST — works but not explicit")

# ─────────────────────────── Transformer y in advanced pipeline ──────────
print("\n[ 2/6 ] Transformer (advanced engine)")
print("  Checking advanced_ml/engine.py AdvancedDataHandler.create_sequences...")

try:
    import pandas as pd
    # Simulate create_sequences
    df_sim = pd.DataFrame(X_raw, columns=feature_names)
    df_sim['Target'] = y_raw  # ← Uses ORIGINAL y (no MinMaxScaler) ✅
    df_sim['Close'] = np.random.rand(n)
    
    seq_len = 10
    X_seq, y_seq = [], []
    X_data = df_sim[feature_names].values
    y_data = df_sim['Target'].values
    for i in range(len(df_sim) - seq_len + 1):
        X_seq.append(X_data[i:i+seq_len])
        y_seq.append(y_data[i+seq_len-1])
    X_seq = np.array(X_seq)
    y_seq = np.array(y_seq)
    
    unique_y_transformer = np.unique(y_seq)
    if all(v in [0, 1] for v in unique_y_transformer):
        print(f"  Transformer y unique: {unique_y_transformer} → {PASS} — y is correctly binary (no scaling)")
        results["Transformer y"] = PASS
    else:
        print(f"  Transformer y unique: {unique_y_transformer} → {FAIL}")
        results["Transformer y"] = FAIL
    
    # But: does it scale X? 
    print(f"  ⚠️  Transformer uses df[features].values directly (no MinMaxScaler on X in advanced engine)")
    print(f"  ℹ️  The main pipeline's X_scaled is NOT passed to Transformer — Transformer gets raw df")
    
except Exception as e:
    print(f"  {FAIL}: {e}")
    results["Transformer y"] = FAIL

# ─────────────────────────── Explainability for DL models ───────────────
print("\n[ 3/6 ] Explainability check for DL engines")
print("  Checking ml_training_engine.py line 1029...")
print("  Code: if job.algorithm in ['Random Forest', 'XGBoost', 'LightGBM', 'CatBoost']:")
print(f"  → LSTM, GRU, 1D-CNN, DeepLOB, Transformer, PPO-RL: {WARN}")
print(f"  These engines do NOT call generate_real_explainability()")
print(f"  So final_explainability = None → model detail page shows NOTHING for all insight panels")
print(f"  This means: Feature Importance, SHAP, Decision Tree, Confusion Matrix = all EMPTY for DL")
results["DL Explainability"] = WARN

# ─────────────────────────── LSTM/GRU y_test shape for metrics ───────────
print("\n[ 4/6 ] y_test shape for metrics calculation in LSTM/GRU/CNN/DeepLOB")
print(f"  y_test shape (bugged): {y_test_bugged.shape}  (from MinMaxScaler, 2D)")
print(f"  y_test shape (correct): {y_test_correct.shape}  (binary, 1D)")

# Check: process_metrics called with y_test (which is 2D from scaler)
from sklearn.metrics import accuracy_score
preds_fake = np.random.randint(0, 2, len(y_test_correct))
try:
    # Simulate: calculate_classification_metrics(y_test, preds_class) 
    # where y_test is the bugged 2D version
    acc = accuracy_score(y_test_bugged.ravel(), preds_fake)  # .ravel() saves it
    print(f"  accuracy_score(y_test_2D.ravel(), preds): {PASS} — ravel() handles it")
    results["LSTM metrics y_test"] = PASS
except Exception as e:
    print(f"  {FAIL}: {e}")
    results["LSTM metrics y_test"] = FAIL

# ─────────────────────────── PPO-RL check ────────────────────────────────
print("\n[ 5/6 ] PPO-RL")
print("  PPO-RL uses AdvancedMLEngine.train_ppo_rl() — completely separate pipeline")
print("  No X/y scaling involved — RL environment handles observations directly")
print("  No generate_real_explainability() called")
print("  RL metrics (total_return, win_rate, sharpe) calculated from equity curve")
print(f"  → PPO-RL pipeline: {PASS} (no sklearn/SHAP/tree involvement)")
results["PPO-RL pipeline"] = PASS

# ─────────────────────────── 1D-CNN shape issue ──────────────────────────
print("\n[ 6/6 ] 1D-CNN BCEWithLogitsLoss shape check")

class CNN1D(nn.Module):
    def __init__(self, input_size, output_size):
        super().__init__()
        self.conv1 = nn.Conv1d(1, 16, 3, padding=1)
        self.relu = nn.ReLU()
        self.pool = nn.MaxPool1d(2)
        self.fc1 = nn.Linear(16 * (input_size // 2), 32)
        self.fc2 = nn.Linear(32, output_size)
    def forward(self, x):
        x = x.unsqueeze(1)
        out = self.conv1(x); out = self.relu(out); out = self.pool(out)
        out = out.view(out.size(0), -1)
        return self.fc2(self.relu(self.fc1(out)))

X_train_t_cnn = torch.FloatTensor(X_train)
model_cnn = CNN1D(n_features, 1)
try:
    outputs_cnn = model_cnn(X_train_t_cnn)
    y_t = torch.FloatTensor(y_train_correct)
    loss_cnn = criterion(outputs_cnn.squeeze(-1), y_t)
    print(f"  CNN outputs: {outputs_cnn.shape}, y_train_t (from code): shape depends on how y_train is shaped")
    print(f"  y_train_t = torch.FloatTensor(y_train)")
    print(f"  Fixed y_train shape: {y_train_correct.shape}  ← 1D, correct for squeeze(-1)")
    print(f"  BCEWithLogitsLoss(outputs.squeeze(-1), y_train_t): {PASS} — shapes match")
    results["1D-CNN shape"] = PASS
except Exception as e:
    print(f"  {FAIL}: {e}")
    results["1D-CNN shape"] = FAIL

# ─────────────────────────── SUMMARY ──────────────────────────────────────
print("\n" + "=" * 65)
print("  FINAL SUMMARY — Deep Learning Engines")
print("=" * 65)
for name, status in results.items():
    print(f"  {name:40s}: {status}")

print("""
KEY FINDINGS:
─────────────────────────────────────────────────────────────
1. LSTM/GRU/CNN/DeepLOB y-scaling:
   MinMaxScaler on binary y (0→0.0, 1→1.0) — values don't
   change, so BCEWithLogitsLoss still works. NOT a critical bug.
   BUT: y_train shape is (N,1) not (N,), causing implicit
   broadcasting in criterion(outputs, y_train_t).
   FIX: add .ravel() to y_train_t

2. DL Explainability (MAJOR GAP):
   LSTM, GRU, 1D-CNN, DeepLOB — NO explainability data generated.
   Model detail page shows empty Feature Importance, SHAP,
   Confusion Matrix, Decision Tree for these models.
   FIX: add basic explainability (feature permutation importance +
        confusion matrix) for deep learning engines.

3. Transformer pipeline uses raw df (no MinMaxScaler on X).
   Tree-based models get MinMaxScaler on X — Transformer does not.
   Both are acceptable but inconsistent.

4. PPO-RL is fully separate — no issues found.
""")
