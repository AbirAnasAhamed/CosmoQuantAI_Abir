import asyncio
import logging
from sqlalchemy.orm import Session
from app.crud.crud_lead_lag import get_lead_lag_bot, create_trade_log
from app.schemas.lead_lag import LeadLagTradeLogCreate
from app.core.redis import redis_manager
import ccxt.async_support as ccxt
import time
import numpy as np

logger = logging.getLogger(__name__)

def calculate_ema(prices, period):
    if len(prices) < period:
        return None
    ema = np.zeros(len(prices))
    ema[0] = np.mean(prices[:period])
    multiplier = 2 / (period + 1)
    for i in range(1, len(prices)):
        ema[i] = (prices[i] - ema[i-1]) * multiplier + ema[i-1]
    return ema[-1]

class LeadLagEngine:
    def __init__(self, bot_id: int, db: Session):
        self.bot_id = bot_id
        self.db = db
        self.bot = get_lead_lag_bot(self.db, self.bot_id, user_id=None) # Assume user_id lookup handled beforehand if loaded again
    
    async def fetch_leader_data(self, exchange):
        # Fetch latest klines for leader pair
        try:
            klines = await exchange.fetch_ohlcv(self.bot.leader_pair, timeframe=self.bot.timeframe, limit=50)
            closes = [k[4] for k in klines]
            return closes
        except Exception as e:
            logger.error(f"Error fetching leader data: {e}")
            return []

    async def execute_trade(self, exchange, side: str, price: float):
        try:
            if self.bot.is_paper_trading:
                # Simulate execution
                order_id = f"sim_{int(time.time())}"
                qty = self.bot.trade_size / price
                # Update paper balance logic
                
                log = LeadLagTradeLogCreate(
                    bot_id=self.bot_id,
                    trigger_reason="EMA Crossover detected on Leader",
                    executed_pair=self.bot.target_pair,
                    side=side,
                    price=price,
                    quantity=qty,
                    pnl=None, # PNL handled later when closing
                    status="filled",
                    order_id=order_id
                )
                create_trade_log(self.db, log)
                logger.info(f"[SIMULATION] Lead-Lag executed {side} on {self.bot.target_pair} at {price}")
            else:
                # Real execution
                qty = self.bot.trade_size / price
                # We would fetch actual user keys using bot.api_key_id here
                # order = await exchange.create_market_order(self.bot.target_pair, side, qty)
                pass 
                
        except Exception as e:
            logger.error(f"LeadLag trade execution failed: {e}")

    async def run(self):
        logger.info(f"Starting LeadLag Engine for Bot ID {self.bot_id}")
        redis = redis_manager.get_redis()
        await redis.set(f"lead_lag_bot:status:{self.bot_id}", "running")
        
        # Verify bot exists before proceeding
        if not self.bot:
            logger.error(f"LeadLag Engine could not find Bot ID {self.bot_id} in database. Exiting.")
            await redis.delete(f"lead_lag_bot:status:{self.bot_id}")
            return

        exchange_class = getattr(ccxt, self.bot.exchange.lower())
        exchange = exchange_class({'enableRateLimit': True})
        
        last_action = None
        
        try:
            while True:
                # 1. Refresh Bot Status
                self.db.refresh(self.bot)
                if not self.bot.is_active:
                    break
                
                # 2. Fetch Leader Data
                closes = await self.fetch_leader_data(exchange)
                if len(closes) < 20: # wait for data
                    await asyncio.sleep(10)
                    continue
                
                # 3. Calculate Signals
                short_ema = calculate_ema(closes, 9)
                long_ema = calculate_ema(closes, 21)
                
                if short_ema and long_ema:
                    current_price = closes[-1]
                    
                    if short_ema > long_ema and last_action != 'buy':
                        # Bullish crossover
                        logger.info(f"Bullish crossover on {self.bot.leader_pair}. Executing BUY on {self.bot.target_pair}")
                        # Fetch target pair price and buy
                        target_ticker = await exchange.fetch_ticker(self.bot.target_pair)
                        await self.execute_trade(exchange, 'buy', target_ticker['last'])
                        last_action = 'buy'
                        
                    elif short_ema < long_ema and last_action != 'sell':
                        # Bearish crossover
                        logger.info(f"Bearish crossover on {self.bot.leader_pair}. Executing SELL on {self.bot.target_pair}")
                        target_ticker = await exchange.fetch_ticker(self.bot.target_pair)
                        await self.execute_trade(exchange, 'sell', target_ticker['last'])
                        last_action = 'sell'
                
                # 4. Sleep delay based on timeframe, or short poll
                await asyncio.sleep(15) 
                
        except asyncio.CancelledError:
            logger.info("Lead-Lag Engine Task was cancelled.")
        except Exception as e:
            logger.error(f"Lead-Lag Engine crashed: {e}")
        finally:
            await redis.delete(f"lead_lag_bot:status:{self.bot_id}")
            if self.bot:
                self.bot.is_active = False
                self.db.commit()
            await exchange.close()

async def run_lead_lag_bot(bot_id: int, db: Session):
    engine = LeadLagEngine(bot_id, db)
    await engine.run()
