import asyncio
import logging
from unittest.mock import MagicMock, AsyncMock

# Setup dummy logging
logging.basicConfig(level=logging.INFO)

from backend.app.strategies.wall_hunter_futures import WallHunterFuturesStrategy

async def test_futures_smart_logic():
    print("🚀 Running Futures Smart Logic & Safety Audit...")
    
    # 1. Mocking Redis and Exchange
    mock_redis = MagicMock()
    mock_engine = MagicMock()
    mock_engine.execute_trade = AsyncMock(return_value={"id": "dummy_123", "average": 50000.0})
    mock_engine.exchange = MagicMock()
    # Mock limits for execute_snipe precision checking
    mock_engine.exchange.markets = {
        "BTC/USDT:USDT": {"contractSize": 1.0, "limits": {"amount": {"min": 0.001}, "cost": {"min": 5.0}}}
    }
    
    config = {
        "symbol": "BTC/USDT:USDT",
        "buy_order_type": "market",
        "sell_order_type": "market",
        "base_amount": 100,  # 100 USDT size
        "leverage": 10,      # Means 1000 Notional target
        "target_spread": 50.0,
        
        # New Smart Configs
        "enable_oib_filter": True,
        "min_oib_threshold": 0.65, # Needs 65% dominance
        "enable_dynamic_atr_scalp": True,
        "micro_scalp_atr_multiplier": 0.5,
        "enable_micro_scalp": True,
        "initial_risk_pct": 1.0,
    }
    
    bot_record = MagicMock()
    bot_record.id = "test_bot_50"
    bot_record.owner_id = "user1"
    bot_record.config = config
    
    bot = WallHunterFuturesStrategy(bot_record, ccxt_service=None)
    bot.redis = mock_redis
    bot.engine = mock_engine
    bot.public_exchange = mock_engine.exchange
    
    # --- TEST 1: OIB Calculation ---
    orderbook = {
        "bids": [[50000, 10.0], [49990, 20.0]], # Vol = 30
        "asks": [[50010, 5.0], [50020, 5.0]]    # Vol = 10 (Total 40, Bid Dominance = 75%)
    }
    oib_ratio = bot.calculate_oib(orderbook, depth=2)
    print(f"\n[Test 1] OIB Ratio: {oib_ratio:.2f}")
    assert abs(oib_ratio - 0.75) < 0.001, "OIB Math error!"
    print("✅ TEST 1 PASSED: Orderbook Imbalance Math OK!")
    
    # --- TEST 2: Dynamic ATR micro-scalp targeting ---
    bot.current_atr = 200.0 # ATR is 200 USDT
    bot.atr_multiplier = 1.0 # Dynamic SL distance
    
    # Fire a Long snipe at 50,000
    await bot.execute_snipe(wall_price=50000.0, side="buy", current_mid_price=50000.0, reason="Test Mode")
    
    # Inspect internal active pos
    print(f"\n[Test 2] Active Future Position: {bot.active_pos}")
    
    # Expected: ATR is 200. TP distance = 200 * 0.5 = 100.
    # Entry=50000. TP should be 50100.
    # Default SL distance (atr_multiplier=1.0) = 200. SL should be 49800.
    
    tp_dist = bot.active_pos['tp'] - bot.active_pos['entry']
    sl_dist = bot.active_pos['entry'] - bot.active_pos['sl']
    
    print(f"Detected TP distance: {tp_dist:.2f}")
    print(f"Detected SL distance: {sl_dist:.2f}")
    
    assert abs(tp_dist - 100.0) < 0.1, f"Expected 100 TP distance, got {tp_dist}"
    assert abs(sl_dist - 200.0) < 0.1, f"Expected 200 SL distance, got {sl_dist}"
    print("✅ TEST 2 PASSED: Dynamic ATR Scaling accurately sets Future Target Limits!")

    print("\n🎉 ALL TESTS PASSED! Futures Strategy is logically secure.")

if __name__ == "__main__":
    asyncio.run(test_futures_smart_logic())
