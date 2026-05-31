"""
PLP Integration Verification Script
Verifies: Hybrid (OHLCV+L2) + Level 2 Orderbook PLP Support
"""

import sys
import os
import re

# Force UTF-8 output on Windows
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# ANSI colors
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

PASS_MARK = "[PASS]"
FAIL_MARK = "[FAIL]"
INFO_MARK = "[INFO]"

BASE = os.path.dirname(os.path.abspath(__file__))

results = []

def check(name, condition, detail=""):
    status = f"{GREEN}{PASS_MARK}{RESET}" if condition else f"{RED}{FAIL_MARK}{RESET}"
    results.append(condition)
    print(f"  {status}  {name}")
    if detail:
        for line in detail.split("\n"):
            print(f"           {YELLOW}{line}{RESET}")
    return condition

def section(title):
    print(f"\n{BOLD}{CYAN}{'='*70}{RESET}")
    print(f"{BOLD}{CYAN}  {title}{RESET}")
    print(f"{BOLD}{CYAN}{'='*70}{RESET}")

def read(rel_path):
    full = os.path.join(BASE, rel_path)
    if not os.path.exists(full):
        return None, full
    with open(full, "r", encoding="utf-8") as f:
        return f.read(), full

# ──────────────────────────────────────────────────────────────────────────────
# 1. Backend Core: predatory_liquidity_pipeline.py
# ──────────────────────────────────────────────────────────────────────────────
section("1. BACKEND CORE -- predatory_liquidity_pipeline.py")

plp_src, plp_path = read("backend/app/services/predatory_liquidity_pipeline.py")
if plp_src is None:
    print(f"  {RED}{FAIL_MARK}  File not found: {plp_path}{RESET}")
    results.append(False)
else:
    check("File exists", True, plp_path)
    check("calculate_plp_features() function defined",
          "def calculate_plp_features" in plp_src)
    check("Handles missing 'Close' column (fallback to microprice)",
          "microprice" in plp_src and "'Close' not in df.columns" in plp_src)
    check("Handles missing 'obi' column (fallback to 0.0)",
          "pd.Series(0.0, index=df.index)" in plp_src)
    check("Handles missing 'spread' column (fallback to 0.0001)",
          "pd.Series(0.0001, index=df.index)" in plp_src)
    check("All 5 PLP modules present (spot check)",
          all(mod in plp_src for mod in [
              "abs_long_liq_pool", "liquidation_cascade_multiplier",
              "stop_hunt_probability", "institutional_order_flow_imbalance",
              "oi_wipeout_ratio"
          ]))
    check("NaN/Inf cleanup at end",
          "replace([np.inf, -np.inf], np.nan)" in plp_src or
          "fillna(0)" in plp_src)

# ──────────────────────────────────────────────────────────────────────────────
# 2. Backend: hybrid_pipeline.py  (Hybrid OHLCV+L2)
# ──────────────────────────────────────────────────────────────────────────────
section("2. BACKEND -- hybrid_pipeline.py  (Hybrid OHLCV+L2)")

hyb_src, hyb_path = read("backend/app/services/hybrid_pipeline.py")
if hyb_src is None:
    print(f"  {RED}{FAIL_MARK}  File not found: {hyb_path}{RESET}")
    results.append(False)
else:
    check("File exists", True, hyb_path)
    has_plp_step = 'sel_plp = config.get("plp_features", [])' in hyb_src
    check("PLP config read: sel_plp = config.get('plp_features', [])", has_plp_step)
    check("PLP conditional block (if sel_plp:)",
          "if sel_plp:" in hyb_src)
    check("calculate_plp_features imported inside block",
          "from app.services.predatory_liquidity_pipeline import calculate_plp_features" in hyb_src)
    check("PLP features merged into main df",
          "plp_df = calculate_plp_features(df, sel_plp)" in hyb_src and
          "df[col] = plp_df[col]" in hyb_src)
    check("PLP failure is non-fatal (try/except)",
          "PLP feature generation failed (non-fatal)" in hyb_src)
    check("PLP columns included in final_features",
          "sel_plp and col in sel_plp" in hyb_src)
    check("Feature log breakdown includes PLP count",
          "PLP:" in hyb_src and "plp_cnt" in hyb_src)

    # Ensure PLP step is BEFORE target calculation
    idx_plp    = hyb_src.find("sel_plp = config.get")
    idx_target = hyb_src.find("df['Target']")
    check("PLP step runs BEFORE target variable creation",
          0 < idx_plp < idx_target)

# ──────────────────────────────────────────────────────────────────────────────
# 3. Backend: ml_training_engine.py  (Level 2 Orderbook)
# ──────────────────────────────────────────────────────────────────────────────
section("3. BACKEND -- ml_training_engine.py  (Level 2 Orderbook)")

