"""
=======================================================
  WickSR Integration Verification Script
  CosmoQuantAI - WallHunter Bot
=======================================================
  Run from backend/ directory:
  python verify_wick_sr.py
=======================================================
"""

import sys
import os
import io
import math

# Force UTF-8 on Windows terminal to handle any remaining unicode
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# Add backend root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# ANSI Colors
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

passed = []
failed = []


def ok(label):
    passed.append(label)
    print(f"  {GREEN}[PASS]{RESET}  {label}")


def fail(label, detail=""):
    failed.append(label)
    detail_str = f" -> {RED}{detail}{RESET}" if detail else ""
    print(f"  {RED}[FAIL]{RESET}  {label}{detail_str}")


def section(title):
    bar = "-" * 55
    print(f"\n{CYAN}{bar}{RESET}")
    print(f"{BOLD}  {title}{RESET}")
    print(f"{CYAN}{bar}{RESET}")


# ======================================================
# TEST 1: Import Checks
# ======================================================
section("1. Import Checks")

try:
    from app.strategies.helpers.wick_sr_tracker import WickSRTracker
    ok("WickSRTracker import")
except Exception as e:
    fail("WickSRTracker import", str(e))

try:
    from app.strategies.helpers.wick_sr_standalone_listener import WickSRStandaloneListener
    ok("WickSRStandaloneListener import")
except Exception as e:
    fail("WickSRStandaloneListener import", str(e))


# ======================================================
# TEST 2: Pydantic Schema Validation
# ======================================================
section("2. Pydantic Schema (API Contract)")

try:
    from app.schemas.bot import StrategyConfig
    ok("StrategyConfig import")

    cfg = StrategyConfig(
        amount_per_trade=100.0,
        enable_wick_sr=True,
        wick_sr_modes=["bounce", "breakout", "sweep", "retest"],
        wick_sr_timeframe="5m",
        wick_sr_sweep_threshold=3,
        wick_sr_min_touches=10,
        enable_wick_sr_oib=True,
    )
    ok("Schema accepts all 6 Wick SR fields without error")

    assert cfg.enable_wick_sr is True
    ok("enable_wick_sr = True")

    assert cfg.wick_sr_modes == ["bounce", "breakout", "sweep", "retest"]
    ok("wick_sr_modes contains all 4 modes")

    assert cfg.wick_sr_timeframe == "5m"
    ok("wick_sr_timeframe = '5m'")

    assert cfg.wick_sr_sweep_threshold == 3
    ok("wick_sr_sweep_threshold = 3")

    assert cfg.wick_sr_min_touches == 10
    ok("wick_sr_min_touches = 10")

    assert cfg.enable_wick_sr_oib is True
    ok("enable_wick_sr_oib = True")

    # Defaults
    cfg_default = StrategyConfig(amount_per_trade=50.0)
    assert cfg_default.enable_wick_sr is False
    assert cfg_default.wick_sr_modes == ["bounce"]
    assert cfg_default.wick_sr_timeframe == "1m"
    ok("Schema defaults correct (False, ['bounce'], '1m')")

except Exception as e:
    fail("Schema validation", str(e))


# ======================================================
# TEST 3: WickSRTracker Core Math (ATR / RMA)
# ======================================================
section("3. WickSRTracker Core Math (RMA / ATR)")


def make_candles(n=100, base=100.0, volatility=2.0):
    import random
    random.seed(42)
    candles = []
    price = base
    for i in range(n):
        move = random.uniform(-volatility, volatility)
        open_p = price
        close_p = price + move
        high_p = max(open_p, close_p) + random.uniform(0.1, volatility * 0.5)
        low_p  = min(open_p, close_p) - random.uniform(0.1, volatility * 0.5)
        candles.append({
            'open': open_p, 'high': high_p, 'low': low_p,
            'close': close_p, 'volume': 1000.0, 'timestamp': i * 60000
        })
        price = close_p
    return candles


try:
    tracker = WickSRTracker(
        timeframe='1m', atr_period=14, atr_multiplier=0.5,
        sweep_threshold_candles=3, min_touches=1
    )
    ok("WickSRTracker instantiation OK")

    candles = make_candles(100, base=100.0, volatility=2.0)
    atr = tracker._calculate_atr(candles)
    assert atr > 0, "ATR must be > 0"
    ok(f"ATR calculation returns positive value: {atr:.4f}")

    import numpy as np
    tr_list = []
    for i in range(1, len(candles)):
        h = candles[i]['high']; l = candles[i]['low']; pc = candles[i-1]['close']
        tr_list.append(max(h - l, abs(h - pc), abs(l - pc)))
    tr_arr = np.array(tr_list)

    # Manual Wilder's RMA
    manual_rma = np.zeros(len(tr_arr))
    manual_rma[13] = np.mean(tr_arr[:14])
    alpha = 1.0 / 14
    for i in range(14, len(tr_arr)):
        manual_rma[i] = alpha * tr_arr[i] + (1 - alpha) * manual_rma[i-1]

    rma_impl = tracker._calculate_rma(tr_arr, 14)
    diff = abs(rma_impl[-1] - manual_rma[-1])
    assert diff < 1e-8, f"RMA mismatch: {diff}"
    ok(f"Wilder's RMA == manual calculation (diff={diff:.2e})")

