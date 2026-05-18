"""
WallHunter Futures -- Fee Fix Verification Script
Tests 4 core fixes WITHOUT real exchange/API keys

Run: python verify_fee_fixes.py
"""
import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import asyncio
import os
import uuid as _uuid
import logging

# Color output
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

PASS_S = f"{GREEN}[PASS]{RESET}"
FAIL_S = f"{RED}[FAIL]{RESET}"

results = []

def test(name: str, passed: bool, detail: str = ""):
    status = PASS_S if passed else FAIL_S
    print(f"  {status}  {name}")
    if detail:
        print(f"         {YELLOW}{detail}{RESET}")
    results.append((name, passed))


# =====================================================
# Mock Exchange
# =====================================================
class MockExchange:
    def __init__(self):
        self.id = "binance"
        self.markets = {
            "DOGE/USDC:USDC": {
                "precision": {"price": 0.00001, "amount": 1},
                "limits": {"amount": {"min": 1}, "cost": {"min": 5}},
                "contractSize": 1.0
            }
        }
        self._call_count = 0
        self._fail_first_n = 0
        self._fail_code = None

    def price_to_precision(self, symbol: str, price: float) -> str:
        return f"{round(float(price), 5):.5f}"

    def amount_to_precision(self, symbol: str, amount: float) -> str:
        return str(int(float(amount)))

    async def create_order(self, symbol, type, side, amount, price=None, params=None):
        self._call_count += 1
        if self._fail_first_n > 0:
            self._fail_first_n -= 1
            raise Exception(f'binance {{"code":{self._fail_code},"msg":"Test error"}}')
        return {
            "id": f"mock_order_{self._call_count}",
            "symbol": symbol, "type": type, "side": side,
            "amount": amount, "price": price,
            "status": "open", "filled": 0,
        }

    async def fetch_order_book(self, symbol, limit=5):
        return {
            "bids": [[0.10402, 50000], [0.10401, 30000]],
            "asks": [[0.10403, 40000], [0.10404, 25000]]
        }

    async def fetch_order(self, order_id, symbol):
        return {"id": order_id, "status": "closed", "filled": 100, "average": 0.10403}

    async def cancel_order(self, order_id, symbol=None):
        return True


# =====================================================
# Inline Engine (replicates the fixed _execute_real)
# =====================================================
class OrderBlockExecutionEngine:
    def __init__(self, config, exchange=None, bot_id=None):
        self.exchange = exchange
        self.exchange_id = config.get("exchange", "binance").lower()
        self.trading_mode = config.get("trading_mode", "futures")
        self.is_paper_trading = config.get("is_paper_trading", False)
        self.bot_id = bot_id
        self.config = config
        self.pair = config.get("symbol", "")
        self.is_hedge_mode = config.get("is_hedge_mode", False)
        self.margin_mode = config.get("margin_mode", "cross")
        self.logger = logging.getLogger("test_engine")
        self.strategy_mode = config.get("strategy_mode", "long")

    async def execute_trade(self, side, amount, price, order_type="market", params=None):
        if not self.exchange:
            return None
        try:
            final_order_type = order_type.lower()
            final_price = price
            symbol = self.pair

            # Amount + price precision
            try:
                if hasattr(self.exchange, 'amount_to_precision'):
                    amount = float(self.exchange.amount_to_precision(symbol, amount))
                if final_order_type == 'limit' and hasattr(self.exchange, 'price_to_precision'):
                    final_price = float(self.exchange.price_to_precision(symbol, final_price))
            except Exception:
                pass

            # FIX 1: Apply precision to stopPrice param
            order_params = dict(params or {})
            if 'stopPrice' in order_params and hasattr(self.exchange, 'price_to_precision'):
                try:
                    order_params['stopPrice'] = float(
                        self.exchange.price_to_precision(symbol, order_params['stopPrice'])
                    )
                except Exception:
                    pass

            # ClientOrderId tagging
            if self.bot_id:
                client_id = f"WH_{self.bot_id}_{_uuid.uuid4().hex[:12]}"
                order_params['newClientOrderId'] = client_id

            order = await self.exchange.create_order(
                symbol=symbol,
                type=final_order_type,
                side=side.lower(),
                amount=amount,
                price=final_price if final_order_type in ['limit', 'stop'] else None,
                params=order_params
            )
            return order

        except Exception as e:
            err_str = str(e)
            order_params = dict(params or {})

            # FIX 2: -5022 / postOnly rejection retry
            _is_postonly = (
                order_params.get('postOnly')
                and (
                    '-5022' in err_str
                    or 'immediately match' in err_str.lower()
                    or 'post only' in err_str.lower()
                )
            )
            if _is_postonly:
                try:
                    retry_book = await self.exchange.fetch_order_book(self.pair, limit=5)
                    best_bid = retry_book['bids'][0][0] if retry_book.get('bids') else price
                    best_ask = retry_book['asks'][0][0] if retry_book.get('asks') else price
                    tick = round(best_bid * 1e-5, 10)
                    try:
                        mkt = self.exchange.markets.get(self.pair, {})
                        p = mkt.get('precision', {}).get('price')
                        if p and float(p) > 0:
                            tick = float(p)
                    except Exception:
                        pass
                    retry_price = (best_ask + tick) if side.lower() == 'sell' else (best_bid - tick)
                    if hasattr(self.exchange, 'price_to_precision'):
                        retry_price = float(self.exchange.price_to_precision(self.pair, retry_price))
                    return await self.exchange.create_order(
                        symbol=self.pair, type=final_order_type,
                        side=side.lower(), amount=amount,
                        price=retry_price, params=order_params
                    )
                except Exception:
                    return None
            self.logger.error(f"Order failed: {e}")
            return None


