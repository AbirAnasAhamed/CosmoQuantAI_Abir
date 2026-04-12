
import asyncio
import json
import logging
from app.services.block_trade_monitor import block_trade_monitor
from app.core.redis import redis_manager

logger = logging.getLogger(__name__)

class BlockTradeWorker:
    def __init__(self):
        self.running = False

    async def start(self):
        if self.running:
            logger.info("ℹ️ Block Trade Worker is already running.")
            return

        logger.info("🚀 Block Trade Worker Started")
        self.running = True
        
        # Ensure Redis is initialized
        if not redis_manager.redis:
             await redis_manager.init_redis()

        while self.running:
            try:
                # 1. Get Config
                config = block_trade_monitor.get_config()
                # Load symbols from config or use defaults
                target_symbols = config.get("target_symbols", ["BTC/USDT", "ETH/USDT", "SOL/USDT"])
                
                for symbol in target_symbols:
                    if not self.running: break
                    
                    # 2. Fetch Trades
                    trades_map = await block_trade_monitor.fetch_recent_trades(symbol, limit=50)
                    
                    for exchange_id, trades in trades_map.items():
                        new_trades = []
                        for trade in trades:
                            # Create a unique ID for deduplication
                            # Some exchanges provide ID, some don't. Fallback to timestamp+price+amount
                            id_val = trade.get('id')
                            if not id_val:
                                id_val = f"{trade['timestamp']}_{trade['price']}_{trade['amount']}"
                            
                            trade_id = f"bt:{exchange_id}:{symbol}:{id_val}"
                            
                            # Use Redis for deduplication (SET if Not Exists with 24h TTL)
                            is_new = await redis_manager.redis.set(trade_id, "1", ex=86400, nx=True)
                            
                            if is_new:
                                new_trades.append(trade)
                        
                        # 3. Publish New Block Trades
                        if new_trades:
                            logger.info(f"💎 Detected {len(new_trades)} new block trades on {exchange_id} for {symbol}")
                            
                            payload = {
                                "type": "block_trade",
                                "data": new_trades
                            }
                            
                            await redis_manager.redis.publish("block_trade_stream", json.dumps(payload))
                
                await asyncio.sleep(5)  # Poll interval

            except Exception as e:
                logger.error(f"Block Trade Worker Error: {e}")
                await asyncio.sleep(10) # Longer sleep on error

    async def stop(self):
        self.running = False
        logger.info("🛑 Block Trade Worker Stopped")

block_trade_worker = BlockTradeWorker()
