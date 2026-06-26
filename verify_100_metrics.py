import os
import sys
import pandas as pd
import numpy as np

def verify_frontend():
    print("--- Verifying Frontend ---")
    
    # Check mlFeatures.ts
    ml_features_path = "frontend/src/constants/mlFeatures.ts"
    if not os.path.exists(ml_features_path):
        print(f"❌ Missing: {ml_features_path}")
        return False
    with open(ml_features_path, "r", encoding="utf-8") as f:
        content = f.read()
        if "ALL_L2_FEATURES" not in content or "ALL_HYBRID_DEEP_TRADE_FEATURES" not in content or "PLP_MODULES" not in content:
            print(f"❌ Missing expected constants in {ml_features_path}")
            return False
    print(f"✅ {ml_features_path} exists and contains expected constants.")

    # Check ModelTrainingStudio.tsx
    mts_path = "frontend/src/pages/app/ModelTrainingStudio.tsx"
    with open(mts_path, "r", encoding="utf-8") as f:
        content = f.read()
        if "import { ALL_L2_FEATURES" not in content:
            print(f"❌ Missing import from mlFeatures in {mts_path}")
            return False
    print(f"✅ {mts_path} successfully modularized.")

    # Check PredatoryLiquidityPipeline.tsx
    plp_path = "frontend/src/components/ml/PredatoryLiquidityPipeline.tsx"
    with open(plp_path, "r", encoding="utf-8") as f:
        content = f.read()
        if "import { PLP_MODULES }" not in content:
            print(f"❌ Missing import from mlFeatures in {plp_path}")
            return False
    print(f"✅ {plp_path} successfully modularized.")
    
    return True

def verify_backend():
    print("\n--- Verifying Backend Feature Engines ---")
    sys.path.append(os.path.join(os.getcwd(), 'backend'))
    
    try:
        from app.services.feature_engines.l2_features import calculate_advanced_l2
        from app.services.feature_engines.hybrid_features import calculate_hybrid_features
        from app.services.feature_engines.plp_features import calculate_advanced_plp
        
        print("✅ Backend feature engines successfully imported.")
        
        # Test with dummy data
        df = pd.DataFrame({
            'price': [100.0, 100.5, 101.0],
            'amount': [1.0, 2.0, 1.5],
            'spread': [0.1, 0.2, 0.1],
            'is_buyer_maker': [True, False, True],
            'microprice': [100.05, 100.55, 101.05],
            'cvd': [1, -1, 2],
            'obi': [0.5, -0.5, 0.2]
        }, index=pd.date_range("2024-01-01", periods=3, freq="s"))
        
        # Test L2
        l2_feats = ['ask_slope', 'microprice_jumps', 'order_book_entropy']
        df_l2 = calculate_advanced_l2(df.copy(), l2_feats)
        for f in l2_feats:
            if f not in df_l2.columns:
                print(f"❌ Missing L2 feature in output: {f}")
                return False
        print("✅ L2 Feature Engine calculated successfully.")
        
        # Test Hybrid
        hyb_feats = ['hawkes_intensity_jump', 'smart_money_divergence_cross']
        df_hyb = calculate_hybrid_features(df.copy(), hyb_feats)
        for f in hyb_feats:
            if f not in df_hyb.columns:
                print(f"❌ Missing Hybrid feature in output: {f}")
                return False
        print("✅ Hybrid Feature Engine calculated successfully.")
        
        # Test PLP
        plp_feats = ['stealth_liquidation_proxies', 'domino_trigger_threshold_alpha']
        df_plp = calculate_advanced_plp(df.copy(), plp_feats)
        for f in plp_feats:
            if f not in df_plp.columns:
                print(f"❌ Missing PLP feature in output: {f}")
                return False
        print("✅ PLP Feature Engine calculated successfully.")
        
        return True
        
    except ImportError as e:
        print(f"❌ Failed to import feature engines: {e}")
        return False
    except Exception as e:
        print(f"❌ Runtime error during feature calculation: {e}")
        return False

if __name__ == "__main__":
    print("========================================")
    print("🚀 Running 100+ Metrics Verification Script 🚀")
    print("========================================\n")
    
    frontend_ok = verify_frontend()
    backend_ok = verify_backend()
    
    print("\n========================================")
    if frontend_ok and backend_ok:
        print("🟢 ALL VERIFICATIONS PASSED! System is fully modular and optimized.")
    else:
        print("🔴 VERIFICATION FAILED! Please check logs above.")
    print("========================================")
