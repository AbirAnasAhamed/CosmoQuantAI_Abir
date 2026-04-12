import asyncio
import logging

logger = logging.getLogger(__name__)

class SupertrendStandaloneListener:
    """
    A modular listener that monitors the bot's SupertrendTracker.
    Executes a Snipe ONLY when primary triggers (Wall/Liquidation) are DISABLED.
    """
    def __init__(self, bot_instance):
        self.bot = bot_instance
        self.running = False

    async def start(self):
        self.running = True
        
        # Determine mode for logging
        wall_enabled = getattr(self.bot, 'enable_wall_trigger', False)
        liq_enabled = getattr(self.bot, 'enable_liq_trigger', False)
        supertrend_entry_enabled = getattr(self.bot, 'enable_supertrend_entry_trigger', False)
        
        mode = "STANDALONE" if (not wall_enabled and not liq_enabled and supertrend_entry_enabled) else "CONFLUENCE FILTRATION"
        logger.info(f"🟢 [Supertrend] 💎 Listener active for {self.bot.symbol} (Mode: {mode})")
        
        last_processed_candle_time = None
        # Default checking interval if supertrend_tracker is absent initially
        interval = 5.0
        
        while self.running and getattr(self.bot, 'running', False):
            try:
                # Refresh interval based on timeframe, fallback to 5
                tracker = getattr(self.bot, 'supertrend_tracker', None)
                if tracker:
                    interval = tracker.check_interval
                
                # Check execution conditions: Wall & Liq must be OFF
                wall_enabled = getattr(self.bot, 'enable_wall_trigger', False)
                liq_enabled = getattr(self.bot, 'enable_liq_trigger', False)
                supertrend_entry_enabled = getattr(self.bot, 'enable_supertrend_entry_trigger', False)
                
                if not wall_enabled and not liq_enabled and supertrend_entry_enabled and tracker:
                    # Target Trade Direction based on strategy mode
                    target_trade_dir = "buy" if getattr(self.bot, 'strategy_mode', 'long') == 'long' else "sell"
                    
                    current_candle_time = tracker.last_candle_time
                    closed_candle_only = getattr(self.bot, 'supertrend_candle_close', False)
                    # We did not add validation_secs or retest_snipe for supertrend, matching frontend
                    
                    if current_candle_time and current_candle_time != last_processed_candle_time:
                        if tracker.is_entry_signal(target_trade_dir, closed_candle_only=closed_candle_only):

                            # Mark this exact candle as processed so we don't trigger multiple times
                            last_processed_candle_time = current_candle_time
                            
                            # Execute isolated standalone snipe!
                            try:
                                current_mid, best_bid, best_ask = await self._fetch_realtime_price()
                                if current_mid:
                                    
                                    # Confuence Checks
                                    enable_ut_trend = getattr(self.bot, 'enable_ut_trend_filter', False)
                                    if enable_ut_trend and getattr(self.bot, 'ut_bot_tracker', None):
                                        if not self.bot.ut_bot_tracker.is_trend_aligned(target_trade_dir):
                                            self.bot.logger.info(f"🚫 [Supertrend Standalone Conf] Snipe at {current_mid} rejected! UT Bot trend misaligned.")
                                            continue
                                            
                                    de_tracker = getattr(self.bot, 'dual_engine_tracker', None)
                                    if de_tracker and getattr(de_tracker, 'is_enabled', False):
                                        if not de_tracker.is_aligned(target_trade_dir):
                                            self.bot.logger.info(f"🚫 [Supertrend Standalone Conf] Snipe at {current_mid} rejected! {de_tracker.get_metrics_string()}")
                                            continue

                                    self.bot.logger.info(
                                        f"💎 [Supertrend Standalone] Exact {target_trade_dir.upper()} PineScript crossover detected (Closed: {closed_candle_only}). All filters ALIGNED! Executing Snipe!"
                                    )
                                    
                                    await self.bot.execute_snipe(
                                        wall_price=current_mid, 
                                        side=target_trade_dir, 
                                        current_mid_price=current_mid, 
                                        best_bid=best_bid, 
                                        best_ask=best_ask
                                    )
                            except Exception as e:
                                self.bot.logger.error(f"Failed Standalone Supertrend Snipe execution: {e}")
                                
            except Exception as e:
                logger.error(f"[Supertrend Standalone] Loop error: {e}")
                
            await asyncio.sleep(interval)
            
    async def stop(self):
        self.running = False
        
    async def _fetch_realtime_price(self):
        """
        Since Supertrend tracker only processes K-lines, we must explicitly fetch the L2 Orderbook 
        just like the WallHunter main loop does, to get the absolute pinpoint price for execute_snipe.
        """
        try:
            from app.services.market_depth_service import market_depth_service
            limit = market_depth_service._normalize_order_book_limit(self.bot.exchange_id, 5)
            
            # Using the public_exchange instance to avoid API weight limits
            exchange = getattr(self.bot, 'public_exchange', self.bot.exchange)
            orderbook = await exchange.fetch_order_book(self.bot.symbol, limit=limit)
            
            if orderbook['bids'] and orderbook['asks']:
                best_bid = orderbook['bids'][0][0]
                best_ask = orderbook['asks'][0][0]
                mid_price = (best_bid + best_ask) / 2.0
                return mid_price, best_bid, best_ask
        except Exception as e:
            logger.warning(f"[Supertrend Standalone] Failed to fetch real-time spread: {e}")
            
        return None, None, None