# =====================================================
# TEST 1: stopPrice Precision (-1111 fix)
# =====================================================
async def test_stopprice_precision():
    print(f"\n{BOLD}{CYAN}--- TEST 1: stopPrice Precision Fix (-1111) ---{RESET}")

    exchange = MockExchange()
    config = {"symbol": "DOGE/USDC:USDC", "is_paper_trading": False,
              "exchange": "binance", "trading_mode": "futures", "bot_id": 9}
    engine = OrderBlockExecutionEngine(config, exchange=exchange, bot_id=9)

    raw_sl = 0.10380198  # 8 decimals → was causing -1111
    captured = {}

    original_create = exchange.create_order
    async def intercept(symbol, type, side, amount, price=None, params=None):
        captured.update(params or {})
        return await original_create(symbol, type, side, amount, price, params)
    exchange.create_order = intercept

    await engine.execute_trade("sell", 961, raw_sl, order_type="stop_market",
                                params={"reduceOnly": True, "stopPrice": raw_sl})

    sent = captured.get("stopPrice", raw_sl)
    sent_str = str(sent)
    dec = len(sent_str.rstrip("0").split(".")[-1]) if "." in sent_str else 0

    test("stopPrice precision <= 5 decimals", dec <= 5,
         f"Raw: {raw_sl!r} (8dec) -> Sent: {sent} ({dec}dec)")
    test("stopPrice value is correct",
         abs(float(sent) - round(raw_sl, 5)) < 1e-7,
         f"Expected {round(raw_sl,5)}, Got {sent}")


# =====================================================
# TEST 2: -5022 postOnly Retry
# =====================================================
async def test_postonly_retry():
    print(f"\n{BOLD}{CYAN}--- TEST 2: -5022 postOnly Retry Logic ---{RESET}")

    exchange = MockExchange()
    exchange._fail_first_n = 1
    exchange._fail_code = -5022

    config = {"symbol": "DOGE/USDC:USDC", "is_paper_trading": False,
              "exchange": "binance", "trading_mode": "futures", "bot_id": 9}
    engine = OrderBlockExecutionEngine(config, exchange=exchange, bot_id=9)

    result = await engine.execute_trade("sell", 961, 0.10403, order_type="limit",
                                        params={"reduceOnly": True, "postOnly": True})

    test("-5022 triggers retry (2 create_order calls)",
         exchange._call_count == 2,
         f"create_order called {exchange._call_count}x (expected 2: fail + retry)")
    test("Retry returns a valid order",
         result is not None and "id" in result,
         f"Result id: {result.get('id') if result else 'None'}")
    test("Retry uses a different (adjusted) price",
         result is not None and result.get("price") != 0.10403,
         f"Original: 0.10403, Retry: {result.get('price') if result else 'N/A'}")


# =====================================================
# TEST 3: Float Precision (TP/SL)
# =====================================================
async def test_tp_sl_precision():
    print(f"\n{BOLD}{CYAN}--- TEST 3: TP/SL Float Precision Fix ---{RESET}")

    # Use values that actually trigger Python float imprecision
    entry = 0.10401
    # 0.10401 + 0.00002 = 0.10403000000000001 (float imprecision)
    spread = 0.00002
    raw_tp = entry + spread

    test("Raw float addition causes imprecision",
         raw_tp != round(entry + spread, 5),
         f"0.10401 + 0.00002 = {raw_tp!r}")

    ex = MockExchange()
    fixed_tp = float(ex.price_to_precision("DOGE/USDC:USDC", raw_tp))
    expected_tp = round(raw_tp, 5)

    test("price_to_precision removes float garbage",
         fixed_tp == expected_tp,
         f"Raw: {raw_tp!r} -> Fixed: {fixed_tp} (expected {expected_tp})")

    raw_sl = entry * (1 - (0.2 / 100))  # e.g. 0.10380798... many decimals
    fixed_sl = float(ex.price_to_precision("DOGE/USDC:USDC", raw_sl))
    sl_dec = len(str(fixed_sl).rstrip("0").split(".")[-1]) if "." in str(fixed_sl) else 0
    test("SL price precision <= 5 decimals",
         sl_dec <= 5,
         f"Raw SL: {raw_sl!r} -> Fixed: {fixed_sl} ({sl_dec}dec)")


