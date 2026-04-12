import asyncio
import sys
import os
import logging
from unittest.mock import AsyncMock, MagicMock

# Ensure project root (/app) is in path
# Current file is in /app/scripts/
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.db.session import SessionLocal
from app.models.grid import GridBot, GridOrder
from app.models import User
from app.api.deps import get_db
from app.strategies.grid import GridTradingBot

# Configure Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("GridVerifier")

async def run_verification():
    logger.info("🧪 Starting Grid System Verification (Container Mode)...")
    
    db = SessionLocal()
    
    # 1. SETUP: Create Dummy Data
    try:
        # Check if user exists or create
        user = db.query(User).filter(User.email == "test_qa@example.com").first()
        if not user:
            logger.info("Step 1: Creating Dummy User...")
            user = User(email="test_qa@example.com", hashed_password="hashed_secret", is_active=True)
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
             logger.info("Step 1: Using existing Dummy User.")
        
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
        
        # Inject DB session to ensure objects are tracked in the same session
        strategy.db = db
        
        # Mock Exchange
        strategy.exchange = AsyncMock()
        strategy.redis = AsyncMock()
        
        # 3. SIMULATION: Initial Placement
        logger.info("Step 4: Simulating Start & Initial Orders...")
        current_price = 95000.0
        grids = strategy._calculate_grids(current_price)
        
        logger.info(f"Calculated {len(grids)} initial orders relative to price {current_price}")
        for g in grids:
             qty = 100.0 / g['price']
             await strategy._place_order_dual(g['type'], g['price'], qty)
             
        # Verify Orders in DB
        orders = db.query(GridOrder).filter(GridOrder.bot_id == bot_config.id).all()
        if len(orders) == 0:
             logger.error("❌ No orders persisted to DB!")
             # Maybe DB commit issue?
             return

        logger.info(f"✅ Verified {len(orders)} orders created in DB.")
        
        # 4. SIMULATION: Buy Fill Scenario
        buy_orders = [o for o in orders if o.side == 'buy']
        if not buy_orders:
            logger.error("No buy orders found to test!")
        else:
            target_buy = buy_orders[0]
            trigger_price = target_buy.price - 0.5 
            logger.info(f"Step 5: Simulating Price Drop to {trigger_price} (Target Buy @ {target_buy.price})...")
            
            await strategy._check_order_status_dual([target_buy], trigger_price)
            
            db.expire_all() # Refresh from DB
            target_buy = db.query(GridOrder).filter(GridOrder.id == target_buy.id).first()
            
            assert target_buy.status == 'filled', f"❌ Order {target_buy.id} status is {target_buy.status}, expected 'filled'"
            logger.info(f"✅ Order {target_buy.id} marked FILLED.")
            
            # Check for Count-Sell Order
            new_orders_query = db.query(GridOrder).filter(GridOrder.bot_id == bot_config.id).order_by(GridOrder.id.asc()).all()
            if len(new_orders_query) > len(orders):
                 logger.info("✅ Counter-Sell order creation verified.")
                 new_sell = new_orders_query[-1]
                 
                 # 5. SIMULATION: Sell Fill
                 trigger_sell_price = new_sell.price + 0.5
                 logger.info(f"Step 6: Simulating Price Rise to {trigger_sell_price} (Target Sell @ {new_sell.price})...")
                 await strategy._check_order_status_dual([new_sell], trigger_sell_price)
                 
                 db.refresh(new_sell)
                 assert new_sell.status == 'filled', "❌ Counter-sell not filled!"
                 logger.info("✅ Take Profit (Sell) verified.")
            else:
                 logger.error("❌ Counter-order NOT created.")
        
        # 6. VALIDATION: Financials
        db.refresh(bot_config)
        logger.info(f"Step 7: Validating Metrics...")
        logger.info(f"Paper Balance: {bot_config.paper_balance_current}")
        logger.info(f"Total Profit: {bot_config.total_profit}")
        logger.info(f"Cycles: {bot_config.current_cycle_count}")
        
        assert bot_config.total_profit > 0, "❌ Profit not recorded!"
        
        logger.info("🏆 ALL SYSTEMS GREEN. VERIFICATION SUCCESSFUL.")
        
    except Exception as e:
        logger.error(f"❌ Verification Failed: {e}")
        import traceback
        traceback.print_exc()
    finally:
        # 7. TEARDOWN
        logger.info("🧹 Cleaning up DB...")
        try:
            if 'bot_config' in locals():
                db.query(GridOrder).filter(GridOrder.bot_id == bot_config.id).delete()
                db.delete(bot_config)
            if 'user' in locals():
                # Be careful deleting user if other things depend on it, 
                # but for test_qa user it is fine.
                db.delete(user)
            db.commit()
            logger.info("Cleanup complete.")
        except Exception as e:
            logger.error(f"Cleanup failed: {e}")
        db.close()

if __name__ == "__main__":
    asyncio.run(run_verification())
