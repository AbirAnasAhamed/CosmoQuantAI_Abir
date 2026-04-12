import asyncio
import sys
import os
import logging
from unittest.mock import AsyncMock, MagicMock

# Ensure project root is in path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.db.session import SessionLocal
from app.models.grid import GridBot, GridOrder
from app.models import User
from app.api.deps import get_db
from app.strategies.grid import GridTradingBot

# Configure Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("GridVerifier")

async def run_verification():
    logger.info("🧪 Starting Grid System Verification...")
    
    db = SessionLocal()
    
    # 1. SETUP: Create Dummy Data
    try:
        # User
        logger.info("Step 1: Creating Dummy User...")
        user = User(email="test_qa@example.com", hashed_password="hashed_secret", is_active=True)
        db.add(user)
        db.commit()
        db.refresh(user)
        
        # Grid Bot
        logger.info("Step 2: Creating Test Grid Bot (Paper Mode)...")
        bot_config = GridBot(
            user_id=user.id,
            pair="BTC/USDT",
            exchange="binance",
            lower_limit=90000.0,
            upper_limit=100000.0,
            grid_count=5,
            amount_per_grid=100.0,
            is_paper_trading=True,
            paper_balance_initial=10000.0,
            paper_balance_current=10000.0,
            is_active=True
        )
        db.add(bot_config)
        db.commit()
        db.refresh(bot_config)
        
        # 2. INITIALIZATION
        logger.info("Step 3: Initializing GridTradingBot Strategy...")
        # Config dict normally comes from API, we reconstruct it
        config = {
            "pair": bot_config.pair,
            "exchange": bot_config.exchange,
            "lower_limit": bot_config.lower_limit,
            "upper_limit": bot_config.upper_limit,
            "grid_count": bot_config.grid_count,
            "amount_per_grid": bot_config.amount_per_grid,
            "is_paper_trading": bot_config.is_paper_trading,
            "user_id": user.id
        }
        
        strategy = GridTradingBot(bot_config.id, config)
        
        # Mock Exchange to avoid real connection errors
        strategy.exchange = AsyncMock()
        strategy.redis = AsyncMock() # Mock redis to prevent errors
        
        # 3. SIMULATION: Initial Placement
        logger.info("Step 4: Simulating Start & Initial Orders...")
        # Assume current price is 95000 (Mid-range)
        current_price = 95000.0
        grids = strategy._calculate_grids(current_price)
        
        logger.info(f"Calculated {len(grids)} initial orders relative to price {current_price}")
        for g in grids:
             qty = 100.0 / g['price']
             await strategy._place_order_dual(g['type'], g['price'], qty)
             
        # Verify Orders in DB
        orders = db.query(GridOrder).filter(GridOrder.bot_id == bot_config.id).all()
        assert len(orders) > 0, "❌ No orders persisted to DB!"
        logger.info(f"✅ Verified {len(orders)} orders created in DB.")
        
        # 4. SIMULATION: Buy Fill Scenario
        # Find a BUY order to trigger
        buy_orders = [o for o in orders if o.side == 'buy']
        if not buy_orders:
            logger.error("No buy orders found to test!")
            return
            
        target_buy = buy_orders[0]
        trigger_price = target_buy.price - 1.0 # Slightly below limit
        logger.info(f"Step 5: Simulating Price Drop to {trigger_price} (Target Buy @ {target_buy.price})...")
        
        # Run Check
        await strategy._check_order_status_dual([target_buy], trigger_price)
        
        # Verify Updates
        db.refresh(target_buy)
        assert target_buy.status == 'filled', f"❌ Order {target_buy.id} status is {target_buy.status}, expected 'filled'"
        logger.info(f"✅ Order {target_buy.id} marked FILLED.")
        
        # Check for Count-Sell Order
        new_orders = db.query(GridOrder).filter(GridOrder.bot_id == bot_config.id).all()
        assert len(new_orders) > len(orders), "❌ No counter-order created!"
        logger.info("✅ Counter-Sell order creation verified.")
        
        # 5. SIMULATION: Sell Fill Scenario (Take Profit)
        # Find the newly created Sell order (it should be the last one)
        new_sell = new_orders[-1]
        assert new_sell.side == 'sell', "Last order should be a counter-sell"
        
        trigger_sell_price = new_sell.price + 1.0
        logger.info(f"Step 6: Simulating Price Rise to {trigger_sell_price} (Target Sell @ {new_sell.price})...")
        
        await strategy._check_order_status_dual([new_sell], trigger_sell_price)
        
        db.refresh(new_sell)
        assert new_sell.status == 'filled', "❌ Counter-sell not filled!"
        logger.info("✅ Take Profit (Sell) verified.")
        
        # 6. VALIDATION: Financials
        db.refresh(bot_config)
        logger.info(f"Step 7: Validating Metrics...")
        logger.info(f"Paper Balance: {bot_config.paper_balance_current}")
        logger.info(f"Total Profit: {bot_config.total_profit}")
        logger.info(f"Cycles: {bot_config.current_cycle_count}")
        
        assert bot_config.total_profit > 0, "❌ Profit not recorded!"
        assert bot_config.current_cycle_count > 0, "❌ Cycle count not incremented!"
        
        logger.info("🏆 ALL SYSTEMS GREEN. VERIFICATION SUCCESSFUL.")
        
    except Exception as e:
        logger.error(f"❌ Verification Failed: {e}")
        import traceback
        traceback.print_exc()
    finally:
        # 7. TEARDOWN
        logger.info("🧹 Cleaning up DB...")
        try:
            db.query(GridOrder).filter(GridOrder.bot_id == bot_config.id).delete()
            db.delete(bot_config)
            db.delete(user)
            db.commit()
            logger.info("Cleanup complete.")
        except:
            pass
        db.close()

if __name__ == "__main__":
    asyncio.run(run_verification())
