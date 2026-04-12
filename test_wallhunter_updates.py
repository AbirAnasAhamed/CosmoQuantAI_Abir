import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))
os.environ["REDIS_URL"] = "redis://localhost:6379"

from app.strategies.wall_hunter_bot import WallHunterBot

async def run_tests():
    print("Running Virtual Diagnostics on WallHunterBot Logic Updates...")
    
    with patch('app.strategies.wall_hunter_bot.get_redis_client') as mock_redis, \
         patch('app.strategies.wall_hunter_bot.OrderBlockExecutionEngine') as mock_engine, \
         patch('app.strategies.wall_hunter_bot.market_depth_service'), \
         patch('app.strategies.wall_hunter_bot.SessionLocal'), \
         patch('app.strategies.wall_hunter_bot.AdaptiveTrendFinder'), \
         patch('app.strategies.wall_hunter_bot.UTBotTracker'):
         
        config = {
            "symbol": "DOGE/USDT",
            "exchange": "binance",
            "is_paper_trading": True,
            "strategy_mode": "long",
            "tsl_activation_pct": 1.0,
            "trailing_stop": 1.0,
            "sl_breakeven_trigger_pct": 2.0,
            "sl_breakeven_target_pct": 1.0,
            "partial_tp_pct": 50,
            "limit_buffer": 1.0
        }
        
        bot = WallHunterBot(bot_id=999, config=config)
        bot.engine = AsyncMock()
        bot.engine.execute_trade = AsyncMock(return_value={"id": "test_order_123"})
        bot.engine.exchange = MagicMock()
        bot.engine.exchange.amount_to_precision = lambda sym, amt: f"{amt:.6f}"
        bot._save_state = MagicMock()
        bot._send_telegram = AsyncMock()
        bot.logger = MagicMock()
        
        FAILED = False
        
        # TEST 1
        print("\n--- Test 1: Protective State Saving (TSL Amnesia) ---")
        bot.active_pos = {
            "entry": 100.0,
            "amount": 10.0,
            "sl": 90.0,
            "tp1": 110.0,
            "tp": 120.0,
            "tp1_hit": False,
            "breakeven_hit": False,
            "tsl_activated": False,
            "micro_scalp": False
        }
        bot.highest_price = 100.0
        
        await bot.manage_risk(100.5)
        if bot._save_state.call_count == 0:
            print("PASS: State not spammed artificially.")
        else:
            print("FAIL: State saved unnecessarily.")
            FAILED = True
            
        bot._save_state.reset_mock()
        await bot.manage_risk(105.0) 
        
        if bot._save_state.call_count == 1:
            print(f"PASS: TSL triggered. Stop Loss moved to {bot.active_pos['sl']:.2f}. State explicitly saved to Redis!")
        else:
            print("FAIL: Redis state save mechanism failed during TSL update.")
            FAILED = True
            
        # TEST 2
        print("\n--- Test 2: Partial Take-Profit Execution Safety ---")
        bot._save_state.reset_mock()
        await bot.manage_risk(111.0)
        
        try:
            bot.engine.execute_trade.assert_any_call("sell", 5.0, 111.0, order_type="market")
            print("PASS: Partial TP safely locked using exact Taker Market Order.")
        except AssertionError as e:
            print("FAIL: Partial TP did not execute as expected.", e)
            FAILED = True

        # TEST 3
        print("\n--- Test 3: Short Mode Dust Sweep Check ---")
        bot.engine.execute_trade.reset_mock()
        bot.strategy_mode = "short"
        bot.highest_price = 100.0
        bot.lowest_price = 100.0
        bot.active_pos = {
            "entry": 100.0,
            "amount": 12.5,
            "sl": 105.0,
            "tp1": 90.0,
            "tp": 80.0,
            "tp1_hit": False,
            "breakeven_hit": False,
            "tsl_activated": False,
            "micro_scalp": False,
            "limit_order_id": None
        }
        
        await bot.manage_risk(106.0)
        
        try:
            bot.engine.execute_trade.assert_any_call("buy", 12.5, 106.0, order_type="market")
            print("PASS: Short Stop-Loss bought exactly 12.5 coins back to clear all dust!")
        except AssertionError as e:
            print("FAIL: Sizing incorrect for Short Mode.", e)
            FAILED = True
            
        if not FAILED:
             print("\nALL DIAGNOSTICS PASSED! The updates are working perfectly.")
        else:
             print("\nSOME DIAGNOSTICS FAILED.")

if __name__ == "__main__":
    asyncio.run(run_tests())
