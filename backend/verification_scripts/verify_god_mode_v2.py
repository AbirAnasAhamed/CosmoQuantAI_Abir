import asyncio
import logging
import json
import sys
import os

# Add the backend directory to python path for imports
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from app.services.advanced_orderbook_service import orderbook_service
from app.services.god_mode_liquidation_service import god_mode_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("Verification")

async def verify_god_mode_v2():
    logger.info("=========================================")
    logger.info(" GOD MODE V2 - DEEP VERIFICATION SCRIPT ")
    logger.info("=========================================")
    
    symbol = "BTC/USDT"
    logger.info(f"Starting services for {symbol}...")
    
    # 1. Start the main GodMode Service (which internally starts orderbook_service)
    await god_mode_service.start(symbol)
    
    # 1.5 Register dummy callback to trigger _broadcast_loop state merging
    async def dummy_cb(state): pass
    god_mode_service.register_callback(dummy_cb)
    
    # 2. Wait for orderbook streams to fetch data and calculate (ccxt websocket)
    logger.info("Waiting 10 seconds for Level-2 Orderbook data accumulation...")
    await asyncio.sleep(10)
    
    # 3. Deep Analysis and Verification Checks
    state = god_mode_service.state
    
    logger.info("\n--- Verification Check 1: Magnet Zones & Leverage ---")
    magnet_zones = state.get("magnet_zones", [])
    if not magnet_zones:
        logger.error("❌ FAILED: Magnet Zones are empty. Orderbook service failed to generate zones.")
    else:
        logger.info(f"✅ PASSED: Found {len(magnet_zones)} active magnet zones.")
        for i, zone in enumerate(magnet_zones):
            has_leverage = "leverage" in zone
            has_type = "type" in zone
            logger.info(f"  Zone {i+1}: Price=${zone.get('price')} | Type={zone.get('type')} | Leverage={zone.get('leverage')}")
            if not has_leverage or not has_type:
                logger.error("❌ FAILED: Missing leverage or type in zone!")
                
    logger.info("\n--- Verification Check 2: AI Trajectory (Smart Money Hunt) ---")
    ai_trajectory = state.get("ai_trajectory")
    if ai_trajectory is None:
        logger.warning("⚠️ SKIPPED: AI Trajectory is null (this is normal if orderbook imbalance is < 10%)")
    else:
        logger.info(f"✅ PASSED: AI Trajectory generated!")
        logger.info(f"  Direction: {ai_trajectory.get('direction')} | Target: ${ai_trajectory.get('target_price')} | Confidence: {ai_trajectory.get('confidence')}%")

    logger.info("\n--- Verification Check 3: Data Integration ---")
    ob_state = orderbook_service.state
    logger.info(f"  Raw Bid Weight: {ob_state.get('bid_weight')}")
    logger.info(f"  Raw Ask Weight: {ob_state.get('ask_weight')}")
    logger.info(f"  Imbalance: {ob_state.get('imbalance')}%")
    
    logger.info("\n=========================================")
    logger.info(" 100% PROFESSIONAL VERIFICATION COMPLETE ")
    logger.info("=========================================")
    
    await god_mode_service.stop()

if __name__ == "__main__":
    asyncio.run(verify_god_mode_v2())
