"""
IcebergTracker Comprehensive Logic Verification
================================================
এই স্ক্রিপ্টটি IcebergTracker এর প্রতিটি কেস টেস্ট করবে:
- দ্বারা Detect করা উচিত: BUY Iceberg, SELL Iceberg
- দ্বারা Detect করা উচিত না: Volume কম, Price break, Time window expiry
"""
import sys
import os
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app.strategies.helpers.iceberg_tracker import IcebergTracker

PASS = "[  PASS  ]"
FAIL = "[  FAIL  ]"

results = []

def run_test(name, expected, result):
    detected = bool(result and result.get('iceberg_detected'))
    ok = detected == expected
    status = PASS if ok else FAIL
    print(f"  {status} {name}")
    if not ok:
        print(f"           Expected detected={expected}, got result={result}")
    elif detected:
        print(f"           Price={result['price']}, Absorbed=${result['absorbed_vol']:,.0f}, Limit Remaining=${result['limit_vol_remaining']:,.0f}")
    results.append(ok)
    return ok

# ============================================================
print("\n" + "="*60)
print("  TEST SUITE: IcebergTracker Logic Verification")
print("="*60 + "\n")

# ============================================================
print("[1] BUY ICEBERG – Heavy market sells absorbed by a reloading bid wall")
print("-"*60)
t1 = IcebergTracker(window_seconds=30, min_absorbed_vol=10000.0, price_variance_pct=0.05)

# Orderbook: 10 BTC wall at 60000
t1.update_orderbook(
    bids=[[60000.0, 10.0], [59900.0, 5.0]],
    asks=[[60100.0, 10.0]]
)
# 1 BTC sell hits at 60000 = $60,000 (above 10k threshold)
t1.add_trade(60000.0, 1.0, 'sell')
t1.add_trade(60000.0, 0.5, 'sell')   # total = $90,000 at 60000

result = t1.check_for_iceberg('buy', 60000.0)
run_test("BUY Iceberg detected with sufficient volume (wall still present)", True, result)

# ============================================================
print("\n[2] BUY ICEBERG – Volume below threshold, should NOT fire")
print("-"*60)
t2 = IcebergTracker(window_seconds=30, min_absorbed_vol=200000.0, price_variance_pct=0.05)

t2.update_orderbook(
    bids=[[60000.0, 10.0]],
    asks=[[60100.0, 10.0]]
)
t2.add_trade(60000.0, 0.5, 'sell')   # $30,000 only — below 200k threshold
result = t2.check_for_iceberg('buy', 60000.0)
run_test("BUY Iceberg NOT detected when volume < threshold", False, result)

# ============================================================
print("\n[3] BUY ICEBERG – Price broke below the wall (not defended)")
print("-"*60)
t3 = IcebergTracker(window_seconds=30, min_absorbed_vol=10000.0, price_variance_pct=0.05)

t3.update_orderbook(
    bids=[[60000.0, 10.0]],
    asks=[[60100.0, 10.0]]
)
t3.add_trade(60000.0, 1.0, 'sell')   # $60,000 volume

# Price has dropped FAR below 60000 – wall was broken
result = t3.check_for_iceberg('buy', 59700.0)  # ~0.5% below
run_test("BUY Iceberg NOT detected when price broke through wall", False, result)

# ============================================================
print("\n[4] SELL ICEBERG – Heavy market buys absorbed by a reloading ask wall")
print("-"*60)
t4 = IcebergTracker(window_seconds=30, min_absorbed_vol=10000.0, price_variance_pct=0.05)

t4.update_orderbook(
    bids=[[59900.0, 10.0]],
    asks=[[60100.0, 15.0], [60200.0, 5.0]]
)
# Buys hitting the ask wall at 60100
t4.add_trade(60100.0, 1.0, 'buy')   # $60,100

result = t4.check_for_iceberg('sell', 60100.0)
run_test("SELL Iceberg detected with sufficient volume (ask wall still present)", True, result)

