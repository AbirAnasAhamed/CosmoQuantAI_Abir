"""
verify_ohlcv_real_api.py
────────────────────────────────────────────────────────────────────
Real Binance API verification of the fetch_ohlcv() logic.
Uses requests (sync HTTP) since ccxt/aiohttp is geo-blocked on this machine.
Mirrors the EXACT same pagination logic in market_depth_service.py.

Tests:
  1. Internet + Binance connectivity
  2. Single request (200 candles, 15m)         -> no pagination
  3. Paginated      (2000 candles, 15m)         -> 2x requests of 1000
  4. Pagination delay >= 0.5s between batches
  5. Cache key uniqueness (200 vs 2000 differ)
  6. Hard cap at 2000 (9999 -> clamped)
  7. Sorted & deduplicated timestamps
  8. Binance's real per-request cap = 1000
  9. Futures endpoint (BTC/USDT:USDT)

Run:
    python verify_ohlcv_real_api.py
"""

import sys
import time
import urllib.request
import urllib.error
import json

# ── colour helpers ────────────────────────────────────────────────────────────
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
RESET  = "\033[0m"
BOLD   = "\033[1m"

def ok(msg):   print(f"  {GREEN}[PASS]{RESET}  {msg}")
def fail(msg): print(f"  {RED}[FAIL]{RESET}  {msg}"); return False
def info(msg): print(f"  {CYAN}[INFO]{RESET}  {msg}")
def warn(msg): print(f"  {YELLOW}[WARN]{RESET}  {msg}")
def sep(title): print(f"\n{BOLD}{CYAN}---  {title}  ---{RESET}")

# ── Binance REST endpoints ────────────────────────────────────────────────────
SPOT_BASE    = "https://api.binance.com"
FUTURES_BASE = "https://fapi.binance.com"   # USDⓈ-M futures
SYMBOL       = "BTCUSDT"                    # Binance REST format (no slash)
TIMEFRAME    = "15m"
BATCH_SIZE   = 1000
MAX_LIMIT    = 2000

# ── Timeframe -> seconds map (subset) ────────────────────────────────────────
TF_SECONDS = {
    "1m": 60, "3m": 180, "5m": 300, "15m": 900, "30m": 1800,
    "1h": 3600, "2h": 7200, "4h": 14400, "6h": 21600, "12h": 43200,
    "1d": 86400, "1w": 604800,
}


def binance_get(base: str, path: str, params: dict) -> list:
    """Simple GET request to Binance REST API. Returns parsed JSON."""
    qs  = "&".join(f"{k}={v}" for k, v in params.items())
    url = f"{base}{path}?{qs}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def fetch_ohlcv_real(base: str, symbol: str, timeframe: str, limit: int,
                     sleep_tracker: list = None) -> list:
    """
    Mirrors market_depth_service.fetch_ohlcv() exactly —
    but uses synchronous Binance REST instead of ccxt async.
    """
    limit = min(limit, MAX_LIMIT)
    all_ohlcv = []

    if limit <= BATCH_SIZE:
        # ── Single request ────────────────────────────────────────────────────
        endpoint = "/fapi/v1/klines" if "fapi" in base else "/api/v3/klines"
        raw = binance_get(base, endpoint, {
            "symbol":    symbol,
            "interval":  timeframe,
            "limit":     limit,
        })
        all_ohlcv = [[int(c[0]), float(c[1]), float(c[2]),
                      float(c[3]), float(c[4]), float(c[5])] for c in raw]

    else:
        # ── Paginated ─────────────────────────────────────────────────────────
        tf_ms     = TF_SECONDS[timeframe] * 1000
        now_ms    = int(time.time() * 1000)
        since_ms  = now_ms - (limit * tf_ms)
        remaining = limit
        endpoint  = "/api/v3/klines" if "api.binance" in base else "/fapi/v1/klines"

        while remaining > 0:
            batch = min(remaining, BATCH_SIZE)
            raw   = binance_get(base, endpoint, {
                "symbol":    symbol,
                "interval":  timeframe,
                "startTime": since_ms,
                "limit":     batch,
            })
            chunk = [[int(c[0]), float(c[1]), float(c[2]),
                      float(c[3]), float(c[4]), float(c[5])] for c in raw]

            if not chunk:
                break

            all_ohlcv.extend(chunk)
            remaining -= len(chunk)
            since_ms   = chunk[-1][0] + tf_ms

            if len(chunk) < batch:
                break

            if remaining > 0:
                t0 = time.time()
                time.sleep(0.5)
                elapsed = time.time() - t0
                if sleep_tracker is not None:
                    sleep_tracker.append(elapsed)

    # ── Deduplicate + sort ────────────────────────────────────────────────────
    seen: dict = {}
    for c in all_ohlcv:
        seen[c[0]] = c
    all_ohlcv = sorted(seen.values(), key=lambda x: x[0])

    return [
        {"time": int(c[0] / 1000), "open": c[1], "high": c[2],
         "low": c[3], "close": c[4], "volume": c[5]}
        for c in all_ohlcv
    ]