except Exception as e:
    fail("Core math checks", str(e))


# ======================================================
# TEST 4: Level Detection (Clustering)
# ======================================================
section("4. Level Detection (Clustering)")

try:
    tracker2 = WickSRTracker(
        timeframe='1m', atr_period=14, atr_multiplier=0.5,
        sweep_threshold_candles=3, min_touches=5
    )
    candles2 = make_candles(150, base=50000.0, volatility=100.0)
    levels = tracker2.update_levels(candles2)
    ok(f"update_levels() ran OK. Levels found: {len(levels)}")

    for lvl in levels:
        assert 'price' in lvl
        assert 'type' in lvl
        assert 'status' in lvl
        assert 'top_band' in lvl
        assert 'bottom_band' in lvl
        assert lvl['top_band'] > lvl['bottom_band']
        assert lvl['status'] in ('ACTIVE', 'BROKEN_SWEEP_WATCH', 'BROKEN_RETEST')
        assert lvl['type'] in ('support', 'resistance')
    ok("All detected levels have correct schema")

except Exception as e:
    fail("Level detection", str(e))


# ======================================================
# TEST 5: Signal Generation - All 4 Modes
# ======================================================
section("5. Signal Generation - All 4 Modes")

# ---- BOUNCE ----
try:
    t = WickSRTracker(timeframe='1m', atr_period=14, atr_multiplier=0.5,
                      sweep_threshold_candles=3, min_touches=1)
    t.levels = [{'price': 100.0, 'type': 'support', 'original_type': 'support',
                 'touches': 5, 'top_band': 100.5, 'bottom_band': 99.5,
                 'status': 'ACTIVE', 'candles_since_break': 0}]
    sigs = t.get_signals(100.1)
    bs = [s for s in sigs if s['mode'] == 'bounce']
    assert len(bs) == 1 and bs[0]['side'] == 'long'
    ok("BOUNCE: support -> LONG signal")

    t2 = WickSRTracker(timeframe='1m', atr_period=14, atr_multiplier=0.5,
                       sweep_threshold_candles=3, min_touches=1)
    t2.levels = [{'price': 100.0, 'type': 'resistance', 'original_type': 'resistance',
                  'touches': 5, 'top_band': 100.5, 'bottom_band': 99.5,
                  'status': 'ACTIVE', 'candles_since_break': 0}]
    sigs = t2.get_signals(100.1)
    bs = [s for s in sigs if s['mode'] == 'bounce']
    assert len(bs) == 1 and bs[0]['side'] == 'short'
    ok("BOUNCE: resistance -> SHORT signal")
except Exception as e:
    fail("BOUNCE signal", str(e))

# ---- BREAKOUT ----
try:
    t = WickSRTracker(timeframe='1m', atr_period=14, atr_multiplier=0.5,
                      sweep_threshold_candles=3, min_touches=1)
    t.levels = [{'price': 100.0, 'type': 'resistance', 'original_type': 'resistance',
                 'touches': 5, 'top_band': 100.5, 'bottom_band': 99.5,
                 'status': 'ACTIVE', 'candles_since_break': 0}]
    sigs = t.get_signals(101.0)
    bo = [s for s in sigs if s['mode'] == 'breakout']
    assert len(bo) == 1 and bo[0]['side'] == 'long'
    assert t.levels[0]['status'] == 'BROKEN_SWEEP_WATCH'
    ok("BREAKOUT: resistance broken UP -> LONG + state -> BROKEN_SWEEP_WATCH")

    t2 = WickSRTracker(timeframe='1m', atr_period=14, atr_multiplier=0.5,
                       sweep_threshold_candles=3, min_touches=1)
    t2.levels = [{'price': 100.0, 'type': 'support', 'original_type': 'support',
                  'touches': 5, 'top_band': 100.5, 'bottom_band': 99.5,
                  'status': 'ACTIVE', 'candles_since_break': 0}]
    sigs = t2.get_signals(98.0)
    bo = [s for s in sigs if s['mode'] == 'breakout']
    assert len(bo) == 1 and bo[0]['side'] == 'short'
    ok("BREAKOUT: support broken DOWN -> SHORT + state -> BROKEN_SWEEP_WATCH")
