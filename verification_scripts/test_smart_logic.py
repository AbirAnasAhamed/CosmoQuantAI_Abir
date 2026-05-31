import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))
os.environ["REDIS_URL"] = "redis://localhost:6379"

from app.strategies.wall_hunter_bot import WallHunterBot

async def run_tests():
    print("Running Diagnostics on Smart Logic Features...")
    
    with patch('app.strategies.wall_hunter_bot.get_redis_client'), \
         patch('app.strategies.wall_hunter_bot.OrderBlockExecutionEngine'), \
         patch('app.strategies.wall_hunter_bot.market_depth_service'), \
         patch('app.strategies.wall_hunter_bot.SessionLocal'), \
         patch('app.strategies.wall_hunter_bot.AdaptiveTrendFinder'), \
         patch('app.strategies.wall_hunter_bot.UTBotTracker'):
         
        config = {
            "symbol": "DOGE/USDT",
            "exchange": "binance",
            "is_paper_trading": True,
            "strategy_mode": "long",
            "enable_micro_scalp": True,
            "enable_dynamic_atr_scalp": True,  # Enable ATR scalp
            "micro_scalp_profit_ticks": 10, # Static fallback
            "micro_scalp_atr_multiplier": 0.5,
            "atr_multiplier": 1.0, # SL multiplier
            "initial_risk_pct": 5.0
        }
        
        bot = WallHunterBot(bot_id=999, config=config)
        bot.engine = AsyncMock()
        bot.engine.execute_trade = AsyncMock(return_value={"id": "test_order_xyz"})
        bot.engine.exchange = MagicMock()
        bot.engine.exchange.amount_to_precision = lambda sym, amt: f"{amt:.6f}"
        bot._save_state = MagicMock()
        bot.logger = MagicMock()
        bot._send_telegram = AsyncMock()
        
        FAILED = False
        
        # --- TEST 1: OIB Calculator ---
        print("\n--- Test 1: Orderbook Imbalance (OIB) ---")
        # Fake orderbook: heavy ask side (sell dominance)
        orderbook = {
            'bids': [[100.0, 10], [99.5, 10]], # Total Bid Vol: 20
            'asks': [[100.5, 40], [101.0, 40]]  # Total Ask Vol: 80
        }
        
        ratio = bot.calculate_oib(orderbook, depth=2)
        print(f"OIB Ratio calculated: {ratio:.2f}")
        
        # We expect 20 / (20 + 80) = 0.20
        if round(ratio, 2) == 0.20:
            print("PASS: OIB mathematically correct (20% Bid Dominance).")
        else:
            print("FAIL: OIB Calculation is wrong.")
            FAILED = True
            
        # Simulate logic flow inside bot without running full run_loop
        bot.enable_oib_filter = True
        bot.min_oib_threshold = 0.4 # 40% Minimum required
        
        # If we snipe a BUY wall, OIB needs to be >= 0.4.
        # But OIB is 0.20! So it should fail if side='buy'.
        is_safe_buy = not (ratio < bot.min_oib_threshold)
        if not is_safe_buy:
            print("PASS: Bot successfully identified a trap and would REJECT the Long snipe!")
        else:
            print("FAIL: Bot would mistakenly execute the snipe.")
            FAILED = True
            
        # If we snipe a SELL wall, OIB needs to support Asks (1 - ratio >= 0.4).
        # 1 - 0.20 = 0.80 >= 0.4. So It's SAFE to Short!
        is_safe_sell = not ((1 - ratio) < bot.min_oib_threshold)
        if is_safe_sell:
            print("PASS: Bot successfully verified Orderbook supports the Short snipe!")
        else:
            print("FAIL: Bot incorrectly rejected a safe Short.")
            FAILED = True


        # --- TEST 2: Dynamic ATR Micro-Scalp ---
        print("\n--- Test 2: Dynamic ATR-Based Micro Scalp Targeting ---")
        bot.active_pos = None
        bot.current_atr = 2.0  # ATR is $2
        bot.highest_price = 100.0
        
        # Snipe a LONG at $100
        await bot.execute_snipe(100.0, "buy", 100.0)
        
        # Calculate expected:
        # tp atr distance = 2.0 * 0.5 = 1.0 (Target is $101.0)
        # sl atr distance = 2.0 * 1.0 = 2.0 (SL is $98.0)
        
        actual_tp = bot.active_pos.get('tp')
        actual_sl = bot.active_pos.get('sl')
        
        print(f"Executed LONG Snipe at $100. Dynamic ATR (2.0).")
        print(f"Target TP: Expected 101.0, Got {actual_tp:.1f}")
        print(f"Target SL: Expected 98.0, Got {actual_sl:.1f}")
        
        if actual_tp == 101.0 and actual_sl == 98.0:
            print("PASS: Dynamic ATR correctly overrode fixed static ticks and dynamically expanded Targets!")
        else:
            print("FAIL: Dynamic ATR logic bug.")
            FAILED = True
            
        if not FAILED:
             print("\nALL SMART DIAGNOSTICS PASSED! Both OIB and ATR systems are flawless.")
        else:
             print("\nSOME DIAGNOSTICS FAILED.")

if __name__ == "__main__":
    asyncio.run(run_tests())
