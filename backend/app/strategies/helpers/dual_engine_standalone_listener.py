import asyncio
import logging

logger = logging.getLogger(__name__)

class DualEngineStandaloneListener:
    """
    A modular listener that monitors the bot's DualEngineTracker.
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
        dual_engine_enabled = getattr(self.bot.dual_engine_tracker, 'is_enabled', False)
        
        mode = "STANDALONE" if (not wall_enabled and not liq_enabled and dual_engine_enabled) else "CONFLUENCE FILTRATION"
        logger.info(f"🟢 [Dual Engine] 🧠 Listener active for {self.bot.symbol} (Mode: {mode})")
        
        last_processed_signal_time = None
        interval = 5.0 # Check every 5 seconds
        
        while self.running and getattr(self.bot, 'running', False):
            try:
                # Check execution conditions: Wall & Liq must be OFF
                wall_enabled = getattr(self.bot, 'enable_wall_trigger', False)
                liq_enabled = getattr(self.bot, 'enable_liq_trigger', False)
                dual_engine_enabled = getattr(self.bot.dual_engine_tracker, 'is_enabled', False)
                
                tracker = getattr(self.bot, 'dual_engine_tracker', None)
                
                if not wall_enabled and not liq_enabled and dual_engine_enabled and tracker:
                    # Target Trade Direction based on strategy mode
                    target_trade_dir = getattr(self.bot, 'strategy_mode', 'long')
                    
                    # Fetch current signal from tracker
                    current_signal = tracker.current_state.get('signal', 'NEUTRAL')
                    signal_updated_time = tracker.current_state.get('last_updated', 0)
                    
                    if current_signal != 'NEUTRAL' and signal_updated_time != last_processed_signal_time:
                        
                        # Prevent double-entry: skip if a position is already open
                        if getattr(self.bot, 'active_pos', None):
                            await asyncio.sleep(interval)
                            continue
                        
                        # Validate the signal matches our intended trade direction
                        is_valid_signal = False
                        if target_trade_dir == 'long' and current_signal == 'BUY':
                            is_valid_signal = True
                        elif target_trade_dir == 'short' and current_signal == 'SELL':
                            is_valid_signal = True
                            
                        if is_valid_signal:
                            # Mark this exact timestamp as processed
                            last_processed_signal_time = signal_updated_time
                            
                            # Execute isolated standalone snipe!
                            try:
                                current_mid, best_bid, best_ask = await self._fetch_realtime_price()
                                if current_mid:
                                    # Confluence Checks
                                    enable_st_trend = getattr(self.bot, 'enable_supertrend_trend_filter', False)
                                    if enable_st_trend and getattr(self.bot, 'supertrend_tracker', None):
                                        if not self.bot.supertrend_tracker.is_trend_aligned(target_trade_dir):
                                            self.bot.logger.info(f"🚫 [Dual Engine Standalone Conf] Snipe at {current_mid} rejected! Supertrend misaligned.")
                                            continue
                                            
                                    enable_ut_trend = getattr(self.bot, 'enable_ut_trend_filter', False)
                                    if enable_ut_trend and getattr(self.bot, 'ut_bot_tracker', None):
                                        if not self.bot.ut_bot_tracker.is_trend_aligned(target_trade_dir):
                                            self.bot.logger.info(f"🚫 [Dual Engine Standalone Conf] Snipe at {current_mid} rejected! UT Bot trend misaligned.")
                                            continue

                                    self.bot.logger.info(
                                        f"💎 [Dual Engine Standalone] Insight Score crossed threshold! All filters ALIGNED! Executing {target_trade_dir.upper()} Snipe!"
                                    )
                                    
                                    await self.bot.execute_snipe(
                                        wall_price=current_mid, 
                                        side=target_trade_dir, 
                                        current_mid_price=current_mid, 
                                        best_bid=best_bid, 
                                        best_ask=best_ask
                                    )
                            except Exception as e:
                                self.bot.logger.error(f"Failed Standalone Dual Engine Snipe execution: {e}")
                                
            except Exception as e:
                logger.error(f"[Dual Engine Standalone] Loop error: {e}")
                
            await asyncio.sleep(interval)
            
    async def stop(self):
        self.running = False
        
    async def _fetch_realtime_price(self):
        """
        Since Dual Engine tracker only processes K-lines, we must explicitly fetch the L2 Orderbook 
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
            logger.warning(f"[Dual Engine Standalone] Failed to fetch real-time spread: {e}")
            
        return None, None, None