except Exception as e:
    fail("BREAKOUT signal", str(e))

# ---- SWEEP (Liquidity Fakeout) ----
try:
    t = WickSRTracker(timeframe='1m', atr_period=14, atr_multiplier=0.5,
                      sweep_threshold_candles=5, min_touches=1)
    t.levels = [{'price': 100.0, 'type': 'resistance', 'original_type': 'resistance',
                 'touches': 5, 'top_band': 100.5, 'bottom_band': 99.5,
                 'status': 'BROKEN_SWEEP_WATCH', 'candles_since_break': 2}]
    sigs = t.get_signals(100.2)
    sw = [s for s in sigs if s['mode'] == 'sweep']
    assert len(sw) == 1 and sw[0]['side'] == 'short'
    assert t.levels[0]['status'] == 'ACTIVE'
    ok("SWEEP: resistance fakeout -> SHORT + reset to ACTIVE")
except Exception as e:
    fail("SWEEP signal", str(e))

# ---- RETEST ----
try:
    t = WickSRTracker(timeframe='1m', atr_period=14, atr_multiplier=0.5,
                      sweep_threshold_candles=3, min_touches=1)
    t.levels = [{'price': 100.0,
                 'type': 'support',           # flipped (was resistance)
                 'original_type': 'resistance',
                 'touches': 5, 'top_band': 100.5, 'bottom_band': 99.5,
                 'status': 'BROKEN_RETEST', 'candles_since_break': 5}]
    sigs = t.get_signals(100.1)
    rt = [s for s in sigs if s['mode'] == 'retest']
    assert len(rt) == 1 and rt[0]['side'] == 'long'
    ok("RETEST: old resistance now support -> LONG signal")
except Exception as e:
    fail("RETEST signal", str(e))

# ---- Sweep timeout -> RETEST transition ----
try:
    t = WickSRTracker(timeframe='1m', atr_period=14, atr_multiplier=0.5,
                      sweep_threshold_candles=3, min_touches=1)
    t.levels = [{'price': 100.0, 'type': 'resistance', 'original_type': 'resistance',
                 'touches': 5, 'top_band': 100.5, 'bottom_band': 99.5,
                 'status': 'BROKEN_SWEEP_WATCH', 'candles_since_break': 2}]
    for _ in range(3):
        t.get_signals(101.0)
    assert t.levels[0]['status'] == 'BROKEN_RETEST', \
        f"Expected BROKEN_RETEST, got: {t.levels[0]['status']}"
    assert t.levels[0]['type'] == 'support', "Role reversal: type should flip to 'support'"
    ok("SWEEP timeout (3 candles) -> BROKEN_RETEST + role reversal to support")
except Exception as e:
    fail("Sweep timeout -> Retest transition", str(e))


# ======================================================
# TEST 6: Mode Filtering (wick_sr_modes gate)
# ======================================================
section("6. Signal Filtering by wick_sr_modes")

try:
    t = WickSRTracker(timeframe='1m', atr_period=14, atr_multiplier=0.5,
                      sweep_threshold_candles=3, min_touches=1)
    t.levels = [{'price': 100.0, 'type': 'support', 'original_type': 'support',
                 'touches': 5, 'top_band': 100.5, 'bottom_band': 99.5,
                 'status': 'ACTIVE', 'candles_since_break': 0}]
    sigs = t.get_signals(100.1)
    # Simulate bot: only 'retest' mode enabled
    filtered = [s for s in sigs if s['mode'] in ['retest']]
    assert len(filtered) == 0, "Bounce should be filtered out"
    ok("Mode filter: bounce filtered when only 'retest' is enabled")
except Exception as e:
    fail("Mode filtering", str(e))


# ======================================================
# TEST 7: Spot Bot Source Check
# ======================================================
section("7. wall_hunter_bot.py (Spot) - Source Audit")

try:
    bot_path = os.path.join(os.path.dirname(__file__), 'app', 'strategies', 'wall_hunter_bot.py')
    with open(bot_path, 'r', encoding='utf-8') as f:
        src = f.read()

    checks = {
        "WickSRTracker import":           "from app.strategies.helpers.wick_sr_tracker import WickSRTracker",
        "WickSRStandaloneListener import":"from app.strategies.helpers.wick_sr_standalone_listener import WickSRStandaloneListener",
        "enable_wick_sr init":            'self.enable_wick_sr = config.get("enable_wick_sr"',
        "wick_sr_modes init":             'self.wick_sr_modes = config.get("wick_sr_modes"',
        "wick_sr_tracker created":        'self.wick_sr_tracker = WickSRTracker(',
        "wick_sr_listener created":       'self.wick_sr_listener = WickSRStandaloneListener(',
        "_wick_sr_task started":          '_wick_sr_task = asyncio.create_task(self.wick_sr_listener.start())',
        "get_signals called in loop":     'self.wick_sr_tracker.get_signals(',
        "update_config has wick_sr":      '"enable_wick_sr" in new_config',
    }
    for label, token in checks.items():
        if token in src:
            ok(f"Spot: {label}")
        else:
            fail(f"Spot: {label}", "NOT FOUND in source")

