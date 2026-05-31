"""
Dynamic TP (Level-to-Level) Verification Script
================================================
This script verifies all aspects of the Dynamic TP implementation
without requiring a live bot or exchange connection.
"""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '.')))

print("\n" + "="*60)
print("  🔍 Dynamic TP Feature Verification Script")
print("="*60 + "\n")

passed = 0
failed = 0

def check(label: str, condition: bool, detail: str = ""):
    global passed, failed
    if condition:
        print(f"  ✅ PASS | {label}")
        passed += 1
    else:
        print(f"  ❌ FAIL | {label}")
        if detail:
            print(f"         → {detail}")
        failed += 1

# ─────────────────────────────────────────────────────────
# TEST 1: Schema fields exist
# ─────────────────────────────────────────────────────────
print("📋 [1] Checking Pydantic Schema Fields (StrategyConfig)...")
try:
    from app.schemas.bot import StrategyConfig

    # Introspect fields without instantiation (avoids required field errors)
    fields = StrategyConfig.model_fields if hasattr(StrategyConfig, 'model_fields') else StrategyConfig.__fields__

    dtp_field = fields.get('enable_dynamic_wick_tp')
    dtp_pct_field = fields.get('dynamic_tp_frontrun_pct')

    check("StrategyConfig has 'enable_dynamic_wick_tp'", dtp_field is not None)
    check("StrategyConfig has 'dynamic_tp_frontrun_pct'", dtp_pct_field is not None)

    # Check defaults (Pydantic v2 style)
    if dtp_field is not None:
        dtp_default = dtp_field.default if hasattr(dtp_field, 'default') else getattr(dtp_field, 'default', None)
        check("enable_dynamic_wick_tp defaults to False", dtp_default == False)
    if dtp_pct_field is not None:
        pct_default = dtp_pct_field.default if hasattr(dtp_pct_field, 'default') else getattr(dtp_pct_field, 'default', None)
        check("dynamic_tp_frontrun_pct defaults to 0.0", pct_default == 0.0)

except Exception as e:
    check("Schema import/creation", False, str(e))
    import traceback; traceback.print_exc()

# ─────────────────────────────────────────────────────────
# TEST 2: WickSRTracker.get_dynamic_tp()
# ─────────────────────────────────────────────────────────
print("\n📊 [2] Checking WickSRTracker.get_dynamic_tp() Logic...")
try:
    from app.strategies.helpers.wick_sr_tracker import WickSRTracker

    tracker = WickSRTracker(min_touches=1)

    # Manually inject realistic levels
    tracker.levels = [
        # ACTIVE support below current price
        {'price': 0.095, 'type': 'support', 'original_type': 'support',
         'status': 'ACTIVE', 'bottom_band': 0.0945, 'top_band': 0.0955, 'touches': 5, 'candles_since_break': 0},
        # ACTIVE resistance above current price
        {'price': 0.110, 'type': 'resistance', 'original_type': 'resistance',
         'status': 'ACTIVE', 'bottom_band': 0.1095, 'top_band': 0.1105, 'touches': 8, 'candles_since_break': 0},
        # A farther resistance (should NOT be chosen, nearest first)
        {'price': 0.120, 'type': 'resistance', 'original_type': 'resistance',
         'status': 'ACTIVE', 'bottom_band': 0.1195, 'top_band': 0.1205, 'touches': 4, 'candles_since_break': 0},
    ]

    entry_price = 0.100

    # BUY trade → find nearest resistance ABOVE entry
    tp_buy = tracker.get_dynamic_tp(side='buy', entry_price=entry_price, frontrun_pct=0.0)
    check("BUY: finds resistance above entry",
          tp_buy is not None and tp_buy > entry_price,
          f"Got: {tp_buy}")
    check("BUY: picks NEAREST resistance (0.1095 not 0.1195)",
          tp_buy is not None and abs(tp_buy - 0.1095) < 0.0001,
          f"Expected ~0.1095, Got: {tp_buy}")

    # BUY with frontrun 0.5% → should be slightly below 0.1095
    tp_buy_fr = tracker.get_dynamic_tp(side='buy', entry_price=entry_price, frontrun_pct=0.5)
    expected_buy_fr = 0.1095 * (1 - 0.005)
    check("BUY: front-run 0.5% reduces TP below zone",
          tp_buy_fr is not None and tp_buy_fr < 0.1095,
          f"Expected ~{expected_buy_fr:.6f}, Got: {tp_buy_fr}")

    # SELL trade → find nearest support BELOW entry
    tp_sell = tracker.get_dynamic_tp(side='sell', entry_price=entry_price, frontrun_pct=0.0)
    check("SELL: finds support below entry",
          tp_sell is not None and tp_sell < entry_price,
          f"Got: {tp_sell}")
    check("SELL: picks NEAREST support (0.0955)",
          tp_sell is not None and abs(tp_sell - 0.0955) < 0.0001,
          f"Expected ~0.0955, Got: {tp_sell}")

    # SELL with frontrun 0.5% → should be slightly above 0.0955
    tp_sell_fr = tracker.get_dynamic_tp(side='sell', entry_price=entry_price, frontrun_pct=0.5)
    check("SELL: front-run 0.5% raises TP above support zone",
          tp_sell_fr is not None and tp_sell_fr > 0.0955,
          f"Expected > 0.0955, Got: {tp_sell_fr}")

    # No levels → should return None (fallback triggers)
    tracker.levels = []
    tp_none = tracker.get_dynamic_tp(side='buy', entry_price=entry_price)
    check("Empty levels → returns None (triggers fallback)",
          tp_none is None,
          f"Expected None, Got: {tp_none}")

    # BROKEN level should NOT be used as TP target
    tracker.levels = [
        {'price': 0.115, 'type': 'resistance', 'original_type': 'resistance',
         'status': 'BROKEN_RETEST', 'bottom_band': 0.1145, 'top_band': 0.1155, 'touches': 6, 'candles_since_break': 2},
    ]
    tp_broken = tracker.get_dynamic_tp(side='buy', entry_price=entry_price)
    check("BROKEN_RETEST levels ignored (returns None)",
          tp_broken is None,
          f"Expected None (broken level), Got: {tp_broken}")

