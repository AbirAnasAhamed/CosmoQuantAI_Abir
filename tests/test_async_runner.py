
import asyncio
import sys
import os
from unittest.mock import MagicMock

# MOCK Dependencies BEFORE importing backend modules
sys.modules["pandas"] = MagicMock()
sys.modules["pandas_ta"] = MagicMock()
sys.modules["ccxt"] = MagicMock()
sys.modules["ccxt.async_support"] = MagicMock()
sys.modules["websockets"] = MagicMock()
sys.modules["redis"] = MagicMock()
sys.modules["redis.asyncio"] = MagicMock()
sys.modules["aiohttp"] = MagicMock()
sys.modules["jose"] = MagicMock()
sys.modules["passlib"] = MagicMock()
sys.modules["passlib.context"] = MagicMock()
sys.modules["multipart"] = MagicMock()
sys.modules["pydantic"] = MagicMock()
sys.modules["pydantic_settings"] = MagicMock()

# Mocking FastApi
sys.modules["fastapi"] = MagicMock()
sys.modules["fastapi.security"] = MagicMock()

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

# We need to mock app.core.config because it is imported early
mock_config = MagicMock()
mock_config.settings = MagicMock()
sys.modules["app.core.config"] = mock_config

# Now import services
# Since we mocked pydantic, we might have issues if models use it.
# Let's hope BotManager doesn't depend too heavily on deep Pydantic logic being real.

from app.services.bot_manager import BotManager
from app.services.shared_stream import SharedMarketStream
from app.services.async_bot_instance import AsyncBotInstance
from unittest.mock import AsyncMock

async def test_bot_manager():
    print("🧪 Starting Bot Manager Test...")
    
    # 1. Initialize Manager
    manager = BotManager()
    manager.start_service()
    
    # 2. Mock DB Session and Bot
    mock_db = MagicMock()
    mock_bot = MagicMock()
    mock_bot.id = 1
    mock_bot.exchange = 'binance'
    mock_bot.market = 'BTC/USDT'
    mock_bot.timeframe = '1m'
    mock_bot.status = 'inactive'
    mock_bot.config = {}
    mock_bot.owner_id = 1
    
    mock_db.query.return_value.filter.return_value.first.return_value = mock_bot
    
    # Mock AsyncBotInstance methods to avoid real network calls
    AsyncBotInstance.start = AsyncMock()
    AsyncBotInstance.stop = AsyncMock()
    
    # Also mock SharedMarketStream methods
    SharedMarketStream.subscribe = AsyncMock()
    SharedMarketStream.unsubscribe = AsyncMock()
    SharedMarketStream.stop = AsyncMock()
    
    # 3. Start Bot
    print("▶️ Attempting to start bot...")
    result = await manager.start_bot(1, mock_db)
    print(f"Start Result: {result}")
    
    # Verify Stream Creation
    stream_key = "binance_BTC/USDT_1m"
    if stream_key in manager.streams:
        print(f"✅ Stream created: {stream_key}")
    else:
        print(f"❌ Stream NOT created: {stream_key}")
        
    if 1 in manager.active_bots:
        print("✅ Bot added to active list")
    else:
        print("❌ Bot NOT in active list")
    
    # 4. Stop Bot
    print("⏹️ Attempting to stop bot...")
    result = await manager.stop_bot(1, mock_db)
    print(f"Stop Result: {result}")
    
    if 1 not in manager.active_bots:
        print("✅ Bot removed from active list")
    else:
        print("❌ Bot STILL in active list")
        
    if stream_key not in manager.streams:
        print("✅ Stream cleaned up")
    else:
        print("❌ Stream NOT cleaned up")

    await manager.stop_service()
    print("✅ Test Completed")

if __name__ == "__main__":
    try:
        asyncio.run(test_bot_manager())
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Test Failed: {e}")
