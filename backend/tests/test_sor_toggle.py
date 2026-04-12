import asyncio
from unittest.mock import MagicMock, AsyncMock
from app.services.arbitrage_engine import ArbitrageBotInstance

async def test_sor_toggle():
    print("🧪 Starting SOR Toggle verification...")
    
    # 1. Test with SOR DISABLED
    print("\n[CASE 1] SOR Enabled = FALSE, Amount = $2000 (Threshold $1000)")
    config_disabled = {
        "exchange_a": "binance", "exchange_b": "kraken",
        "sor_enabled": False, # DISABLED
        "sor_threshold": 1000.0,
        "trade_amount": 2000.0, 
        "is_paper_trading": True
    }
    
    bot_disabled = ArbitrageBotInstance(user_id=1, config=config_disabled)
    bot_disabled._log = AsyncMock() # Shush logs
    bot_disabled.exchange_a = MagicMock()
    bot_disabled.exchange_a.create_market_buy_order = AsyncMock(return_value={'id': '1', 'price': 50000, 'amount': 0.04})
    bot_disabled.exchange_b = MagicMock()
    bot_disabled.exchange_b.create_market_sell_order = AsyncMock(return_value={'id': '1'})

    # Mock trading functions
    # We want to see if execute_large_order is called. 
    # Since it is imported, we might need to patch it or check the logs/behavior.
    # In my implementation, I check `if is_sor_enabled and ...`.
    # I can check if 'create_market_buy_order' was called once (Normal) or if it went through SOR path.
    # But wait, execute_large_order calls create_market_buy multiple times.
    
    await bot_disabled._execute_trade('BTC/USDT', 50000, 51000, 2.0)
    
    # Expectation: 1 call to create_market_buy_order (Normal Trade)
    print(f"✅ (Disabled) Exchange calls: {bot_disabled.exchange_a.create_market_buy_order.call_count}")
    if bot_disabled.exchange_a.create_market_buy_order.call_count == 1:
         print("✅ SUCCESS: SOR Disabled -> Single Order Executed.")
    else:
         print(f"❌ FAILURE: SOR Disabled -> Expected 1 call, got {bot_disabled.exchange_a.create_market_buy_order.call_count}")

    # 2. Test with SOR ENABLED
    print("\n[CASE 2] SOR Enabled = TRUE, Amount = $2000 (Threshold $1000)")
    config_enabled = {
        "exchange_a": "binance", "exchange_b": "kraken",
        "sor_enabled": True, # ENABLED
        "sor_threshold": 1000.0,
        "trade_amount": 2000.0,
        "is_paper_trading": True
    }
    
    bot_enabled = ArbitrageBotInstance(user_id=2, config=config_enabled)
    bot_enabled._log = AsyncMock()
    bot_enabled.exchange_a = MagicMock()
    # Mocking create_market_buy_order for the chunks
    bot_enabled.exchange_a.create_market_buy_order = AsyncMock(return_value={'id': 'chunk', 'price': 50000, 'amount': 0.008})
    bot_enabled.exchange_b = MagicMock()
    bot_enabled.exchange_b.create_market_sell_order = AsyncMock(return_value={'id': 'chunk'})
    
    # We also need to patch asyncio.sleep to be fast
    original_sleep = asyncio.sleep
    asyncio.sleep = AsyncMock()
    
    await bot_enabled._execute_trade('BTC/USDT', 50000, 51000, 2.0)
    
    # Expectation: 5 calls (default chunks) to create_market_buy_order
    print(f"✅ (Enabled) Exchange calls: {bot_enabled.exchange_a.create_market_buy_order.call_count}")
    
    if bot_enabled.exchange_a.create_market_buy_order.call_count == 5:
         print("✅ SUCCESS: SOR Enabled -> 5 Chunks Executed.")
    else:
         print(f"❌ FAILURE: SOR Enabled -> Expected 5 calls, got {bot_enabled.exchange_a.create_market_buy_order.call_count}")

if __name__ == "__main__":
    asyncio.run(test_sor_toggle())
