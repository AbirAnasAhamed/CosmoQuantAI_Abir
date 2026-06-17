import asyncio
import logging

logger = logging.getLogger(__name__)

class MLStandaloneListener:
    """
    A modular listener that monitors the ML L2 Predictor.
    Executes a Snipe ONLY when primary triggers (Wall/Liquidation) are DISABLED.
    Uses 'Open Position Check' to avoid spamming while allowing high-frequency scalping.
    """
    def __init__(self, bot_instance):
        self.bot = bot_instance
        self.running = False

    async def start(self):
        self.running = True
        
        # Determine mode for logging
        wall_enabled = getattr(self.bot, 'enable_wall_trigger', False)
        liq_enabled = getattr(self.bot, 'enable_liq_trigger', False)
        ml_enabled = getattr(self.bot, 'enable_ml_filter', False)
        
        mode = "STANDALONE" if (not wall_enabled and not liq_enabled and ml_enabled) else "CONFLUENCE FILTRATION"
        logger.info(f"🤖 [ML Filter] 💎 Listener active for {self.bot.symbol} (Mode: {mode})")
        
        interval = 2.0  # Check every 2 seconds for high-frequency scalping
        
        while self.running and getattr(self.bot, 'running', False):
            try:
                # Check execution conditions: Wall & Liq must be OFF, and ML must be ON
                wall_enabled = getattr(self.bot, 'enable_wall_trigger', False)
                liq_enabled = getattr(self.bot, 'enable_liq_trigger', False)
                ml_enabled = getattr(self.bot, 'enable_ml_filter', False)
                ml_predictor = getattr(self.bot, 'ml_predictor', None)
                
                if not wall_enabled and not liq_enabled and ml_enabled and ml_predictor:
                    
                    # Target Trade Direction based on strategy mode
                    target_trade_dir = "buy" if getattr(self.bot, 'strategy_mode', 'long') == 'long' else "sell"
                    
                    # High-Frequency Scalping Smart Check: Only proceed if there is NO open position
                    # Because ML models can continuously output True, this prevents spamming overlapping entries
                    # but allows an immediate new entry the second the previous trade takes profit.
                    # Fallback to checking active_pos if has_open_position is not updated (Futures uses active_pos logic too)
                    is_position_open = getattr(self.bot, 'has_open_position', False)
                    if not is_position_open and getattr(self.bot, 'active_pos', None) is not None:
                        # Some logic sets active_pos
                        is_position_open = True
                        
                    if is_position_open:
                        # Position already open. Skip ML evaluation to prevent spam.
                        pass
                    else:
                        current_mid, best_bid, best_ask, orderbook = await self._fetch_realtime_data()
                        if current_mid and orderbook:
                            # Evaluate ML Prediction
                            ml_mode = getattr(self.bot, 'ml_execution_mode', 'basic')
                            is_ai_valid = False
                            override_sl = None
                            override_tp = None
                            
                            if ml_mode == 'advanced':
                                advanced_setup = ml_predictor.predict_advanced(orderbook, current_mid, target_trade_dir, self.bot)
                                if advanced_setup and advanced_setup.get("is_valid", False):
                                    is_ai_valid = True
                                    override_sl = advanced_setup.get("sl_price")
                                    override_tp = advanced_setup.get("tp_price")
                                    self.bot.logger.info(f"🔮 [ML Advanced] Generated Setup: SL={override_sl}, TP={override_tp}, R:R={advanced_setup.get('rr_ratio')}")
                            else:
                                is_ai_valid = ml_predictor.predict(orderbook, current_mid, target_trade_dir)
                            
                            if is_ai_valid:
                                # Confluence Checks
                                enable_st_trend = getattr(self.bot, 'enable_supertrend_trend_filter', False)
                                if enable_st_trend and getattr(self.bot, 'supertrend_tracker', None):
                                    if not self.bot.supertrend_tracker.is_trend_aligned(target_trade_dir):
                                        self.bot.logger.info(f"🚫 [ML Standalone Conf] Snipe at {current_mid} rejected! Supertrend misaligned.")
                                        await asyncio.sleep(interval)
                                        continue
                                        
                                de_tracker = getattr(self.bot, 'dual_engine_tracker', None)
                                if de_tracker and getattr(de_tracker, 'is_enabled', False):
                                    if not de_tracker.is_aligned(target_trade_dir):
                                        self.bot.logger.info(f"🚫 [ML Standalone Conf] Snipe at {current_mid} rejected! {de_tracker.get_metrics_string()}")
                                        await asyncio.sleep(interval)
                                        continue

                                self.bot.logger.info(
                                    f"🤖 [ML Standalone] High-confidence L2 AI signal for {target_trade_dir.upper()} detected. All filters ALIGNED! Executing Autonomous Snipe!"
                                )
                                
                                await self.bot.execute_snipe(
                                    wall_price=current_mid, 
                                    side=target_trade_dir, 
                                    current_mid_price=current_mid, 
                                    best_bid=best_bid, 
                                    best_ask=best_ask,
                                    reason="AI Model Standalone Detection",
                                    override_sl_price=override_sl,
                                    override_tp_price=override_tp
                                )
                                
            except Exception as e:
                logger.error(f"[ML Standalone] Loop error: {e}")
                
            await asyncio.sleep(interval)
            
    async def stop(self):
        self.running = False
        
    async def _fetch_realtime_data(self):
        """
        Fetches the L2 Orderbook and calculates spread for the ML model.
        """
        try:
            from app.services.market_depth_service import market_depth_service
            limit = market_depth_service._normalize_order_book_limit(self.bot.exchange_id, 20)
            
            # Using the public_exchange instance to avoid API weight limits
            exchange = getattr(self.bot, 'public_exchange', getattr(self.bot, 'exchange', None))
            if not exchange:
                return None, None, None, None
                
            orderbook = await exchange.fetch_order_book(self.bot.symbol, limit=limit)
            
            if orderbook and 'bids' in orderbook and 'asks' in orderbook and orderbook['bids'] and orderbook['asks']:
                best_bid = orderbook['bids'][0][0]
                best_ask = orderbook['asks'][0][0]
                mid_price = (best_bid + best_ask) / 2.0
                return mid_price, best_bid, best_ask, orderbook
        except Exception as e:
            logger.warning(f"[ML Standalone] Failed to fetch real-time spread & orderbook: {e}")
            
        return None, None, None, None