# ============================================================
print("\n[5] TIME WINDOW – Old trades expire out, should NOT detect")
print("-"*60)
t5 = IcebergTracker(window_seconds=1, min_absorbed_vol=10000.0, price_variance_pct=0.05)

t5.update_orderbook(
    bids=[[60000.0, 10.0]],
    asks=[[60100.0, 10.0]]
)
t5.add_trade(60000.0, 1.0, 'sell')  # $60,000

print("           Waiting 1.5 seconds for trade to expire from window...")
time.sleep(1.5)

result = t5.check_for_iceberg('buy', 60000.0)
run_test("BUY Iceberg NOT detected after trade window expired", False, result)

# ============================================================
print("\n[6] PRICE VARIANCE – Trades within 0.05% grouped correctly")
print("-"*60)
t6 = IcebergTracker(window_seconds=30, min_absorbed_vol=50000.0, price_variance_pct=0.05)

t6.update_orderbook(
    bids=[[60000.0, 10.0]],
    asks=[[60100.0, 10.0]]
)
# 3 trades at slightly different prices (within 0.05% band of 60000)
t6.add_trade(60000.0, 0.3, 'sell')  # $18,000
t6.add_trade(59998.0, 0.3, 'sell')  # $17,999 — within 0.05% of 60000
t6.add_trade(60002.0, 0.3, 'sell')  # $18,001 — within 0.05% of 60000
# Total grouped ~$54,000 > threshold of $50,000

result = t6.check_for_iceberg('buy', 60000.0)
run_test("BUY Iceberg detected — diverse prices within 0.05% are grouped", True, result)

# ============================================================
print("\n[7] WRONG SIDE TRADES – Buy trades should NOT count for BUY iceberg detection")
print("-"*60)
t7 = IcebergTracker(window_seconds=30, min_absorbed_vol=10000.0, price_variance_pct=0.05)

t7.update_orderbook(
    bids=[[60000.0, 10.0]],
    asks=[[60100.0, 10.0]]
)
# These are BUY trades — for BUY iceberg, we need SELL trades (absorbing bids)
t7.add_trade(60000.0, 1.0, 'buy')   # $60,000 — wrong side for BUY iceberg
t7.add_trade(60000.0, 0.5, 'buy')   # $30,000

result = t7.check_for_iceberg('buy', 60000.0)
run_test("BUY Iceberg NOT detected when only BUY tapes present (need SELL tapes)", False, result)

# ============================================================
print("\n[8] UPDATE PARAMS – Runtime parameter update works correctly")
print("-"*60)
t8 = IcebergTracker(window_seconds=30, min_absorbed_vol=200000.0, price_variance_pct=0.05)
t8.update_orderbook(bids=[[60000.0, 10.0]], asks=[[60100.0, 10.0]])
t8.add_trade(60000.0, 1.0, 'sell')   # $60,000

# With high threshold — should NOT detect
result_before = t8.check_for_iceberg('buy', 60000.0)
# Lower threshold at runtime
t8.update_params(min_absorbed_vol=5000.0)
result_after = t8.check_for_iceberg('buy', 60000.0)

ok_before = not (result_before and result_before.get('iceberg_detected'))
ok_after = bool(result_after and result_after.get('iceberg_detected'))
combined = ok_before and ok_after
status = PASS if combined else FAIL
print(f"  {status} Runtime update_params() lowers threshold and enables detection")
if not combined:
    print(f"           Before update: {result_before}")
    print(f"           After update:  {result_after}")
results.append(combined)

# ============================================================
print("\n" + "="*60)
pass_count = sum(results)
fail_count = len(results) - pass_count
print(f"  RESULTS: {pass_count}/{len(results)} PASSED  |  {fail_count} FAILED")
print("="*60 + "\n")

if fail_count > 0:
    print("  [WARNING] Some tests failed. Review the logic above.")
    sys.exit(1)
else:
    print("  All tests passed! IcebergTracker logic is working correctly.\n")
    sys.exit(0)
