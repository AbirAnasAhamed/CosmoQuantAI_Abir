
import pytest
import asyncio
from unittest.mock import MagicMock, AsyncMock
from fastapi import HTTPException
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Mock DB and Models
class MockBot:
    def __init__(self, id, status, owner_id=1):
        self.id = id
        self.status = status
        self.owner_id = owner_id
        self.market = "BTC/USDT"

class MockState:
    pass

async def delete_bot_logic(request, db, bot_id, current_user):
    print(f"DEBUG: Entering function for bot {bot_id}")
    
    # Simulate DB fetch
    bot = db.query(MockBot).filter().first() 
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
        
    print(f"DEBUG: Bot status is {bot.status}")
    if bot.status == "active":
        try:
            print("DEBUG: Checking bot_manager in app.state")
            if hasattr(request.app.state, "bot_manager"):
                manager = request.app.state.bot_manager
                print(f"DEBUG: Manager found. Active bots: {manager.active_bots.keys()}")
                
                if bot_id in manager.active_bots:
                    print("DEBUG: Bot ID found in active_bots")
                    bot_instance = manager.active_bots[bot_id]
                    
                    print(f"DEBUG: Exchange present? {bot_instance.exchange}")
                    if bot_instance.exchange:
                        logger.info(f"🛑 specific-cancel: Cancelling orders for bot {bot_id} before deletion...")
                        print("DEBUG: Calling cancel_all_orders...")
                        try:
                            await bot_instance.exchange.cancel_all_orders(bot_instance.symbol)
                            print("DEBUG: Cancel successful")
                        except Exception as ex_cancel:
                            print(f"DEBUG: Cancel Failed: {ex_cancel}")
                            logger.error(f"❌ Failed to cancel orders for bot {bot_id}: {ex_cancel}")
                            raise ex_cancel 
                    else:
                        print("DEBUG: Exchange NOT found on instance")
                else:
                    print(f"DEBUG: Bot ID {bot_id} NOT found in active_bots")
                
                # 2. Force Stop
                print("DEBUG: Calling stop_bot")
                await manager.stop_bot(bot_id, db)
            else:
                 print("DEBUG: BotManager NOT found in app.state")
                 logger.warning("BotManager not initialized in app.state")
                 raise HTTPException(status_code=500, detail="Internal Error: BotManager not available.")

        except Exception as e:
            print(f"DEBUG: Exception caught: {e}")
            logger.error(f"Error stopping bot {bot_id} before deletion: {e}")
            raise HTTPException(
                status_code=500, 
                detail="Cannot delete bot: Failed to stop safely or cancel orders"
            )
            
    db.delete(bot)
    db.commit()
    print("DEBUG: DB Delete called")
    return bot

# --- TESTS ---

@pytest.mark.asyncio
async def test_delete_active_bot_success():
    print("\n--- Testing Success Case ---")
    mock_db = MagicMock()
    mock_bot = MockBot(id=1, status="active")
    mock_db.query.return_value.filter.return_value.first.return_value = mock_bot
    
    state = MockState()
    mock_manager = MagicMock()
    state.bot_manager = mock_manager
    
    mock_req = MagicMock()
    mock_req.app.state = state
    
    mock_instance = MagicMock()
    mock_instance.symbol = "BTC/USDT"
    mock_instance.exchange = AsyncMock() 
    
    mock_manager.active_bots = {1: mock_instance}
    mock_manager.stop_bot = AsyncMock() 
    
    await delete_bot_logic(mock_req, mock_db, 1, None)
    
    print("Verifying calls...")
    mock_instance.exchange.cancel_all_orders.assert_called_once()
    mock_manager.stop_bot.assert_called_once()
    mock_db.delete.assert_called_once()
    print("✅ Success Case Passed")

@pytest.mark.asyncio
async def test_delete_active_bot_cancel_fails():
    print("\n--- Testing Cancel Failure Case ---")
    mock_db = MagicMock()
    mock_bot = MockBot(id=1, status="active")
    mock_db.query.return_value.filter.return_value.first.return_value = mock_bot
    
    state = MockState()
    mock_manager = MagicMock()
    state.bot_manager = mock_manager
    
    mock_req = MagicMock()
    mock_req.app.state = state
    
    mock_instance = MagicMock()
    mock_instance.symbol = "BTC/USDT"
    
    mock_instance.exchange = AsyncMock()
    mock_instance.exchange.cancel_all_orders.side_effect = Exception("Network Error")
    
    mock_manager.active_bots = {1: mock_instance}
    
    try:
        await delete_bot_logic(mock_req, mock_db, 1, None)
        assert False, "Should have raised HTTPException"
    except HTTPException as e:
        assert e.status_code == 500
        print(f"✅ Correctly caught error: {e.detail}")
        
    mock_db.delete.assert_not_called()
    print("✅ Cancel Failure Case Passed")

@pytest.mark.asyncio
async def test_delete_active_bot_stop_fails():
    print("\n--- Testing Stop Failure Case ---")
    mock_db = MagicMock()
    mock_bot = MockBot(id=1, status="active")
    mock_db.query.return_value.filter.return_value.first.return_value = mock_bot
    
    state = MockState()
    mock_manager = MagicMock()
    state.bot_manager = mock_manager
    
    mock_req = MagicMock()
    mock_req.app.state = state
    
    mock_instance = MagicMock()
    mock_instance.exchange = AsyncMock()
    
    mock_manager.active_bots = {1: mock_instance}
    mock_manager.stop_bot = AsyncMock(side_effect=Exception("Stop Error"))
    
    try:
        await delete_bot_logic(mock_req, mock_db, 1, None)
        assert False, "Should have raised HTTPException"
    except HTTPException as e:
        assert e.status_code == 500
        print(f"✅ Correctly caught error: {e.detail}")

    mock_db.delete.assert_not_called()
    print("✅ Stop Failure Case Passed")

if __name__ == "__main__":
    async def main():
        await test_delete_active_bot_success()
        await test_delete_active_bot_cancel_fails()
        await test_delete_active_bot_stop_fails()
    asyncio.run(main())