except Exception as e:
    check("WickSRTracker import/logic", False, str(e))
    import traceback; traceback.print_exc()

# ─────────────────────────────────────────────────────────
# TEST 3: Bot config loading
# ─────────────────────────────────────────────────────────
print("\n🤖 [3] Checking Bot Config Loading (spot bot)...")
try:
    # We check that the attributes are loaded correctly without instantiating the full bot
    import inspect
    from app.strategies import wall_hunter_bot
    src = inspect.getsource(wall_hunter_bot)
    check("Spot bot loads 'enable_dynamic_wick_tp'",
          "self.enable_dynamic_wick_tp = config.get(\"enable_dynamic_wick_tp\"" in src)
    check("Spot bot loads 'dynamic_tp_frontrun_pct'",
          "self.dynamic_tp_frontrun_pct = config.get(\"dynamic_tp_frontrun_pct\"" in src)
    check("Spot bot calls wick_sr_tracker.get_dynamic_tp()",
          "get_dynamic_tp(" in src)
    check("Spot bot logs '🎯 [Dynamic TP]'",
          "[Dynamic TP]" in src)
    check("Spot bot has fallback to target_spread",
          "Fallback Spread TP" in src)
except Exception as e:
    check("Spot bot source check", False, str(e))

print("\n🚀 [4] Checking Futures Bot Config Loading...")
try:
    from app.strategies import wall_hunter_futures
    src_f = inspect.getsource(wall_hunter_futures)
    check("Futures bot loads 'enable_dynamic_wick_tp'",
          "self.enable_dynamic_wick_tp = self.config.get(\"enable_dynamic_wick_tp\"" in src_f)
    check("Futures bot loads 'dynamic_tp_frontrun_pct'",
          "self.dynamic_tp_frontrun_pct = self.config.get(\"dynamic_tp_frontrun_pct\"" in src_f)
    check("Futures bot calls wick_sr_tracker.get_dynamic_tp()",
          "get_dynamic_tp(" in src_f)
    check("Futures bot has fallback to target_spread",
          "Fallback Spread TP" in src_f)
except Exception as e:
    check("Futures bot source check", False, str(e))

# ─────────────────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────────────────
total = passed + failed
print("\n" + "="*60)
print(f"  📊 Results: {passed}/{total} passed | {failed} failed")
print("="*60)
if failed == 0:
    print("  🎉 ALL CHECKS PASSED! Dynamic TP is ready.\n")
else:
    print("  ⚠️  Some checks failed. Review the output above.\n")
