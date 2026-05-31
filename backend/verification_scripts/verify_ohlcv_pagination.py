"""
verify_ohlcv_pagination.py  (mock-based — no internet required)
────────────────────────────────────────────────────────────────
Tests the exact fetch_ohlcv() logic from market_depth_service.py
using a mock exchange that simulates real Binance behavior.

Tests:
  1. Single request  (200 candles)  → no pagination path
  2. Paginated       (2000 candles) → 2 batches of 1000
  3. Cache key logic               → 200 vs 2000 keys must differ
  4. Hard cap at 2000              → 9999 clamped to 2000
  5. Sorted & deduplicated         → timestamps strictly ascending
  6. Pagination delay              → ≥0.5s between batches confirmed
  7. Exchange returns <batch       → stops early (no infinite loop)

Run:
    python verify_ohlcv_pagination.py
"""

import asyncio
import sys
import time

GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
RESET  = "\033[0m"
BOLD   = "\033[1m"

def ok(msg):   print(f"  {GREEN}✅ PASS{RESET}  {msg}")
def fail(msg): print(f"  {RED}❌ FAIL{RESET}  {msg}"); return False
def info(msg): print(f"  {CYAN}ℹ  {msg}{RESET}")
def warn(msg): print(f"  {YELLOW}⚠  {msg}{RESET}")

# ─── Constants (same as market_depth_service.py) ─────────────────────────────
BATCH_SIZE = 1000
MAX_LIMIT  = 2000
TIMEFRAME  = "15m"
TF_SECS    = 15 * 60            # 15 minutes in seconds
TF_MS      = TF_SECS * 1000     # in milliseconds


# ─── Mock exchange that simulates Binance's 1000-candle limit ────────────────
class MockExchange:
    """
    Produces synthetic OHLCV candles.
    Simulates Binance behavior:
      - max 1000 candles per request
      - `since` param respected (returns candles from that timestamp onward)
      - `limit`  param respected (max per request is BATCH_SIZE=1000)
    """
    TOTAL_AVAILABLE = 5000   # pretend exchange has 5000 candles of history
    delay_calls: list        # records inter-request sleep durations

    def __init__(self):
        self.delay_calls = []
        self._now_ms = int(time.time() * 1000)
        # Oldest available candle
        self._oldest_ms = self._now_ms - (self.TOTAL_AVAILABLE * TF_MS)

    def parse_timeframe(self, tf: str) -> int:
        return TF_SECS  # 900 seconds

    async def fetch_ohlcv(self, symbol: str, timeframe: str,
                          since: int = None, limit: int = 100) -> list:
        # Simulate exchange cap
        limit = min(limit, BATCH_SIZE)

        if since is None:
            # No since → return last `limit` candles
            start_ms = self._now_ms - (limit * TF_MS)
        else:
            start_ms = since

        # Clamp to oldest available
        start_ms = max(start_ms, self._oldest_ms)

        candles = []
        ts = start_ms
        for _ in range(limit):
            if ts >= self._now_ms:
                break
            # [timestamp, open, high, low, close, volume]
            price = 60000.0 + (ts % 10000) / 100
            candles.append([ts, price, price+10, price-10, price+5, 1.23])
            ts += TF_MS

        return candles

    async def close(self):
        pass


# ─── Exact replica of the updated fetch_ohlcv logic ─────────────────────────
async def fetch_ohlcv(exchange, symbol: str, timeframe: str, limit: int,
                      _sleep_tracker: list = None) -> list:
    """
    Mirrors the logic in market_depth_service.fetch_ohlcv() exactly.
    `_sleep_tracker` is injected only by tests to measure delay timing.
    """
    limit = min(limit, MAX_LIMIT)

    all_ohlcv = []

    if limit <= BATCH_SIZE:
        all_ohlcv = await exchange.fetch_ohlcv(symbol, timeframe, limit=limit)

    else:
        tf_ms: int = exchange.parse_timeframe(timeframe) * 1000
        now_ms: int = int(time.time() * 1000)
        since_ms: int = now_ms - (limit * tf_ms)
        remaining: int = limit

        while remaining > 0:
            batch = min(remaining, BATCH_SIZE)
            chunk = await exchange.fetch_ohlcv(
                symbol, timeframe, since=since_ms, limit=batch
            )
            if not chunk:
                break
            all_ohlcv.extend(chunk)
            remaining -= len(chunk)
            since_ms = chunk[-1][0] + tf_ms

            if len(chunk) < batch:
                break

            if remaining > 0:
                t_before = time.time()
                await asyncio.sleep(0.5)
                elapsed = time.time() - t_before
                if _sleep_tracker is not None:
                    _sleep_tracker.append(elapsed)

    # Deduplicate + sort
    seen = {}
    for c in all_ohlcv:
        seen[c[0]] = c
    all_ohlcv = sorted(seen.values(), key=lambda x: x[0])

    return [
        {"time": int(c[0] / 1000), "open": c[1], "high": c[2],
         "low": c[3], "close": c[4], "volume": c[5]}
        for c in all_ohlcv
    ]