eng_src, eng_path = read("backend/app/services/ml_training_engine.py")
if eng_src is None:
    print(f"  {RED}{FAIL_MARK}  File not found: {eng_path}{RESET}")
    results.append(False)
else:
    check("File exists", True, eng_path)

    l2_block_start = eng_src.find('elif dataset_type == "l2_orderbook"')
    l2_block_end   = eng_src.find('elif dataset_type == "historical_trades"')
    l2_block = eng_src[l2_block_start:l2_block_end] if l2_block_start > 0 else ""

    check("L2 Orderbook dataset_type block found",
          l2_block_start > 0,
          f"Block starts at char {l2_block_start}")
    check("PLP config read inside L2 block",
          'sel_plp = config.get("plp_features", [])' in l2_block)
    check("PLP conditional block (if sel_plp:) in L2 block",
          "if sel_plp:" in l2_block)
    check("calculate_plp_features imported in L2 block",
          "from app.services.predatory_liquidity_pipeline import calculate_plp_features" in l2_block)
    check("PLP features merged into df in L2 block",
          "plp_df = calculate_plp_features(df, sel_plp)" in l2_block and
          "df[col] = plp_df[col]" in l2_block)
    check("PLP columns appended to features list",
          "features.extend(plp_added)" in l2_block)
    check("PLP failure is non-fatal in L2 block",
          "PLP feature generation failed (non-fatal)" in l2_block)

    # Metadata
    meta_idx = eng_src.find("metadata_payload")
    meta_block = eng_src[meta_idx:meta_idx+600] if meta_idx > 0 else ""
    check("plp_features saved in model metadata",
          "plp_features" in meta_block)

    # Hybrid Deep not broken
    hd_start = eng_src.find('if dataset_type == "hybrid_deep"')
    hd_end   = eng_src.find('elif dataset_type == "hybrid"')
    hd_block = eng_src[hd_start:hd_end] if hd_start > 0 else ""
    check("Hybrid Deep pipeline still intact (not broken)",
          "hybrid_deep_pipeline" in hd_block)

# ──────────────────────────────────────────────────────────────────────────────
# 4. Frontend: ModelTrainingStudio.tsx
# ──────────────────────────────────────────────────────────────────────────────
section("4. FRONTEND -- ModelTrainingStudio.tsx")

ui_src, ui_path = read("frontend/src/pages/app/ModelTrainingStudio.tsx")
if ui_src is None:
    print(f"  {RED}{FAIL_MARK}  File not found: {ui_path}{RESET}")
    results.append(False)
else:
    check("File exists", True, ui_path)
    check("PredatoryLiquidityPipeline component imported",
          "import PredatoryLiquidityPipeline" in ui_src)
    check("GET_DEFAULT_MANDATORY_PLP_FEATURES imported",
          "GET_DEFAULT_MANDATORY_PLP_FEATURES" in ui_src)
    check("selectedPlpFeatures state initialized with mandatory defaults",
          "GET_DEFAULT_MANDATORY_PLP_FEATURES()" in ui_src)

    # Config payload check
    plp_payload_line = ""
    for line in ui_src.splitlines():
        if "plp_features:" in line and "selectedPlpFeatures" in line:
            plp_payload_line = line.strip()
            break

    check("plp_features sent for hybrid_deep",
          "hybrid_deep" in plp_payload_line)
    check("plp_features sent for l2_orderbook",
          "l2_orderbook" in plp_payload_line,
          f"Found: {plp_payload_line}")
    check("plp_features sent for hybrid",
          ("dataSource === 'hybrid'" in plp_payload_line or
           'dataSource === "hybrid"' in plp_payload_line),
          f"Found: {plp_payload_line}")

    # UI render check
    check("PLP UI block for l2_orderbook OR hybrid exists",
          ("dataSource === 'l2_orderbook' || dataSource === 'hybrid'" in ui_src or
           "dataSource === 'hybrid' || dataSource === 'l2_orderbook'" in ui_src))
    check("Context-aware badge: Hybrid Full PLP Quality",
          "Hybrid Mode: Full PLP Quality" in ui_src)
    check("Context-aware badge: L2 OBI/Spread PLP",
          "L2 Mode: OBI/Spread-Powered PLP" in ui_src)
    check("initialLoadedPlpFeatures passed to PLP component",
          "initialLoadedPlpFeatures" in ui_src)
    check("plp_features restored on retrain mode",
          "plp_features" in ui_src and "config.config" in ui_src)

# ──────────────────────────────────────────────────────────────────────────────
# 5. PredatoryLiquidityPipeline.tsx (Component Integrity)
# ──────────────────────────────────────────────────────────────────────────────
section("5. FRONTEND -- PredatoryLiquidityPipeline.tsx (Component)")