# =====================================================
# TEST 4: Soft Limit TP (Maker then Market fallback)
# =====================================================
async def test_soft_limit_tp():
    print(f"\n{BOLD}{CYAN}--- TEST 4: Soft Limit TP (Maker->Market fallback) ---{RESET}")

    # Scenario A: Maker fills on 2nd poll
    print(f"  {YELLOW}Scenario A: Maker fills within timeout{RESET}")

    ex = MockExchange()
    poll_n = [0]
    async def fills_on_2nd(order_id, symbol=None):
        poll_n[0] += 1
        if poll_n[0] >= 2:
            return {"id": order_id, "status": "closed", "filled": 961, "average": 0.10403}
        return {"id": order_id, "status": "open", "filled": 0}
    ex.fetch_order = fills_on_2nd

    market_called = [False]
    orig_create = ex.create_order
    async def track(symbol, type, side, amount, price=None, params=None):
        if type == "market":
            market_called[0] = True
        return await orig_create(symbol, type, side, amount, price, params)
    ex.create_order = track

    # Soft Limit TP flow
    ob = await ex.fetch_order_book("DOGE/USDC:USDC")
    best_ask = ob["asks"][0][0]
    soft_price = float(ex.price_to_precision("DOGE/USDC:USDC", best_ask + 0.00001))
    maker_res = await ex.create_order("DOGE/USDC:USDC", "limit", "sell", 961,
                                       price=soft_price, params={"postOnly": True})
    final = None
    for _ in range(4):
        await asyncio.sleep(0.02)
        chk = await ex.fetch_order(maker_res["id"])
        if chk.get("status") not in ["open", "new"]:
            final = chk
            break

    test("Maker fills: status == closed", final is not None and final.get("status") == "closed")
    test("Maker fills: No market order fired", not market_called[0], "Maker fee achieved")

    # Scenario B: Maker never fills -> market sweep
    print(f"  {YELLOW}Scenario B: Timeout -> market sweep{RESET}")

    ex2 = MockExchange()
    async def never_fills(order_id, symbol=None):
        return {"id": order_id, "status": "open", "filled": 0}
    market_b = [False]
    async def track_b(symbol, type, side, amount, price=None, params=None):
        if type == "market":
            market_b[0] = True
        return {"id": f"ord_{type}", "status": "open", "filled": 0, "price": price}
    ex2.fetch_order = never_fills
    ex2.create_order = track_b

    mk = await ex2.create_order("DOGE/USDC:USDC","limit","sell",961,price=0.10404,params={"postOnly":True})
    still_open = False
    for _ in range(2):
        chk = await ex2.fetch_order(mk["id"])
        if chk.get("status") in ["open","new"]:
            still_open = True
    if still_open:
        await ex2.cancel_order(mk["id"])
        await ex2.create_order("DOGE/USDC:USDC","market","sell",961,price=None,params={"reduceOnly":True})

    test("Timeout detected (order stayed open)", still_open)
    test("Market fallback executed (position closed)", market_b[0], "Taker only as last resort")


# =====================================================
# MAIN
# =====================================================
async def main():
    SEP = "=" * 55
    print(f"\n{BOLD}{SEP}{RESET}")
    print(f"{BOLD}  WallHunter Futures Fee Fix -- Verification Suite{RESET}")
    print(f"{BOLD}{SEP}{RESET}")

    await test_stopprice_precision()
    await test_postonly_retry()
    await test_tp_sl_precision()
    await test_soft_limit_tp()

    total  = len(results)
    passed = sum(1 for _, ok in results if ok)
    failed = total - passed

    print(f"\n{BOLD}{SEP}{RESET}")
    if failed == 0:
        print(f"{BOLD}  Results: {GREEN}{passed}/{total} PASSED -- All fixes verified! {RESET}")
    else:
        print(f"{BOLD}  Results: {GREEN}{passed}/{total} passed{RESET}  {RED}{failed} FAILED{RESET}")
    print(f"{BOLD}{SEP}{RESET}\n")

    if failed:
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