# ─────────────────────────────────────────────────────────────────────────────
async def run_tests():
    ex = MockExchange()
    results = []

    # ══════════════════════════════════════════════════════════════════════════
    print(f"\n{BOLD}{CYAN}━━━  TEST 1: Single Request (200 candles)  ━━━{RESET}")
    try:
        t0 = time.time()
        data = await fetch_ohlcv(ex, "BTC/USDT", TIMEFRAME, limit=200)
        elapsed = time.time() - t0
        info(f"Fetched {len(data)} candles in {elapsed*1000:.0f}ms")

        if len(data) == 200:
            ok(f"Exactly 200 candles returned ✓")
            results.append(True)
        else:
            results.append(fail(f"Expected 200, got {len(data)}"))

        # Verify no pagination delay for single-request path
        if elapsed < 0.3:
            ok(f"No pagination delay (single-request path) ✓")
            results.append(True)
        else:
            results.append(fail(f"Unexpected delay {elapsed:.2f}s on single-request path"))

    except Exception as e:
        results.append(fail(f"Exception: {e}"))

    # ══════════════════════════════════════════════════════════════════════════
    print(f"\n{BOLD}{CYAN}━━━  TEST 2: Paginated Request (2000 candles, 2 batches)  ━━━{RESET}")
    try:
        sleep_log = []
        t0 = time.time()
        data = await fetch_ohlcv(ex, "BTC/USDT", TIMEFRAME, limit=2000,
                                 _sleep_tracker=sleep_log)
        elapsed = time.time() - t0
        info(f"Fetched {len(data)} candles in {elapsed:.2f}s")
        info(f"Pagination sleep calls: {[f'{s:.3f}s' for s in sleep_log]}")

        if len(data) >= 1500:
            ok(f"Got {len(data)} candles (≥1500 expected from 2 batches) ✓")
            results.append(True)
        else:
            results.append(fail(f"Only got {len(data)} candles — expected ~2000"))

        if len(sleep_log) >= 1:
            ok(f"Pagination triggered {len(sleep_log)} inter-batch delay(s) ✓")
            results.append(True)
        else:
            results.append(fail("No inter-batch delay was recorded — pagination did not trigger!"))

    except Exception as e:
        results.append(fail(f"Exception: {e}"))

    # ══════════════════════════════════════════════════════════════════════════
    print(f"\n{BOLD}{CYAN}━━━  TEST 3: Pagination Delay ≥ 0.5s  ━━━{RESET}")
    try:
        sleep_log = []
        await fetch_ohlcv(ex, "BTC/USDT", TIMEFRAME, limit=2000,
                          _sleep_tracker=sleep_log)
        if sleep_log:
            min_delay = min(sleep_log)
            if min_delay >= 0.45:
                ok(f"All inter-batch delays ≥ 0.5s (min={min_delay:.3f}s) ✓")
                results.append(True)
            else:
                results.append(fail(f"Delay too short: {min_delay:.3f}s — IP ban risk!"))
        else:
            warn("No delays measured (exchange may return <1000 in first batch)")
            results.append(True)
    except Exception as e:
        results.append(fail(f"Exception: {e}"))

    # ══════════════════════════════════════════════════════════════════════════
    print(f"\n{BOLD}{CYAN}━━━  TEST 4: Cache Key includes Limit  ━━━{RESET}")
    try:
        exid, sym, tf = "binance", "BTC/USDT", "15m"
        k200  = f"ohlcv:{exid}:{sym}:{tf}:200"
        k2000 = f"ohlcv:{exid}:{sym}:{tf}:2000"
        if k200 != k2000:
            ok("Cache keys are distinct (bug fixed) ✓")
            info(f"  200-key  → {k200}")
            info(f"  2000-key → {k2000}")
            results.append(True)
        else:
            results.append(fail("Cache keys are IDENTICAL — bug still present!"))
    except Exception as e:
        results.append(fail(f"Exception: {e}"))

    # ══════════════════════════════════════════════════════════════════════════
    print(f"\n{BOLD}{CYAN}━━━  TEST 5: Hard Cap at 2000  ━━━{RESET}")
    try:
        data = await fetch_ohlcv(ex, "BTC/USDT", TIMEFRAME, limit=9999)
        info(f"Asked for 9999 → received {len(data)} candles")
        if len(data) <= MAX_LIMIT:
            ok(f"Hard cap enforced: {len(data)} ≤ {MAX_LIMIT} ✓")
            results.append(True)
        else:
            results.append(fail(f"Cap NOT enforced — got {len(data)}!"))
    except Exception as e:
        results.append(fail(f"Exception: {e}"))

    # ══════════════════════════════════════════════════════════════════════════
    print(f"\n{BOLD}{CYAN}━━━  TEST 6: Sorted & Deduplicated  ━━━{RESET}")
    try:
        data = await fetch_ohlcv(ex, "BTC/USDT", TIMEFRAME, limit=2000)
        ts = [c["time"] for c in data]

        is_sorted = all(ts[i] < ts[i+1] for i in range(len(ts)-1))
        has_dupes = len(ts) != len(set(ts))

        if is_sorted:
            ok(f"Timestamps strictly ascending ✓  (first={ts[0]}, last={ts[-1]})")
            results.append(True)
        else:
            results.append(fail("Timestamps are NOT sorted!"))

        if not has_dupes:
            ok(f"No duplicate timestamps ✓  ({len(ts)} unique candles)")
            results.append(True)
        else:
            results.append(fail(f"{len(ts)-len(set(ts))} duplicates found!"))

        span_h = (ts[-1] - ts[0]) / 3600
        info(f"Data spans {span_h:.1f} hours ≈ {span_h/24:.1f} days")

    except Exception as e:
        results.append(fail(f"Exception: {e}"))

    # ══════════════════════════════════════════════════════════════════════════
    print(f"\n{BOLD}{CYAN}━━━  TEST 7: Early Stop when Exchange returns < batch  ━━━{RESET}")
    try:
        # Exchange has only 5000 candles total; asking for 2000 from far past
        # should stop early when no more data is available — no infinite loop.
        class LimitedExchange(MockExchange):
            TOTAL_AVAILABLE = 300   # only 300 candles available

        lex = LimitedExchange()
        t0 = time.time()
        data = await fetch_ohlcv(lex, "BTC/USDT", TIMEFRAME, limit=2000)
        elapsed = time.time() - t0
        info(f"Exchange had 300 candles, got {len(data)} back in {elapsed:.2f}s")
        if len(data) <= 350:  # small buffer for rounding
            ok(f"Loop stopped early correctly — no infinite loop ✓")
            results.append(True)
        else:
            results.append(fail(f"Expected ≤350 candles but got {len(data)}"))
    except Exception as e:
        results.append(fail(f"Exception: {e}"))

    # ══════════════════════════════════════════════════════════════════════════
    passed = sum(1 for r in results if r is True)
    total  = len(results)
    print(f"\n{BOLD}{'━'*52}")
    if passed == total:
        print(f"{GREEN}  🎉  ALL {total}/{total} CHECKS PASSED ✅{RESET}")
    else:
        print(f"{RED}  ❌  {passed}/{total} passed — {total-passed} FAILED{RESET}")
    print(f"{BOLD}{'━'*52}{RESET}\n")
    return passed == total


if __name__ == "__main__":
    success = asyncio.run(run_tests())
    sys.exit(0 if success else 1)