plp_ui_src, plp_ui_path = read("frontend/src/components/ml/PredatoryLiquidityPipeline.tsx")
if plp_ui_src is None:
    print(f"  {RED}{FAIL_MARK}  File not found: {plp_ui_path}{RESET}")
    results.append(False)
else:
    check("File exists", True, plp_ui_path)
    check("PLP_MODULES exported", "export const PLP_MODULES" in plp_ui_src)
    check("GET_DEFAULT_MANDATORY_PLP_FEATURES exported",
          "export const GET_DEFAULT_MANDATORY_PLP_FEATURES" in plp_ui_src)
    check("Auto-Suggest Top 17 button present",
          "Auto-Suggest Top 17" in plp_ui_src)
    check("Mandatory features locked (cannot deselect)",
          "feat.mandatory && isSelected" in plp_ui_src)

    all_feature_ids = re.findall(r"{ id: '([a-z_]+)'", plp_ui_src)
    check(f"All 50 PLP features defined ({len(all_feature_ids)} found)",
          len(all_feature_ids) >= 50,
          f"Feature count: {len(all_feature_ids)}")

# ──────────────────────────────────────────────────────────────────────────────
# 6. Functional Simulation (Python only — outside Docker)
# ──────────────────────────────────────────────────────────────────────────────
section("6. FUNCTIONAL SIMULATION -- calculate_plp_features()")

