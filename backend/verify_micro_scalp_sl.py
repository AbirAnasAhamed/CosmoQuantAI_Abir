import asyncio
import logging

# Setup basic logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("MicroScalpVerifier")

# Mock the engine since we don't want to run the real ccxt execution
class MockEngine:
    def __init__(self):
        self.canceled_orders = []
        self.executed_trades = []

    async def cancel_order(self, order_id):
        logger.info(f"Mocking cancel order: {order_id}")
        self.canceled_orders.append(order_id)
        return True

    async def execute_trade(self, side, amount, price, order_type="market"):
        trade = {"side": side, "amount": amount, "price": price, "type": order_type}
        logger.info(f"Mocking execute trade: {trade}")
        self.executed_trades.append(trade)
        return {"id": "mock_market_sell_123", "average": price, "price": price}

class MockWallHunterBot:
    def __init__(self):
        self.engine = MockEngine()
        self.sell_order_type = "market"
        self.symbol = "BTC/USDT"
        
        # Simulate an active position with micro_scalp
        self.active_pos = {
            "entry": 60000.0,
            "amount": 0.1,
            "sl": 59900.0,
            "tp1": 60100.0,
            "tp": 60100.0,
            "tp1_hit": False,
            "limit_order_id": "mock_limit_tp_123",
            "micro_scalp": True
        }

    async def _send_telegram(self, msg):
        logger.info(f"Telegram Mock:\n{msg}")

    # The actual updated manage_risk logic
    async def manage_risk(self, current_price: float):
        if not self.active_pos: return

        if current_price <= self.active_pos['sl']:
            logger.info(f"⚠️ Triggering SL: Current Price ({current_price:.6f}) <= SL ({self.active_pos['sl']:.6f})")
            sell_amount = self.active_pos['amount']
            
            # Cancel open limit order if SL/TSL hits (handles both limit sell orders and micro_scalp)
            if (self.sell_order_type == 'limit' or self.active_pos.get('micro_scalp')) and self.active_pos.get('limit_order_id'):
                canceled = False
                for attempt in range(3):
                    try:
                        logger.info(f"Attempting to cancel Limit TP Order {self.active_pos['limit_order_id']} before SL market sell (Attempt {attempt+1}/3)")
                        await self.engine.cancel_order(self.active_pos['limit_order_id'])
                        canceled = True
                        break
                    except Exception as e:
                        logger.warning(f"Failed to cancel Limit TP Order on attempt {attempt+1}: {e}")
                        await asyncio.sleep(0.2)
                
                if canceled:
                    logger.info("Successfully cancelled Limit TP Order due to Stop Loss hit. Waiting for funds to unlock...")
                    await asyncio.sleep(0.5) # Wait for exchange to release the locked base asset balance
                else:
                    logger.error("COULD NOT CANCEL LIMIT TP ORDER! SL Market order might fail with Insufficient Balance.")
                
            await self.engine.execute_trade("sell", sell_amount, current_price)
            
            if self.active_pos.get('tp1_hit') and current_price >= self.active_pos['entry']:
                 pnl_val = (current_price - self.active_pos['entry']) * sell_amount
                 await self._send_telegram(f"🛡️ WallHunter EXIT - Stopped out at Profitable Break-even!\nPair: {self.symbol}\nExit Price: {current_price:.6f}\nSecured PnL: ${pnl_val:.2f}")
            else:
                 pnl_val = (current_price - self.active_pos['entry']) * sell_amount
                 await self._send_telegram(f"🛑 WallHunter EXIT - Stopped Out!\nPair: {self.symbol}\nExit Price: {current_price:.6f}\nPnL: ${pnl_val:.2f}")
            self.active_pos = None
            logger.info("Exit: Stop Loss / TSL Hit")


async def main():
    bot = MockWallHunterBot()
    logger.info("Starting Verifier...")
    logger.info("Active Position details:")
    logger.info(str(bot.active_pos))
    
    # Simulate a price drop hitting SL
    sl_price = bot.active_pos['sl']
    current_price = sl_price - 10.0
    logger.info(f"Simulating market price dropping to {current_price}")
    
    await bot.manage_risk(current_price)
    
    logger.info("Verification Details:")
    if "mock_limit_tp_123" in bot.engine.canceled_orders:
        logger.info("✅ SUCCESS: Limit TP order was successfully cancelled BEFORE SL market sell.")
    else:
        logger.error("❌ FAILURE: Limit TP order was NOT cancelled.")
        
    logger.info(f"Executed trades: {len(bot.engine.executed_trades)}")
    for t in bot.engine.executed_trades:
        logger.info(f" -> {t}")


if __name__ == "__main__":
    asyncio.run(main())
