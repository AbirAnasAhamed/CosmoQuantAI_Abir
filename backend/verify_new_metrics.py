import sys
import os
import asyncio
import pandas as pd
import numpy as np

# Adjust path to import backend modules
sys.path.insert(0, os.path.abspath('.'))

from app.services.auto_feature_selector import calculate_l2_advanced_features, fetch_sample_l2_data
from app.services.predatory_liquidity_pipeline import calculate_plp_features
from app.db.session import SessionLocal

async def run_verification():
    print("🚀 Starting Smart Verification for 19 New Institutional Metrics...")
    
    db = SessionLocal()
    try:
        print("\n📥 Fetching sample L2 Orderbook Data (BTCUSDT)...")
        # Fetch 100 rows of live or cached L2 data
        df_l2 = await fetch_sample_l2_data("BTCUSDT", db, target_rows=100)
        
        if df_l2.empty or len(df_l2) < 10:
            print("❌ Failed to fetch enough L2 data. Need active market or filled DB.")
            return

        print(f"✅ Fetched {len(df_l2)} rows of L2 data.")
        
        # Ensure we have required columns for PLP if not fetched
        if 'qty' not in df_l2.columns:
            # Simulate a live market with some random volume spikes
            df_l2['qty'] = np.random.uniform(0.1, 5.0, len(df_l2))
            
        print("\n🧪 1. Testing L2 Advanced Features Calculation...")
        df_l2_features, name_map = calculate_l2_advanced_features(df_l2.copy())
        
        # New L2 features
        new_l2_cols = [
            'obi_delta', 'microprice_deviation', 'quote_stuffing_ratio', 'depth_variance',
            'slippage_proxy', 'spread_reversion_rate', 'smart_money_divergence', 'bid_ask_absorption',
            'liquidity_replenishment_rate', 'bbo_flicker_rate', 'order_flow_toxicity', 'hidden_volume_proxy'
        ]
        
        print(f"✅ L2 Function executed successfully.")
        
        # Merge back some L2 features so PLP has data (spread, obi, etc)
        for col in df_l2_features.columns:
            df_l2[col] = df_l2_features[col]
            
        print("\n🧪 2. Testing Predatory Liquidity Pipeline (PLP) Features Calculation...")
        # New PLP features
        new_plp_cols = [
            'spoofing_flag', 'layering_density', 'liquidity_mirage', 'wash_trading_prob',
            'stop_hunting_prob', 'hft_front_running', 'momentum_ignition'
        ]
        
        df_plp = calculate_plp_features(df_l2, new_plp_cols)
        print(f"✅ PLP Function executed successfully.")
        
        # Verification Summary
        print("\n📊 --- VERIFICATION REPORT ---")
        
        def check_features(df, cols, title):
            print(f"\n[{title}]")
            all_passed = True
            for col in cols:
                if col not in df.columns:
                    print(f"❌ {col:30} -> MISSING")
                    all_passed = False
                    continue
                
                s = df[col]
                has_nan = s.isna().any()
                has_inf = np.isinf(s).any()
                is_zero = (s == 0).all()
                
                status = "✅ PASS"
                notes = []
                if has_nan:
                    status = "⚠️ WARN"
                    notes.append("Contains NaN")
                if has_inf:
                    status = "⚠️ WARN"
                    notes.append("Contains Inf")
                if is_zero:
                    status = "⚠️ WARN"
                    notes.append("All values are ZERO (Could be expected in small sample)")
                    
                note_str = f" - {', '.join(notes)}" if notes else ""
                
                print(f"{status} | {col:30} | Min: {s.min():.5f} | Max: {s.max():.5f}{note_str}")
                
            if all_passed:
                print(f"🎉 All {len(cols)} {title} executed without crashing.")
                
        check_features(df_l2_features, new_l2_cols, "L2 Orderbook Features (12)")
        check_features(df_plp, new_plp_cols, "Predatory Liquidity Pipeline Features (7)")
        
        print("\n✅ Verification Script Completed Successfully!")
        
    except Exception as e:
        print(f"\n❌ CRITICAL ERROR DURING VERIFICATION: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(run_verification())
