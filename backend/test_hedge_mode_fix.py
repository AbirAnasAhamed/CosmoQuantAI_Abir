"""
=============================================================
 Binance Hedge Mode Fix Verifier  (-4061 Error Fix Test)
=============================================================
 This script tests that the positionSide injection logic in
 OrderBlockExecutionEngine._execute_real() works correctly
 for Binance Futures Hedge Mode WITHOUT making any real API calls.
=============================================================
"""

import asyncio
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# ── ANSI Colors ──────────────────────────────────────────────
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

def ok(msg):    print(f"  {GREEN}✅ PASS{RESET}  {msg}")
def fail(msg):  print(f"  {RED}❌ FAIL{RESET}  {msg}")
def info(msg):  print(f"  {CYAN}ℹ️  INFO{RESET}  {msg}")
def header(msg): print(f"\n{BOLD}{YELLOW}{'═'*60}{RESET}\n{BOLD} {msg}{RESET}\n{BOLD}{YELLOW}{'═'*60}{RESET}")

# ── Mock Exchange ─────────────────────────────────────────────
class MockExchange:
    """Simulates ccxt exchange — captures what params were sent."""
    def __init__(self):
        self.id = "binance"
        self.last_order_params = {}
        self.markets = {}

    async def create_order(self, symbol, type, side, amount, price=None, params=None):
        self.last_order_params = params or {}
        return {
            "id": "mock_order_123",
            "symbol": symbol,
            "side": side,
            "amount": amount,
            "price": price,
            "type": type,
            "params_sent": params,
            "status": "open"
        }

    def amount_to_precision(self, symbol, amount):
        return str(amount)

    def price_to_precision(self, symbol, price):
        return str(price)


