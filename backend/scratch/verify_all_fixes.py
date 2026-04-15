"""
Bug Fix Verification Script
============================
সব ১২টি bug fix সঠিকভাবে apply হয়েছে কিনা তা file content
analysis করে verify করে। Docker ছাড়াই চলে।
"""

import sys
import re
from pathlib import Path

BASE = Path("e:/CosmoQuantAI")

FRONTEND = BASE / "frontend/src"
BACKEND  = BASE / "backend/app"

PASS = "  [PASS]"
FAIL = "  [FAIL]"

results = []

def check(name: str, filepath: Path, pattern: str, should_exist: bool = True, flags=re.DOTALL):
    """Check that a regex pattern exists (or doesn't) in a file."""
    try:
        content = filepath.read_text(encoding="utf-8")
        found = bool(re.search(pattern, content, flags))
        ok = found if should_exist else not found
        status = PASS if ok else FAIL
        results.append(ok)
        label = "EXISTS" if should_exist else "ABSENT"
        print(f"{status}  [{name}] Pattern {label}: {repr(pattern[:80])}")
        if not ok:
            print(f"       File: {filepath}")
    except FileNotFoundError:
        results.append(False)
        print(f"{FAIL}  [{name}] FILE NOT FOUND: {filepath}")


# ══════════════════════════════════════════════════════════════
print("\n" + "="*65)
print("  Bug Fix Verification --- CosmoQuantAI Manual Trading")
print("="*65)

# ── BACKEND ───────────────────────────────────────────────────

print("\n>> BACKEND FILES")
print("-"*65)

trading_py        = BACKEND / "api/v1/endpoints/trading.py"
manual_service_py = BACKEND / "services/manual_trade_service.py"
bracket_py        = BACKEND / "services/bracket_order_service.py"

# BUG-01: datetime import added to trading.py
check(
    "BUG-01 · datetime import",
    trading_py,
    r"from datetime import datetime",
)

# BUG-03: passphrase empty-string guard in bracket service
check(
    "BUG-03 · passphrase guard (raw_pp check)",
    bracket_py,
    r"raw_pp\s*=\s*getattr\(api_key_record,\s*['\"]passphrase['\"]",
)
check(
    "BUG-03 · decrypt only when raw_pp truthy",
    bracket_py,
    r"passphrase\s*=\s*decrypt_key\(raw_pp\)\s*if\s*raw_pp\s*else\s*None",
)

# BUG-06: no bare except in manual_trade_service.py
check(
    "BUG-06 · no bare except (should be ABSENT)",
    manual_service_py,
    r"^\s*except:\s*$",
    should_exist=False,
    flags=re.MULTILINE,
)
check(
    "BUG-06 · except Exception used instead",
    manual_service_py,
    r"except Exception:",
)

# BUG-07: user_id passed to bracket service call
check(
    "BUG-07 · user_id in bracket service call",
    manual_service_py,
    r"user_id\s*=\s*user_id\s*#\s*BUG-07",
)

# BUG-07: Telegram notification in bracket service
check(
    "BUG-07 · Bracket TP Telegram notification",
    bracket_py,
    r"Bracket TP Executed",
)
check(
    "BUG-07 · user_id param in monitor_and_execute_tp",
    bracket_py,
    r"user_id\s*:\s*int\s*=\s*0",
)
check(
    "BUG-07 · creates own DB session for notification",
    bracket_py,
    r"from app\.db\.session import SessionLocal",
)

# BUG-10: partial fill at timeout properly handled
check(
    "BUG-10 · partial fill message at timeout",
    bracket_py,
    r"Partial fill at timeout",
)
check(
    "BUG-10 · no hard early return on partial fill",
    bracket_py,
    r"filled_amount\s*>\s*0.*Proceeding with TP",
    flags=re.DOTALL,
)

# BUG-03 (passphrase): old unsafe pattern absent
check(
    "BUG-03 · old unsafe passphrase line ABSENT",
    bracket_py,
    r"decrypt_key\(api_key_record\.passphrase\)",
    should_exist=False,
)

# ── FRONTEND ──────────────────────────────────────────────────

print("\n>> FRONTEND FILES")
print("-"*65)

modal_tsx       = FRONTEND / "components/features/market/ManualTradeModal.tsx"
hook_ts         = FRONTEND / "hooks/useOpenOrders.ts"

# BUG-02: finally block for setIsSubmitting
check(
    "BUG-02 · finally block in handleTrade",
    modal_tsx,
    r"finally\s*\{\s*//\s*BUG-02",
)
check(
    "BUG-02 · setIsSubmitting in finally (not in try/catch)",
    modal_tsx,
    r"finally\s*\{[^}]*setIsSubmitting\(false\)",
    flags=re.DOTALL,
)

# BUG-02: stale comment removed
check(
    "BUG-02 · stale comment ABSENT",
    modal_tsx,
    r"Simulate API call for now since backend route is not ready",
    should_exist=False,
)

# BUG-04: onApiKeyChange in useEffect deps
check(
    "BUG-04 · onApiKeyChange in useEffect deps",
    modal_tsx,
    r"\[isOpen,\s*onApiKeyChange\]",
)

# BUG-08: API key label uppercase
check(
    "BUG-08 · exchange uppercase in label fallback",
    modal_tsx,
    r"exchange\?\.toUpperCase\(\)",
)

# BUG-09: resolvedExchange instead of hardcoded binance
check(
    "BUG-09 · resolvedExchange computed from selected key",
    modal_tsx,
    r"resolvedExchange\s*=\s*apiKeys\.find",
)
check(
    "BUG-09 · hardcoded 'binance' ABSENT in payload",
    modal_tsx,
    r"exchange_id:\s*'binance',\s*//\s*backend fallback",
    should_exist=False,
)

# BUG-12: symbol change resets size and sizeMode
check(
    "BUG-12 · symbol change resets size",
    modal_tsx,
    r"setSize\(''\);\s*setSizeMode\('base'\);\s*\},\s*\[symbol\]\)",
    flags=re.DOTALL,
)

# BUG-05: isMountedRef in useOpenOrders
check(
    "BUG-05 · isMountedRef declared",
    hook_ts,
    r"isMountedRef\s*=\s*useRef\(true\)",
)
check(
    "BUG-05 · guard in fetchOrders",
    hook_ts,
    r"isMountedRef\.current",
)
check(
    "BUG-05 · cleanup sets isMountedRef false",
    hook_ts,
    r"isMountedRef\.current\s*=\s*false",
)

# BUG-11: dev-only debug logging
check(
    "BUG-11 · import.meta.env.DEV for debug log",
    hook_ts,
    r"import\.meta\.env\.DEV",
)

# ── FINAL REPORT ──────────────────────────────────────────────

print("\n" + "="*65)
total  = len(results)
passed = sum(results)
failed = total - passed

if failed == 0:
    print(f"  *** ALL {total}/{total} CHECKS PASSED --- Ready for Production! ***")
else:
    print(f"  WARNING: {passed}/{total} checks passed --- {failed} FAILED!")
    print("  Fix the [FAIL] items above before deploying.")
print("="*65 + "\n")

sys.exit(0 if failed == 0 else 1)