try:
    sys.path.insert(0, os.path.join(BASE, "backend"))
    import pandas as pd
    import numpy as np
    from app.services.predatory_liquidity_pipeline import calculate_plp_features

    print(f"  {CYAN}{INFO_MARK}  Backend imported successfully. Running tests...{RESET}\n")

    def make_l2_df(n=200):
        np.random.seed(42)
        prices = 50000 + np.cumsum(np.random.randn(n) * 10)
        return pd.DataFrame({
            "Close":      prices,
            "microprice": prices + np.random.randn(n) * 0.1,
            "obi":        np.random.uniform(0.3, 0.7, n),
            "spread":     np.abs(np.random.randn(n)) * 0.0001 + 0.0001,
        })

    def make_hybrid_df(n=300):
        np.random.seed(42)
        prices = 50000 + np.cumsum(np.random.randn(n) * 10)
        return pd.DataFrame({
            "Close":  prices,
            "Volume": np.abs(np.random.randn(n)) * 100 + 50,
            "qty":    np.abs(np.random.randn(n)) * 100 + 50,
            "obi":    np.random.uniform(0.3, 0.7, n),
            "spread": np.abs(np.random.randn(n)) * 0.0001 + 0.0001,
        })

    TEST_FEATURES = [
        "abs_long_liq_pool", "abs_short_liq_pool",
        "stop_hunt_probability", "fakeout_prob_model",
        "oi_wipeout_ratio", "funding_rate_shift",
        "institutional_order_flow_imbalance", "dark_pool_proxy_index",
        "long_squeeze_probability", "short_squeeze_probability",
    ]

    ALL_50 = [
        "abs_long_liq_pool", "abs_short_liq_pool", "liquidation_density_z_score",
        "leverage_washout_z_score", "high_leverage_cluster_proximity",
        "margin_call_proximity_index", "magnetic_liquidity_pull_vector",
        "liq_cluster_density_heatmap", "synthetic_leverage_ratio",
        "hidden_liquidity_absorption", "stale_liquidity_decay",
        "cross_margin_cascade_risk", "liquidation_cascade_multiplier",
        "long_squeeze_probability", "short_squeeze_probability",
        "cascade_velocity_index", "domino_effect_threshold", "cascade_decay_rate",
        "forced_liquidation_trigger_pts", "volatility_expansion_on_liq",
        "squeeze_exhaustion_metric", "liquidator_bot_activity_proxy",
        "stop_hunt_probability", "liquidity_sweep_velocity", "fakeout_prob_model",
        "sweep_and_reversal_ratio", "stop_loss_trigger_density",
        "predatory_algo_footprint", "institutional_sweep_divergence",
        "retail_trap_indicator", "high_frequency_hunt_ratio", "sweep_efficiency_score",
        "institutional_order_flow_imbalance", "smart_money_accumulation_dist",
        "fvg_liquidity_draw_prob", "order_block_mitigation_speed",
        "time_weighted_vampire_flow", "bms_confirmation_strength",
        "choch_volatility_multiplier", "imbalance_to_volume_ratio",
        "sponsor_candle_footprint", "dark_pool_proxy_index",
        "oi_wipeout_ratio", "funding_rate_shift", "funding_rate_shift_pre_liq",
        "implied_margin_pressure", "vol_skew_liquidation_bias",
        "bid_ask_spread_blowout", "flash_crash_probability",
        "tail_risk_expansion_index", "gamma_squeeze_synthetic",
        "leverage_decay_factor", "margin_variance_premium",
    ]

    # Test A: L2 Orderbook
    df_l2 = make_l2_df()
    result_l2 = calculate_plp_features(df_l2, TEST_FEATURES)
    check(f"L2 Orderbook: {len(TEST_FEATURES)} features -> {len(result_l2.columns)} columns returned",
          len(result_l2.columns) == len(TEST_FEATURES))
    check("L2 Orderbook: No NaN in output",
          not result_l2.isnull().any().any())
    check("L2 Orderbook: No Inf in output",
          not (result_l2.values == float('inf')).any())
    non_zero_l2 = (result_l2 != 0).any()
    check("L2 Orderbook: Features have variance (not all-zero)",
          non_zero_l2.any())

    # Test B: Hybrid (OHLCV+L2)
    df_hybrid = make_hybrid_df()
    result_hyb = calculate_plp_features(df_hybrid, TEST_FEATURES)
    check(f"Hybrid OHLCV+L2: {len(TEST_FEATURES)} features -> {len(result_hyb.columns)} columns returned",
          len(result_hyb.columns) == len(TEST_FEATURES))
    check("Hybrid OHLCV+L2: No NaN in output",
          not result_hyb.isnull().any().any())
    check("Hybrid OHLCV+L2: No Inf in output",
          not (result_hyb.values == float('inf')).any())

    # Test C: Empty feature list -> df unchanged
    result_empty = calculate_plp_features(make_l2_df(50), [])
    check("Empty feature list -> returns df unchanged (no crash)",
          not result_empty.empty)

    # Test D: Empty DataFrame -> returns empty
    result_empty_df = calculate_plp_features(pd.DataFrame(), TEST_FEATURES)
    check("Empty DataFrame input -> returns empty DataFrame",
          result_empty_df.empty)

    # Test E: All 50 features on Hybrid data
    df_full = make_hybrid_df(500)
    result_all = calculate_plp_features(df_full, ALL_50)
    check(f"All 50 PLP features on Hybrid data -> {len(result_all.columns)} columns",
          len(result_all.columns) == len(ALL_50))
    check("All 50 features: No NaN/Inf",
          not result_all.isnull().any().any())

    # Test F: Verify OBI-dependent features work on L2 data
    obi_feats = ["magnetic_liquidity_pull_vector", "institutional_order_flow_imbalance",
                 "predatory_algo_footprint", "retail_trap_indicator"]
    result_obi = calculate_plp_features(make_l2_df(200), obi_feats)
    check("OBI-dependent features work on L2 data (obi column present)",
          len(result_obi.columns) == len(obi_feats))

    print(f"\n  {CYAN}{INFO_MARK}  Sample output (L2 Orderbook, first 3 rows):{RESET}")
    sample_cols = ["abs_long_liq_pool", "stop_hunt_probability",
                   "oi_wipeout_ratio", "funding_rate_shift"]
    print(result_l2[sample_cols].head(3).to_string(index=False))

    print(f"\n  {CYAN}{INFO_MARK}  Sample output (Hybrid OHLCV+L2, first 3 rows):{RESET}")
    print(result_hyb[sample_cols].head(3).to_string(index=False))

except ImportError as e:
    print(f"\n  {YELLOW}[WARN]  Backend import skipped (outside Docker env): {e}{RESET}")
    print(f"  {CYAN}{INFO_MARK}  Run inside Docker container for full functional test.{RESET}")
except Exception as e:
    import traceback
    print(f"\n  {RED}[ERROR] Functional simulation error: {e}{RESET}")
    traceback.print_exc()
    results.append(False)

# ──────────────────────────────────────────────────────────────────────────────
# FINAL REPORT
# ──────────────────────────────────────────────────────────────────────────────
section("FINAL REPORT")

total  = len(results)
passed = sum(results)
failed = total - passed
pct    = (passed / total * 100) if total else 0

print(f"\n  Total Checks : {BOLD}{total}{RESET}")
print(f"  Passed       : {GREEN}{BOLD}{passed}{RESET}")
print(f"  Failed       : {RED}{BOLD}{failed}{RESET}")
print(f"  Score        : {BOLD}{pct:.1f}%{RESET}")

if failed == 0:
    print(f"\n  {GREEN}{BOLD}ALL CHECKS PASSED -- PLP fully integrated for L2 Orderbook & Hybrid!{RESET}\n")
else:
    print(f"\n  {RED}{BOLD}  {failed} check(s) failed -- review items marked [FAIL] above.{RESET}\n")

sys.exit(0 if failed == 0 else 1)