# ── Test Runner ───────────────────────────────────────────────
class HedgeModeVerifier:
    def __init__(self):
        self.passed = 0
        self.failed = 0

    def assert_eq(self, label, actual, expected):
        if actual == expected:
            ok(f"{label}  →  got '{actual}'")
            self.passed += 1
        else:
            fail(f"{label}  →  expected '{expected}', got '{actual}'")
            self.failed += 1

    def assert_in(self, label, key, d):
        if key in d:
            ok(f"{label}  →  key '{key}' present")
            self.passed += 1
        else:
            fail(f"{label}  →  key '{key}' MISSING from params {d}")
            self.failed += 1

    def assert_not_in(self, label, key, d):
        if key not in d:
            ok(f"{label}  →  key '{key}' correctly absent")
            self.passed += 1
        else:
            fail(f"{label}  →  key '{key}' should NOT be in params {d}")
            self.failed += 1

    async def make_engine(self, exchange_id="binance", trading_mode="futures", strategy_mode="long"):
        from app.strategies.order_block_bot import OrderBlockExecutionEngine
        config = {
            "exchange": exchange_id,
            "trading_mode": trading_mode,
            "strategy_mode": strategy_mode,
            "is_paper_trading": False,
            "pair": "DOGE/USDT",
            "margin_mode": "cross",
            "leverage": 10,
        }
        mock_ex = MockExchange()
        mock_ex.id = exchange_id
        engine = OrderBlockExecutionEngine(config, exchange=mock_ex)
        engine.pair = "DOGE/USDT"
        return engine, mock_ex

    async def run(self):
        header("Test 1 · Binance Futures LONG Entry (BUY, no reduceOnly)")
        engine, mock = await self.make_engine("binance", "futures", "long")
        await engine.execute_trade("buy", 100, 0.09, order_type="market")
        self.assert_in   ("positionSide injected",  "positionSide", mock.last_order_params)
        self.assert_eq   ("positionSide = LONG",     mock.last_order_params.get("positionSide"), "LONG")

        header("Test 2 · Binance Futures SHORT Entry (SELL, no reduceOnly)")
        engine, mock = await self.make_engine("binance", "futures", "short")
        await engine.execute_trade("sell", 100, 0.09, order_type="market")
        self.assert_in   ("positionSide injected",  "positionSide", mock.last_order_params)
        self.assert_eq   ("positionSide = SHORT",    mock.last_order_params.get("positionSide"), "SHORT")

        header("Test 3 · Binance Futures LONG Exit (SELL + reduceOnly → positionSide=LONG)")
        engine, mock = await self.make_engine("binance", "futures", "long")
        await engine.execute_trade("sell", 100, 0.09, order_type="market", params={"reduceOnly": True})
        self.assert_in   ("positionSide injected",  "positionSide", mock.last_order_params)
        self.assert_eq   ("positionSide = LONG",     mock.last_order_params.get("positionSide"), "LONG")
        self.assert_eq   ("reduceOnly preserved",    mock.last_order_params.get("reduceOnly"), True)

        header("Test 4 · Binance Futures SHORT Exit (BUY + reduceOnly → positionSide=SHORT)")
        engine, mock = await self.make_engine("binance", "futures", "short")
        await engine.execute_trade("buy", 100, 0.09, order_type="market", params={"reduceOnly": True})
        self.assert_in   ("positionSide injected",  "positionSide", mock.last_order_params)
        self.assert_eq   ("positionSide = SHORT",    mock.last_order_params.get("positionSide"), "SHORT")
        self.assert_eq   ("reduceOnly preserved",    mock.last_order_params.get("reduceOnly"), True)

        header("Test 5 · Stop-Loss Order (stop_market + reduceOnly + stopPrice)")
        engine, mock = await self.make_engine("binance", "futures", "long")
        sl_params = {"reduceOnly": True, "stopPrice": 0.085}
        await engine.execute_trade("sell", 100, 0.085, order_type="stop_market", params=sl_params)
        self.assert_in   ("positionSide injected",  "positionSide", mock.last_order_params)
        self.assert_eq   ("positionSide = LONG",     mock.last_order_params.get("positionSide"), "LONG")
        self.assert_eq   ("stopPrice preserved",     mock.last_order_params.get("stopPrice"), 0.085)

        header("Test 6 · Limit TP Order (limit + reduceOnly)")
        engine, mock = await self.make_engine("binance", "futures", "long")
        tp_params = {"reduceOnly": True}
        await engine.execute_trade("sell", 100, 0.095, order_type="limit", params=tp_params)
        self.assert_in   ("positionSide injected",  "positionSide", mock.last_order_params)
        self.assert_eq   ("positionSide = LONG",     mock.last_order_params.get("positionSide"), "LONG")

        header("Test 7 · Kucoin Futures (should NOT inject positionSide, only marginMode)")
        config = {
            "exchange": "kucoin",
            "trading_mode": "futures",
            "strategy_mode": "long",
            "is_paper_trading": False,
            "pair": "DOGE/USDT",
            "margin_mode": "cross",
            "leverage": 10,
        }
        from app.strategies.order_block_bot import OrderBlockExecutionEngine
        mock_kuex = MockExchange()
        mock_kuex.id = "kucoin"
        engine_ku = OrderBlockExecutionEngine(config, exchange=mock_kuex)
        engine_ku.pair = "DOGE/USDT"
        await engine_ku.execute_trade("buy", 100, 0.09, order_type="market")
        self.assert_not_in("positionSide NOT injected for Kucoin", "positionSide", mock_kuex.last_order_params)
        self.assert_in    ("marginMode injected for Kucoin",        "marginMode",   mock_kuex.last_order_params)
        self.assert_eq    ("marginMode = CROSS",                     mock_kuex.last_order_params.get("marginMode"), "CROSS")

        header("Test 8 · Binance SPOT (should NOT inject positionSide)")
        engine, mock = await self.make_engine("binance", "spot", "long")
        await engine.execute_trade("buy", 100, 0.09, order_type="market")
        self.assert_not_in("positionSide NOT injected for Spot", "positionSide", mock.last_order_params)

        header("Test 9 · Caller provides positionSide manually (should NOT override)")
        engine, mock = await self.make_engine("binance", "futures", "long")
        await engine.execute_trade("buy", 100, 0.09, order_type="market", params={"positionSide": "SHORT"})
        self.assert_eq("Manual positionSide NOT overridden", mock.last_order_params.get("positionSide"), "SHORT")

        # ── Final Score ───────────────────────────────────────
        total = self.passed + self.failed
        print(f"\n{BOLD}{'═'*60}{RESET}")
        print(f"{BOLD} RESULTS: {self.passed}/{total} tests passed{RESET}")
        if self.failed == 0:
            print(f"\n{GREEN}{BOLD} 🎉 ALL TESTS PASSED! Hedge Mode fix is working correctly.{RESET}")
            print(f"{GREEN} Error -4061 will no longer occur on Binance Futures.{RESET}\n")
        else:
            print(f"\n{RED}{BOLD} ⚠️  {self.failed} test(s) FAILED. Review the fix!{RESET}\n")
        print(f"{'═'*60}\n")
        return self.failed


if __name__ == "__main__":
    verifier = HedgeModeVerifier()
    exit_code = asyncio.run(verifier.run())
    sys.exit(exit_code)
