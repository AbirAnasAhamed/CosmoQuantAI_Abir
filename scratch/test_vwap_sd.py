"""
VWAP SD Integration Verification Script
Checks that all recently added files/integrations are working correctly.
"""
import sys
import os
from datetime import datetime, timezone, timedelta

# ─── PATH SETUP ─────────────────────────────────────────────────────────────
BACKEND_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend'))
sys.path.insert(0, BACKEND_PATH)

PASS = "[PASS]"
FAIL = "[FAIL]"
SEP  = "-" * 55

# ─── TEST 1: VWAPSDTracker Import & Basic Math ───────────────────────────────
def test_tracker_import_and_math():
    print(SEP)
    print("TEST 1: VWAPSDTracker - Import and Math")
    print(SEP)
    try:
        from app.strategies.helpers.vwap_sd_tracker import VWAPSDTracker
        print(f"  {PASS}  Import OK")
    except ImportError as e:
        print(f"  {FAIL}  Import FAILED: {e}")
        return False

    tracker = VWAPSDTracker(anchor='Daily', mult1=1.0, mult2=2.0, mult3=3.0)

    # Feed 10 deterministic ticks
    base_time = datetime.now(timezone.utc).replace(hour=0, minute=1)
    prices  = [100.0, 101.0, 99.5, 100.5, 102.0, 98.0, 100.0, 101.5, 99.0, 100.8]
    volumes = [1.0,   1.5,   2.0,  1.0,   0.5,   2.5,  1.0,   1.5,   2.0,  1.0]

    for i, (p, v) in enumerate(zip(prices, volumes)):
        ts = base_time + timedelta(minutes=i)
        tracker.update(p, v, ts)

    # Sanity checks
    assert tracker.vwap > 0, "VWAP should be positive"
    assert tracker.std_dev >= 0, "Std dev should be non-negative"
    assert tracker.bands['upper3'] > tracker.vwap, "Upper 3SD should be above VWAP"
    assert tracker.bands['lower3'] < tracker.vwap, "Lower 3SD should be below VWAP"
    print(f"  {PASS}  VWAP = {tracker.vwap:.4f}")
    print(f"  {PASS}  Std Dev = {tracker.std_dev:.4f}")
    print(f"  {PASS}  Upper 3SD = {tracker.bands['upper3']:.4f}")
    print(f"  {PASS}  Lower 3SD = {tracker.bands['lower3']:.4f}")

    # Z-score test
    z = tracker.get_z_score(tracker.vwap)
    assert abs(z) < 0.001, f"Z-score at VWAP should be ~0, got {z}"
    print(f"  {PASS}  Z-Score at VWAP = {z:.4f} (expected ~0)")

    # Anchor reset test
    next_day = base_time + timedelta(days=1)
    tracker.update(101.0, 1.0, next_day)
    assert tracker.cum_vol == 1.0, "Tracker should reset on new day"
    print(f"  {PASS}  Anchor reset on new day")

    return True


# ─── TEST 2: ML Engine VWAP Calculator Signature ────────────────────────────
def test_ml_calculator():
    print(SEP)
    print("TEST 2: ML Engine vwap_calculator - Signature & Output")
    print(SEP)
    try:
        import pandas as pd
        import numpy as np
        from app.services.helpers.vwap_calculator import calculate_vwap_sd_features
        print(f"  {PASS}  Import OK")
    except ImportError as e:
        print(f"  {FAIL}  Import FAILED: {e}")
        return False

    # Build minimal DataFrame with DatetimeIndex
    now = datetime.now(timezone.utc)
    idx = pd.date_range(end=now, periods=60, freq='1min', tz='UTC')
    np.random.seed(42)
    close_prices = 50000 + np.cumsum(np.random.randn(60) * 50)

    df = pd.DataFrame({
        'High': close_prices + 30,
        'Low':  close_prices - 30,
        'Close': close_prices,
        'Volume': np.abs(np.random.randn(60)) + 0.5,
    }, index=idx)

    # Call with correct signature (no sd_multiplier arg!)
    result = calculate_vwap_sd_features(df, anchor='Daily')
    
    required_cols = ['VWAP', 'VWAP_SD', 'VWAP_Z_Score']
    for col in required_cols:
        assert col in result.columns, f"Missing column: {col}"
        print(f"  {PASS}  Column '{col}' present")

    last = result.iloc[-1]
    assert not pd.isna(last['VWAP']), "VWAP should not be NaN"
    assert last['VWAP'] > 0, "VWAP should be positive"
    print(f"  {PASS}  Last VWAP = {last['VWAP']:.4f}")
    print(f"  {PASS}  Last VWAP_SD = {last['VWAP_SD']:.4f}")
    print(f"  {PASS}  Last VWAP_Z_Score = {last['VWAP_Z_Score']:.4f}")
    return True