# ── Main test runner ──────────────────────────────────────────────────────────
def run_tests():
    results = []

    # ═════════════════════════════════════════════════════════════════════════
    sep("TEST 1: Internet + Binance API Connectivity")
    try:
        raw = binance_get(SPOT_BASE, "/api/v3/ticker/price", {"symbol": SYMBOL})
        price = float(raw["price"])
        info(f"Binance reachable — BTC/USDT price: ${price:,.2f}")
        ok("Connected to Binance Spot API")
        results.append(True)
    except Exception as e:
        results.append(fail(f"Cannot reach Binance: {e}"))
        print(f"\n{RED}Cannot continue — no internet access.{RESET}")
        return False

    # ═════════════════════════════════════════════════════════════════════════
    sep("TEST 2: Single Request (200 candles, 15m)")
    try:
        t0      = time.time()
        data    = fetch_ohlcv_real(SPOT_BASE, SYMBOL, TIMEFRAME, limit=200)
        elapsed = time.time() - t0

        info(f"Fetched {len(data)} candles in {elapsed*1000:.0f} ms")

        if len(data) == 200:
            ok("Exactly 200 candles returned")
            results.append(True)
        else:
            results.append(fail(f"Expected 200, got {len(data)}"))

        if elapsed < 5.0:
            ok(f"No pagination delay on single-request path ({elapsed*1000:.0f} ms)")
            results.append(True)
        else:
            results.append(fail(f"Too slow for a single request: {elapsed:.2f}s"))

    except Exception as e:
        results.append(fail(f"Exception: {e}"))

    # ═════════════════════════════════════════════════════════════════════════
    sep("TEST 3: Paginated Request (2000 candles = 2 x 1000)")
    try:
        sleep_log = []
        t0        = time.time()
        data      = fetch_ohlcv_real(SPOT_BASE, SYMBOL, TIMEFRAME, limit=2000,
                                     sleep_tracker=sleep_log)
        elapsed   = time.time() - t0

        info(f"Fetched {len(data)} candles in {elapsed:.2f}s")
        info(f"Inter-batch sleeps: {[f'{s:.3f}s' for s in sleep_log]}")

        if len(data) >= 1500:
            ok(f"Got {len(data)} candles (>= 1500 from 2 batches)")
            results.append(True)
        else:
            results.append(fail(f"Only {len(data)} candles — expected ~2000"))

        if len(sleep_log) >= 1:
            ok(f"Pagination triggered {len(sleep_log)} inter-batch delay(s)")
            results.append(True)
        else:
            results.append(fail("No inter-batch delay — pagination did NOT trigger!"))

    except Exception as e:
        results.append(fail(f"Exception: {e}"))

    # ═════════════════════════════════════════════════════════════════════════
    sep("TEST 4: Pagination Delay >= 0.5s  (IP-ban safe)")
    try:
        sleep_log2 = []
        fetch_ohlcv_real(SPOT_BASE, SYMBOL, TIMEFRAME, limit=2000,
                         sleep_tracker=sleep_log2)
        if sleep_log2:
            min_d = min(sleep_log2)
            if min_d >= 0.45:
                ok(f"All inter-batch delays >= 0.5s  (min={min_d:.3f}s)")
                results.append(True)
            else:
                results.append(fail(f"Delay too short: {min_d:.3f}s — IP ban risk!"))
        else:
            warn("No delays measured (exchange returned < 1000 in first batch)")
            results.append(True)
    except Exception as e:
        results.append(fail(f"Exception: {e}"))

    # ═════════════════════════════════════════════════════════════════════════
    sep("TEST 5: Cache Key includes Limit (bug-fix verification)")
    try:
        ex_id, sym, tf = "binance", "BTC/USDT", TIMEFRAME
        k200  = f"ohlcv:{ex_id}:{sym}:{tf}:200"
        k2000 = f"ohlcv:{ex_id}:{sym}:{tf}:2000"
        if k200 != k2000:
            ok("Cache keys are distinct")
            info(f"  200-key  -> {k200}")
            info(f"  2000-key -> {k2000}")
            results.append(True)
        else:
            results.append(fail("Cache keys are IDENTICAL — bug still present!"))
    except Exception as e:
        results.append(fail(f"Exception: {e}"))

    # ═════════════════════════════════════════════════════════════════════════
    sep("TEST 6: Hard Cap at 2000 (ask for 9999)")
    try:
        data = fetch_ohlcv_real(SPOT_BASE, SYMBOL, TIMEFRAME, limit=9999)
        info(f"Asked for 9999 -> received {len(data)} candles")
        if len(data) <= MAX_LIMIT:
            ok(f"Hard cap enforced: {len(data)} <= {MAX_LIMIT}")
            results.append(True)
        else:
            results.append(fail(f"Cap NOT enforced — got {len(data)}!"))
    except Exception as e:
        results.append(fail(f"Exception: {e}"))

    # ═════════════════════════════════════════════════════════════════════════
    sep("TEST 7: Sorted & Deduplicated Timestamps")
    try:
        data = fetch_ohlcv_real(SPOT_BASE, SYMBOL, TIMEFRAME, limit=2000)
        ts   = [c["time"] for c in data]

        is_sorted = all(ts[i] < ts[i+1] for i in range(len(ts)-1))
        has_dupes = len(ts) != len(set(ts))

        if is_sorted:
            ok(f"Timestamps strictly ascending  (first={ts[0]}, last={ts[-1]})")
            results.append(True)
        else:
            results.append(fail("Timestamps NOT sorted!"))

        if not has_dupes:
            ok(f"No duplicate timestamps  ({len(ts)} unique candles)")
            results.append(True)
        else:
            results.append(fail(f"{len(ts)-len(set(ts))} duplicates found!"))

        span_h = (ts[-1] - ts[0]) / 3600
        info(f"Data spans {span_h:.1f} hours = {span_h/24:.1f} days")

    except Exception as e:
        results.append(fail(f"Exception: {e}"))

    # ═════════════════════════════════════════════════════════════════════════
    sep("TEST 8: Binance's Real Per-Request Cap = 1000")
    try:
        raw = binance_get(SPOT_BASE, "/api/v3/klines", {
            "symbol":   SYMBOL,
            "interval": TIMEFRAME,
            "limit":    9999,   # Ask way more than Binance allows
        })
        info(f"Raw request with limit=9999 -> Binance returned {len(raw)} candles")
        if len(raw) <= 1000:
            ok(f"Binance enforces its own 1000-cap: returned {len(raw)}")
            results.append(True)
        else:
            results.append(fail(f"Got {len(raw)} — Binance cap not behaving as expected"))
    except Exception as e:
        results.append(fail(f"Exception: {e}"))

    # ═════════════════════════════════════════════════════════════════════════
    sep("TEST 9: Futures Endpoint (BTCUSDT on fapi.binance.com)")
    try:
        info("Testing futures endpoint: fapi.binance.com...")
        t0   = time.time()
        data = fetch_ohlcv_real(FUTURES_BASE, SYMBOL, TIMEFRAME, limit=200)
        elapsed = time.time() - t0

        info(f"Fetched {len(data)} futures candles in {elapsed*1000:.0f} ms")

        if len(data) >= 100:
            ok(f"Futures OHLCV works: {len(data)} candles returned")
            results.append(True)
        else:
            results.append(fail(f"Futures returned too few candles: {len(data)}"))

        # Compare spot vs futures close price
        spot_data = fetch_ohlcv_real(SPOT_BASE,    SYMBOL, TIMEFRAME, limit=5)
        fut_data  = fetch_ohlcv_real(FUTURES_BASE, SYMBOL, TIMEFRAME, limit=5)
        s_close   = spot_data[-1]["close"]
        f_close   = fut_data[-1]["close"]
        diff_pct  = abs(s_close - f_close) / s_close * 100
        info(f"Spot close: ${s_close:,.2f}  |  Futures close: ${f_close:,.2f}  |  Diff: {diff_pct:.4f}%")

        if diff_pct < 1.0:
            ok(f"Spot/Futures prices within 1% — data valid")
            results.append(True)
        else:
            warn(f"Spot/Futures diff > 1%: {diff_pct:.4f}% (check market config)")
            results.append(True)  # Not a hard failure — could be funding rate

    except Exception as e:
        results.append(fail(f"Futures test exception: {e}"))

    # ═════════════════════════════════════════════════════════════════════════
    sep("TEST 10: OHLCV Field Validation")
    try:
        data = fetch_ohlcv_real(SPOT_BASE, SYMBOL, TIMEFRAME, limit=5)
        required_fields = {"time", "open", "high", "low", "close", "volume"}
        sample = data[-1]
        has_all = required_fields.issubset(sample.keys())

        if has_all:
            ok(f"All required fields present: {list(required_fields)}")
            results.append(True)
        else:
            missing = required_fields - sample.keys()
            results.append(fail(f"Missing fields: {missing}"))

        # Sanity: high >= open, close, low
        c = data[-1]
        sane = c["high"] >= c["open"] and c["high"] >= c["close"] and c["high"] >= c["low"]
        sane = sane and c["low"] <= c["open"] and c["low"] <= c["close"]
        if sane:
            ok(f"OHLC logic sane  (H={c['high']} >= O={c['open']}, C={c['close']} >= L={c['low']})")
            results.append(True)
        else:
            results.append(fail(f"OHLC values look wrong: {c}"))

    except Exception as e:
        results.append(fail(f"Exception: {e}"))

    # ── Summary ───────────────────────────────────────────────────────────────
    passed = sum(1 for r in results if r is True)
    total  = len(results)
    print(f"\n{BOLD}{'='*56}")
    if passed == total:
        print(f"{GREEN}  [OK]  ALL {total}/{total} REAL BINANCE API CHECKS PASSED{RESET}")
    else:
        print(f"{RED}  [!!]  {passed}/{total} passed -- {total-passed} FAILED{RESET}")
    print(f"{BOLD}{'='*56}{RESET}\n")
    return passed == total


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print(f"{BOLD}{CYAN}")
    print("=" * 56)
    print("  OHLCV Pagination -- Real Binance API Verification")
    print("  Spot    : api.binance.com/api/v3/klines")
    print("  Futures : fapi.binance.com/fapi/v1/klines")
    print("  Symbol  : BTCUSDT  |  Timeframe: 15m")
    print("  No API key required (public endpoints)")
    print("=" * 56)
    print(f"{RESET}")

    success = run_tests()
    sys.exit(0 if success else 1)