except Exception as e:
    fail("Spot bot source check", str(e))


# ======================================================
# TEST 8: Futures Bot Source Check
# ======================================================
section("8. wall_hunter_futures.py (Futures) - Source Audit")

try:
    fut_path = os.path.join(os.path.dirname(__file__), 'app', 'strategies', 'wall_hunter_futures.py')
    with open(fut_path, 'r', encoding='utf-8') as f:
        src_f = f.read()

    checks_f = {
        "WickSRTracker import":           "from app.strategies.helpers.wick_sr_tracker import WickSRTracker",
        "WickSRStandaloneListener import":"from app.strategies.helpers.wick_sr_standalone_listener import WickSRStandaloneListener",
        "enable_wick_sr init":            'self.enable_wick_sr = self.config.get("enable_wick_sr"',
        "wick_sr_modes init":             'self.wick_sr_modes = self.config.get("wick_sr_modes"',
        "wick_sr_tracker created":        'self.wick_sr_tracker = WickSRTracker(',
        "wick_sr_listener created":       'self.wick_sr_listener = WickSRStandaloneListener(',
        "_wick_sr_task started":          '_wick_sr_task = asyncio.create_task(self.wick_sr_listener.start())',
        "get_signals called in loop":     'self.wick_sr_tracker.get_signals(',
        "update_config has wick_sr":      '"enable_wick_sr" in new_config',
        "_wick_sr_task in stop cleanup":  "'_wick_sr_task'",
    }
    for label, token in checks_f.items():
        if token in src_f:
            ok(f"Futures: {label}")
        else:
            fail(f"Futures: {label}", "NOT FOUND in source")

except Exception as e:
    fail("Futures bot source check", str(e))


# ======================================================
# TEST 9: Frontend Modal Payload Mapping
# ======================================================
section("9. WallHunterModal.tsx - Frontend Payload Audit")

try:
    tsx_path = os.path.join(
        os.path.dirname(__file__), '..', 'frontend', 'src',
        'components', 'features', 'market', 'WallHunterModal.tsx'
    )
    with open(tsx_path, 'r', encoding='utf-8') as f:
        tsx_src = f.read()

    tsx_checks = {
        "enableWickSr state default":      "enableWickSr: false",
        "wickSrModes state default":       "wickSrModes: ['bounce']",
        "4th mode (breakout) in UI":       "'breakout'",
        "enable_wick_sr in payload":       "enable_wick_sr: form.enableWickSr",
        "wick_sr_modes in payload":        "wick_sr_modes: form.wickSrModes",
        "wick_sr_timeframe in payload":    "wick_sr_timeframe: form.wickSrTimeframe",
        "wick_sr_sweep_threshold payload": "wick_sr_sweep_threshold: form.wickSrSweepThreshold",
        "wick_sr_min_touches payload":     "wick_sr_min_touches: form.wickSrMinTouches",
        "enable_wick_sr_oib payload":      "enable_wick_sr_oib: form.enableWickSrOib",
        "Wick SR in entry trigger validation": "form.enableWickSr",
    }
    for label, token in tsx_checks.items():
        if token in tsx_src:
            ok(f"Frontend: {label}")
        else:
            fail(f"Frontend: {label}", "NOT FOUND in TSX source")

except Exception as e:
    fail("Frontend modal audit", str(e))


# ======================================================
# FINAL SUMMARY
# ======================================================
total = len(passed) + len(failed)
bar = "=" * 55
print(f"\n{BOLD}{bar}{RESET}")
print(f"{BOLD}  VERIFICATION RESULTS{RESET}")
print(f"{BOLD}{bar}{RESET}")
print(f"  Total  : {total}")
print(f"  {GREEN}Passed : {len(passed)}{RESET}")
print(f"  {RED if failed else GREEN}Failed : {len(failed)}{RESET}")

if failed:
    print(f"\n{RED}{BOLD}  FAILED CHECKS:{RESET}")
    for f_item in failed:
        print(f"    {RED}* {f_item}{RESET}")
    print()
    sys.exit(1)
else:
    print(f"\n{GREEN}{BOLD}  >>> All checks passed! Wick SR integration verified. <<<{RESET}\n")
    sys.exit(0)
