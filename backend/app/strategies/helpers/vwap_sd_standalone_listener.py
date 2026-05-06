import asyncio
import time
from datetime import datetime, timezone
import ccxt.pro as ccxt_pro
import ccxt

class VWAPSDStandaloneListener:
    def __init__(self, bot_instance):
        self.bot = bot_instance
        self.running = False
        
    async def start(self):
        self.running = True
        self.bot.logger.info("🚀 [VWAP SD Snipe] Initializing Standalone Listener...")
        
        exchange_id = self.bot.exchange_id
        if exchange_id == 'kucoin':
            exchange_id = 'kucoinfutures'
            
        exchange_class = getattr(ccxt_pro, exchange_id, getattr(ccxt, exchange_id, None))
        if not exchange_class:
            self.bot.logger.error(f"[VWAP SD Snipe] Unsupported exchange: {exchange_id}")
            return
            
        exchange = exchange_class({'enableRateLimit': True})
        
        try:
            # First, fetch historical data for the current day to seed the VWAP correctly
            # Default to 1m for precision
            timeframe = '1m'
            limit = 1440 # 24 hours of 1m candles
            
            self.bot.logger.info(f"⏳ [VWAP SD Snipe] Seeding tracker with last {limit} candles...")
            try:
                ohlcvs = await exchange.fetch_ohlcv(self.bot.symbol, timeframe, limit=limit)
                for candle in ohlcvs:
                    timestamp = datetime.fromtimestamp(candle[0]/1000, tz=timezone.utc)
                    typical_price = (candle[2] + candle[3] + candle[4]) / 3
                    volume = candle[5]
                    self.bot.vwap_sd_tracker.update(typical_price, volume, timestamp)
                self.bot.logger.info(f"✅ [VWAP SD Snipe] Seeding complete! Current VWAP: {self.bot.vwap_sd_tracker.vwap:.4f}, 3rd SD: {self.bot.vwap_sd_tracker.bands['upper3']:.4f} / {self.bot.vwap_sd_tracker.bands['lower3']:.4f}")
            except Exception as e:
                self.bot.logger.warning(f"[VWAP SD Snipe] Failed to seed historical data: {e}")

            # Now watch live trades or klines to update incrementally
            while self.running and self.bot.running:
                try:
                    # Using watch_trades for tick-level precision VWAP
                    trades = await exchange.watch_trades(self.bot.symbol)
                    for t in trades:
                        price = t['price']
                        vol = t['amount']
                        ts = datetime.fromtimestamp(t['timestamp']/1000, tz=timezone.utc)
                        self.bot.vwap_sd_tracker.update(price, vol, ts)
                        
                    # Every time we update, check for Confluence if we don't have an active position
                    if not self.bot.active_pos:
                        await self._check_confluence(price)
                        
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    self.bot.logger.error(f"[VWAP SD Snipe] WS Error: {e}")
                    await asyncio.sleep(2)
                    
        except Exception as e:
            self.bot.logger.error(f"[VWAP SD Snipe] Main loop error: {e}")
        finally:
            self.running = False
            await exchange.close()
            
    async def _check_confluence(self, current_price):
        tracker = self.bot.vwap_sd_tracker
        upper3 = tracker.bands['upper3']
        lower3 = tracker.bands['lower3']
        
        # We need standard deviation to be properly expanded before trusting it
        if tracker.std_dev < (current_price * 0.001): # At least 0.1% volatility
            return
            
        target_side = None
        
        if current_price >= upper3:
            # Overbought Extreme -> Look for Sell Limit Wall
            if self.bot.direction in ['short', 'auto']:
                target_side = 'sell'
        elif current_price <= lower3:
            # Oversold Extreme -> Look for Buy Limit Wall
            if self.bot.direction in ['long', 'auto']:
                target_side = 'buy'
                
        if not target_side:
            return
            
        # Confluence Check: Check the Heatmap Orderbook for a Wall
        try:
            from app.services.market_depth_service import market_depth_service
            
            # Fetch native orderbook locally if possible or via the bot's stored native price
            exchange_target = self.bot.proxy_exchange if self.bot.enable_proxy_wall else self.bot.exchange_id
            sym_target = self.bot.proxy_symbol if self.bot.enable_proxy_wall and self.bot.proxy_symbol else self.bot.symbol
            
            limit = market_depth_service._normalize_order_book_limit(exchange_target, 50)
            target_exchange = getattr(self.bot, 'proxy_public_exchange', self.bot.public_exchange)
            
            ob = await target_exchange.fetch_order_book(sym_target, limit=limit)
            
            if not ob['bids'] or not ob['asks']:
                return
                
            walls = market_depth_service.detect_walls(ob, target_side, self.bot.vwap_sd_min_wall)
            if not walls:
                return
                
            # Check if any detected wall is close to our current extreme price
            for wall in walls:
                wall_price = wall['price']
                distance = abs(wall_price - current_price) / current_price
                if distance <= (self.bot.max_wall_distance_pct / 100):
                    # CONFLUENCE ACHIEVED! 3rd SD + Limit Wall!
                    self.bot.logger.info(f"🎯 [VWAP SD Snipe] CONFLUENCE TRIGGER! Price {current_price} hit 3rd SD + Limit Wall found at {wall_price} ({wall['total_usd']:,.0f} USD).")
                    
                    # Execute
                    best_bid = ob['bids'][0][0]
                    best_ask = ob['asks'][0][0]
                    mid = (best_bid + best_ask) / 2
                    
                    if self.bot.enable_proxy_wall:
                        # If using proxy, execute on native
                        await self.bot.execute_snipe(wall_price, target_side, getattr(self.bot, 'current_native_price', mid), None, None)
                    else:
                        await self.bot.execute_snipe(wall_price, target_side, mid, best_bid, best_ask)
                        
                    # Sleep to prevent rapid fires
                    await asyncio.sleep(10)
                    return
                    
        except Exception as e:
            self.bot.logger.warning(f"[VWAP SD Snipe] Error checking confluence: {e}")