# ─── TEST 3: Standalone Listener Exists & Is Importable ─────────────────────
def test_listener_import():
    print(SEP)
    print("TEST 3: VWAPSDStandaloneListener - Import Check")
    print(SEP)
    try:
        from app.strategies.helpers.vwap_sd_standalone_listener import VWAPSDStandaloneListener
        print(f"  {PASS}  Import OK")
    except ImportError as e:
        print(f"  {FAIL}  Import FAILED: {e}")
        return False

    # Check that it has required methods
    assert hasattr(VWAPSDStandaloneListener, 'start'), "Missing method: start"
    assert hasattr(VWAPSDStandaloneListener, '_check_confluence'), "Missing method: _check_confluence"
    print(f"  {PASS}  Method 'start' present")
    print(f"  {PASS}  Method '_check_confluence' present")
    return True


# ─── TEST 4: wall_hunter_bot.py Imports VWAP SD Correctly ───────────────────
def test_bot_imports():
    print(SEP)
    print("TEST 4: wall_hunter_bot.py - VWAP SD Import Verification")
    print(SEP)
    bot_path = os.path.join(os.path.dirname(__file__), '..', 'backend', 'app', 'strategies', 'wall_hunter_bot.py')
    with open(bot_path, 'r', encoding='utf-8') as f:
        content = f.read()

    checks = {
        'VWAPSDTracker import':              'from app.strategies.helpers.vwap_sd_tracker import VWAPSDTracker',
        'VWAPSDStandaloneListener import':   'from app.strategies.helpers.vwap_sd_standalone_listener import VWAPSDStandaloneListener',
        'enable_vwap_sd_snipe config read':  'enable_vwap_sd_snipe',
        'vwap_sd_tracker initialized':       'self.vwap_sd_tracker = VWAPSDTracker',
        'vwap_sd_listener initialized':      'self.vwap_sd_listener = VWAPSDStandaloneListener',
        '_vwap_sd_task started in start()':  '_vwap_sd_task = asyncio.create_task',
        '_vwap_sd_task cancelled in stop()': "'_vwap_sd_task'",
        'live config update handler':        '"enable_vwap_sd_snipe" in new_config',
    }

    all_ok = True
    for label, snippet in checks.items():
        if snippet in content:
            print(f"  {PASS}  {label}")
        else:
            print(f"  {FAIL}  {label} (missing: {snippet!r})")
            all_ok = False

    return all_ok


# ─── TEST 5: WallHunterModal.tsx has VWAP SD UI elements ─────────────────────
def test_frontend_modal():
    print(SEP)
    print("TEST 5: WallHunterModal.tsx - UI Integration Check")
    print(SEP)
    modal_path = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'src', 'components', 'features', 'market', 'WallHunterModal.tsx')
    with open(modal_path, 'r', encoding='utf-8') as f:
        content = f.read()

    checks = {
        'enableVWAPSDSnipe toggle in state':  'enableVWAPSDSnipe',
        'vwapSDAnchor field':                 'vwapSDAnchor',
        'vwapSDMultiplier field':             'vwapSDMultiplier',
        'vwapSDMinWall field':                'vwapSDMinWall',
        'VWAP SD UI block rendered':          'VWAP SD Confluence Snipe',
    }

    all_ok = True
    for label, snippet in checks.items():
        if snippet in content:
            print(f"  {PASS}  {label}")
        else:
            print(f"  {FAIL}  {label} (missing: {snippet!r})")
            all_ok = False

    return all_ok


# ─── MAIN ────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    results = []
    results.append(("VWAPSDTracker Math",             test_tracker_import_and_math()))
    results.append(("ML Engine Calculator",           test_ml_calculator()))
    results.append(("StandaloneListener Import",      test_listener_import()))
    results.append(("wall_hunter_bot.py Integration", test_bot_imports()))
    results.append(("WallHunterModal.tsx UI",         test_frontend_modal()))

    print()
    print("=" * 55)
    print("SUMMARY")
    print("=" * 55)
    passed = 0
    for name, ok in results:
        status = PASS if ok else FAIL
        print(f"  {status}  {name}")
        if ok:
            passed += 1

    print()
    print(f"  Result: {passed}/{len(results)} tests passed")
    print("=" * 55)
    sys.exit(0 if passed == len(results) else 1)
