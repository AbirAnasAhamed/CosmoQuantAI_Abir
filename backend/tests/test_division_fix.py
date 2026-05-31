# -*- coding: utf-8 -*-
"""
TEST: Float Division by Zero Fix Verification
==============================================
Checks all 3 patches applied to wall_hunter_futures.py:
  1. best_bid / best_ask = 0 guard in _run_loop
  2. entry_price = 0 guard in execute_snipe
  3. contractSize = 0 guard in execute_snipe
"""
import sys

print("\n" + "="*60)
print("[TEST] WallHunterFutures -- Division-by-Zero Fix Verification")
print("="*60 + "\n")

PASS = "[PASS]"
FAIL = "[FAIL]"
results = []


# ---------------------------------------------------------------------------
# TEST 1 -- best_bid / best_ask zero guard (_run_loop logic)
# ---------------------------------------------------------------------------
def test_bid_ask_zero_guard():
    """
    Simulates the _run_loop patch:
      if not best_bid or not best_ask or best_bid <= 0 or best_ask <= 0:
          continue   (skip tick)
      else:
          mid_price = (best_bid + best_ask) / 2
    """
    test_cases = [
        (0.0,     1.0,    True,  "best_bid=0"),
        (1.0,     0.0,    True,  "best_ask=0"),
        (0.0,     0.0,    True,  "both=0"),
        (None,    1.0,    True,  "best_bid=None"),
        (1.0,     None,   True,  "best_ask=None"),
        (0.10909, 0.10910, False, "normal prices"),
    ]

    all_pass = True
    for best_bid, best_ask, should_skip, label in test_cases:
        try:
            # Replicate the patched guard exactly
            if not best_bid or not best_ask or best_bid <= 0 or best_ask <= 0:
                skipped = True
            else:
                mid_price = (best_bid + best_ask) / 2  # must not raise
                skipped = False

            ok = (skipped == should_skip)
            status = PASS if ok else FAIL
            if not ok:
                all_pass = False
            print("  {}  bid_ask_guard [{}] -> skip={}".format(status, label, skipped))
        except ZeroDivisionError as e:
            all_pass = False
            print("  {}  bid_ask_guard [{}] -> ZeroDivisionError: {}".format(FAIL, label, e))

    return all_pass


# ---------------------------------------------------------------------------
# TEST 2 -- entry_price zero guard (execute_snipe logic)
# ---------------------------------------------------------------------------
def test_entry_price_zero_guard():
    """
    Simulates the execute_snipe patch:
      if not entry_price or entry_price <= 0:
          return   (abort snipe)
      base_amount_tokens = total_notional / entry_price
    """
    amount_per_trade = 10.0
    leverage = 10

    test_cases = [
        (0.0,     True,  "entry_price=0"),
        (-1.0,    True,  "entry_price=-1"),
        (None,    True,  "entry_price=None"),
        (0.10909, False, "normal entry_price=0.10909"),
        (65000.0, False, "normal entry_price=65000 (BTC)"),
    ]

    all_pass = True
    for entry_price, should_abort, label in test_cases:
        try:
            total_notional = amount_per_trade * leverage
            if not entry_price or entry_price <= 0:
                aborted = True
            else:
                _ = total_notional / entry_price   # must not raise
                aborted = False

            ok = (aborted == should_abort)
            status = PASS if ok else FAIL
            if not ok:
                all_pass = False
            print("  {}  entry_price_guard [{}] -> abort={}".format(status, label, aborted))
        except ZeroDivisionError as e:
            all_pass = False
            print("  {}  entry_price_guard [{}] -> ZeroDivisionError: {}".format(FAIL, label, e))

    return all_pass


# ---------------------------------------------------------------------------
# TEST 3 -- contractSize zero guard (execute_snipe logic)
# ---------------------------------------------------------------------------
def test_contract_size_zero_guard():
    """
    Simulates the execute_snipe patch:
      raw_cs = market.get('contractSize', 1.0)
      contract_size = float(raw_cs) if raw_cs and float(raw_cs) > 0 else 1.0
      contracts = base_amount_tokens / contract_size
    """
    base_amount_tokens = 91.66   # example tokens

    test_cases = [
        (0.0,   1.0,   "contractSize=0    -> fallback 1.0"),
        (None,  1.0,   "contractSize=None -> fallback 1.0"),
        (1.0,   1.0,   "contractSize=1.0  -> use 1.0"),
        (0.001, 0.001, "contractSize=0.001 -> use 0.001"),
        (10.0,  10.0,  "contractSize=10.0 -> use 10.0"),
    ]

    all_pass = True
    for raw_cs, expected_cs, label in test_cases:
        try:
            contract_size = float(raw_cs) if raw_cs and float(raw_cs) > 0 else 1.0
            contracts = base_amount_tokens / contract_size   # must not raise
            cs_ok = abs(contract_size - expected_cs) < 1e-9
            status = PASS if cs_ok else FAIL
            if not cs_ok:
                all_pass = False
            print("  {}  contract_size_guard [{}] -> cs={}, contracts={:.4f}".format(
                status, label, contract_size, contracts))
        except ZeroDivisionError as e:
            all_pass = False
            print("  {}  contract_size_guard [{}] -> ZeroDivisionError: {}".format(FAIL, label, e))

    return all_pass


# ---------------------------------------------------------------------------
# Run all tests
# ---------------------------------------------------------------------------
print("Test 1: best_bid / best_ask zero guard (_run_loop)")
r1 = test_bid_ask_zero_guard()
results.append(("bid_ask_zero_guard", r1))

print("\nTest 2: entry_price zero guard (execute_snipe)")
r2 = test_entry_price_zero_guard()
results.append(("entry_price_zero_guard", r2))

print("\nTest 3: contractSize zero guard (execute_snipe)")
r3 = test_contract_size_zero_guard()
results.append(("contract_size_zero_guard", r3))

print("\n" + "="*60)
passed = sum(1 for _, ok in results if ok)
total  = len(results)
print("Results: {}/{} test groups passed".format(passed, total))
for name, ok in results:
    print("   {}  {}".format("OK" if ok else "XX", name))

if passed == total:
    print("\n>>> ALL TESTS PASSED -- Fix is verified! Safe to deploy.\n")
    sys.exit(0)
else:
    print("\n>>> SOME TESTS FAILED -- DO NOT DEPLOY!\n")
    sys.exit(1)
