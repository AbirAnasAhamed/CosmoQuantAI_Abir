import asyncio
import logging

logger = logging.getLogger(__name__)

class UTStandaloneListener:
    """
    A modular listener that monitors the bot's UTBotTracker.
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
        ut_entry_enabled = getattr(self.bot, 'enable_ut_entry_trigger', False)
        
        mode = "STANDALONE" if (not wall_enabled and not liq_enabled and ut_entry_enabled) else "CONFLUENCE FILTRATION"
        logger.info(f"🟢 [UT Bot] 💎 Listener active for {self.bot.symbol} (Mode: {mode})")
        
        last_processed_candle_time = None
        # Default checking interval if ut_bot_tracker is absent initially
        interval = 5.0
        
        while self.running and getattr(self.bot, 'running', False):
            try:
                # Refresh interval based on timeframe, fallback to 5
                tracker = getattr(self.bot, 'ut_bot_tracker', None)
                if tracker:
                    interval = tracker.check_interval
                
                # Check execution conditions: Wall & Liq must be OFF
                wall_enabled = getattr(self.bot, 'enable_wall_trigger', False)
                liq_enabled = getattr(self.bot, 'enable_liq_trigger', False)
                ut_entry_enabled = getattr(self.bot, 'enable_ut_entry_trigger', False)
                
                if not wall_enabled and not liq_enabled and ut_entry_enabled and tracker:
                    # Target Trade Direction based on strategy mode
                    target_trade_dir = "buy" if getattr(self.bot, 'strategy_mode', 'long') == 'long' else "sell"
                    
                    current_candle_time = tracker.last_candle_time
                    closed_candle_only = getattr(self.bot, 'ut_bot_candle_close', False)
                    validation_secs = getattr(self.bot, 'ut_bot_validation_secs', 0)
                    retest_enabled = getattr(self.bot, 'ut_bot_retest_snipe', False)
                    
                    if current_candle_time and current_candle_time != last_processed_candle_time:
                        if tracker.is_entry_signal(target_trade_dir, closed_candle_only=closed_candle_only):
                            
                            # (1) SIGNAL SUSTAIN VALIDATION (TIMEOUT)
                            if not closed_candle_only and validation_secs > 0:
                                self.bot.logger.info(f"⏳ [UT Standalone] Signal detected. Waiting {validation_secs}s to validate sustain...")
                                await asyncio.sleep(validation_secs)
                                # Re-check if signal is STILL active after sleep
                                if not tracker.is_entry_signal(target_trade_dir, closed_candle_only=False):
                                    self.bot.logger.info(f"🚫 [UT Standalone] Fakeout protected! Signal vanished after {validation_secs}s.")
                                    # Skip execution, but wait to re-evaluate on next candle
                                    last_processed_candle_time = current_candle_time
                                    continue
                                else:
                                    self.bot.logger.info(f"✅ [UT Standalone] Signal sustained for {validation_secs}s. Proceeding...")

                            # Mark this exact candle as processed so we don't trigger multiple times
                            last_processed_candle_time = current_candle_time
                            
                            # Execute isolated standalone snipe!
                            try:
                                current_mid, best_bid, best_ask = await self._fetch_realtime_price()
                                if current_mid:
                                    override_type = None
                                    override_price = None
                                    
                                    # (2) RETEST SNIPE LOGIC
                                    if retest_enabled:
                                        sl_line = tracker.get_dynamic_trailing_sl(target_trade_dir)
                                        if sl_line and sl_line > 0:
                                            override_type = "limit"
                                            # Using a tiny buffer away from the exact line to ensure fills
                                            retest_buffer = 0.001 # 0.1% buffer
                                            if target_trade_dir == "buy":
                                                override_price = sl_line * (1 + retest_buffer)
                                                self.bot.logger.info(f"🎯 [UT Standalone] Retest Snipe (Long)! Limit targeting {override_price} (SL Line: {sl_line})")
                                            else:
                                                override_price = sl_line * (1 - retest_buffer)
                                                self.bot.logger.info(f"🎯 [UT Standalone] Retest Snipe (Short)! Limit targeting {override_price} (SL Line: {sl_line})")
                                    
                                    # Confluence Checks
                                    enable_st_trend = getattr(self.bot, 'enable_supertrend_trend_filter', False)
                                    if enable_st_trend and getattr(self.bot, 'supertrend_tracker', None):
                                        if not self.bot.supertrend_tracker.is_trend_aligned(target_trade_dir):
                                            self.bot.logger.info(f"🚫 [UT Standalone Conf] Snipe at {current_mid} rejected! Supertrend misaligned.")
                                            continue
                                            
                                    de_tracker = getattr(self.bot, 'dual_engine_tracker', None)
                                    if de_tracker and getattr(de_tracker, 'is_enabled', False):
                                        if not de_tracker.is_aligned(target_trade_dir):
                                            self.bot.logger.info(f"🚫 [UT Standalone Conf] Snipe at {current_mid} rejected! {de_tracker.get_metrics_string()}")
                                            continue

                                    self.bot.logger.info(
                                        f"💎 [UT Standalone] Exact {target_trade_dir.upper()} PineScript crossover detected (Closed: {closed_candle_only}). All filters ALIGNED! Executing Snipe!"
                                    )
                                    
                                    await self.bot.execute_snipe(
                                        wall_price=current_mid, 
                                        side=target_trade_dir, 
                                        current_mid_price=current_mid, 
                                        best_bid=best_bid, 
                                        best_ask=best_ask,
                                        override_order_type=override_type,
                                        override_limit_price=override_price
                                    )
                            except Exception as e:
                                self.bot.logger.error(f"Failed Standalone UT Snipe execution: {e}")
                                
            except Exception as e:
                logger.error(f"[UT Standalone] Loop error: {e}")
                
            await asyncio.sleep(interval)
            
    async def stop(self):
        self.running = False
        
    async def _fetch_realtime_price(self):
        """
        Since UT Bot tracker only processes K-lines, we must explicitly fetch the L2 Orderbook 
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
            logger.warning(f"[UT Standalone] Failed to fetch real-time spread: {e}")
            
        return None, None, None
