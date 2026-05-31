import asyncio
import logging
import time
from typing import Dict, Any, List
import ccxt.async_support as ccxt
import ccxt.pro as ccxt_pro
import pandas as pd
import pandas_ta as ta
import json
from app.utils import get_redis_client
from app.strategies.order_block_bot import OrderBlockExecutionEngine

logger = logging.getLogger(__name__)

class CascadingBBLogger:
    def __init__(self, bot_id: int):
        self.bot_id = bot_id
        self._logger = logging.getLogger("CascadingBB_" + str(bot_id))

    def _push_redis(self, log_type: str, message: str):
        try:
            import datetime, json, redis
            from app.core.config import settings
            r = redis.from_url(settings.REDIS_URL, decode_responses=True)
            timestamp = datetime.datetime.now().strftime("%H:%M:%S")
            log_entry = {"time": timestamp, "type": log_type, "message": str(message)}
            stream_payload = {"channel": f"logs_{self.bot_id}", "data": log_entry}
            r.publish("bot_logs", json.dumps(stream_payload))
            r.publish(f"bot_logs:{self.bot_id}", json.dumps(log_entry))
            list_key = f"bot_logs_list:{self.bot_id}"
            r.rpush(list_key, json.dumps(log_entry))
            r.ltrim(list_key, -50, -1)
        except Exception:
            pass

    def info(self, msg, *args, **kwargs):
        self._logger.info(msg, *args, **kwargs)
        self._push_redis("INFO", (str(msg) % args) if args else str(msg))

    def warning(self, msg, *args, **kwargs):
        self._logger.warning(msg, *args, **kwargs)
        self._push_redis("WARNING", (str(msg) % args) if args else str(msg))

    def error(self, msg, *args, **kwargs):
        self._logger.error(msg, *args, **kwargs)
        self._push_redis("ERROR", (str(msg) % args) if args else str(msg))


class CascadingBBBot:
    """
    Cascading Multi-Timeframe Bollinger Band Strategy.
    """
    def __init__(self, bot_id: int, config: Dict[str, Any], db_session=None, owner_id: int = None):
        self.bot_id = bot_id
        self.owner_id = owner_id
        self.config = config
        self.symbol = config.get("symbol", "DOGE/USDT")
        self.exchange_id = config.get("exchange", "binance").lower()
        self.is_paper_trading = config.get("is_paper_trading", True)
        self.logger = CascadingBBLogger(self.bot_id)

        # BB Parameters
        self.bb_length = config.get("bb_length", 20)
        self.bb_std = config.get("bb_std", 2.0)
        self.break_percentage = config.get("break_percentage", 0.5) # e.g. 0.5%
        self.tp_mode = config.get("cascading_tp_mode", "dynamic") # 'dynamic' or 'fixed'
        self.target_spread = config.get("target_spread", 0.0)
        self.strategy_mode = config.get("strategy_mode", "long")
        self.band_tolerance = config.get("band_tolerance", 0.1) # Proximity Buffer %
        self.risk_pct = config.get("risk_pct", 0.0) # Optional hard Stop Loss
        
        # Advanced Risk Management
        self.trailing_stop = config.get("trailing_stop", 0.0)
        self.tsl_activation_pct = config.get("tsl_activation_pct", 0.0)
        self.sl_breakeven_trigger_pct = config.get("sl_breakeven_trigger_pct", 0.0)
        self.sl_breakeven_target_pct = config.get("sl_breakeven_target_pct", 0.0)
        
        # Cascading Timeframes
        self.timeframes = ["1m", "3m", "5m", "15m", "30m", "1h", "4h", "1d", "1w", "1M"]
        self.current_tf_index = 0
        
        # Execution Engine
        self.engine = OrderBlockExecutionEngine(config, logger=self.logger, bot_id=self.bot_id)
        self.trade_amount = config.get("amount_per_trade", 10.0) # Assume 10 USDT or coins depending on setup
        
        self.running = False
        self._task = None
        self._exchange = None
        self._ws_exchange = None

    async def start(self, api_key_record=None):
        """Starts the bot."""
        self.running = True
        self.logger.info(f"🚀 Starting Cascading BB Bot for {self.symbol} on {self.exchange_id}")
        
        # Initialize Exchange
        exchange_class = getattr(ccxt, self.exchange_id)
        exchange_params = {'enableRateLimit': True}
        if api_key_record and not self.is_paper_trading:
            from app.core.security import decrypt_key
            exchange_params.update({
                'apiKey': decrypt_key(api_key_record.api_key),
                'secret': decrypt_key(api_key_record.api_secret),
            })
            if getattr(api_key_record, 'passphrase', None):
                exchange_params['password'] = decrypt_key(api_key_record.passphrase)
                
        self._exchange = exchange_class(exchange_params)
        self.engine.exchange = self._exchange
        
        # Initialize WebSocket Exchange
        ws_exchange_class = getattr(ccxt_pro, self.exchange_id)
        self._ws_exchange = ws_exchange_class({'enableRateLimit': False})
        
        self._task = asyncio.create_task(self._run_loop())

    async def stop(self):
        """Stops the bot."""
        self.running = False
        self.logger.info(f"🛑 Stopping Cascading BB Bot {self.bot_id}")
        if self._task:
            self._task.cancel()
        if self._exchange:
            await self._exchange.close()
        if self._ws_exchange:
            await self._ws_exchange.close()
        self.logger.info(f"🔴 Cascading BB Bot {self.bot_id} stopped.")

    async def _fetch_bb_data(self, timeframe: str) -> Dict[str, float]:
        """Fetches OHLCV and calculates BB for the given timeframe."""
        try:
            ohlcv = await self._exchange.fetch_ohlcv(self.symbol, timeframe, limit=self.bb_length + 5)
            if not ohlcv or len(ohlcv) < self.bb_length:
                return None
                
            df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
            
            # Calculate BB
            bb = ta.bbands(df['close'], length=self.bb_length, std=self.bb_std)
            if bb is None or bb.empty:
                return None
                
            last_row = bb.iloc[-1]
            
            # The column names generated by pandas_ta depend on length and std, e.g. BBL_20_2.0, BBU_20_2.0
            col_lower = f"BBL_{self.bb_length}_{self.bb_std}"
            col_upper = f"BBU_{self.bb_length}_{self.bb_std}"
            
            # Fallback if names are slightly different
            lower_val = last_row.get(col_lower, last_row.iloc[0])
            mid_val = last_row.get(f"BBM_{self.bb_length}_{self.bb_std}", last_row.iloc[1])
            upper_val = last_row.get(col_upper, last_row.iloc[2])
            
            return {
                "lower": lower_val,
                "middle": mid_val,
                "upper": upper_val,
                "close": df['close'].iloc[-1]
            }
        except Exception as e:
            self.logger.warning(f"Failed to fetch data for TF {timeframe}: {e}")
            return None

    def _publish_status(self, price: float, upper_band: float, middle_band: float, lower_band: float):
        try:
            pnl_pct = 0.0
            pos = self.engine.active_position
            
            entry_price = 0.0
            sl_price = 0.0
            tp_price = 0.0
            side = None
            
            if pos:
                entry_price = pos.get('entry_price', 0)
                side = pos.get('side', 'buy').lower()
                is_long = side in ['buy', 'long']
                
                # Calculate PnL
                if entry_price > 0:
                    if is_long:
                        pnl_pct = ((price - entry_price) / entry_price) * 100
                    else:
                        pnl_pct = ((entry_price - price) / entry_price) * 100
                        
                # Calculate current SL
                if pos.get('tsl_active'):
                    if is_long:
                        sl_price = pos.get('highest_price', entry_price) * (1 - (self.trailing_stop / 100))
                    else:
                        sl_price = pos.get('lowest_price', entry_price) * (1 + (self.trailing_stop / 100))
                elif pos.get('breakeven_active'):
                    if is_long:
                        sl_price = entry_price * (1 + (self.sl_breakeven_target_pct / 100))
                    else:
                        sl_price = entry_price * (1 - (self.sl_breakeven_target_pct / 100))
                elif self.risk_pct > 0:
                    if is_long:
                        sl_price = entry_price * (1 - (self.risk_pct / 100))
                    else:
                        sl_price = entry_price * (1 + (self.risk_pct / 100))
                        
                # Calculate current TP
                if is_long:
                    if self.tp_mode == "dynamic": tp_price = upper_band
                    elif self.tp_mode == "middle": tp_price = middle_band
                    elif self.tp_mode == "fixed": tp_price = entry_price + self.target_spread
                else:
                    if self.tp_mode == "dynamic": tp_price = lower_band
                    elif self.tp_mode == "middle": tp_price = middle_band
                    elif self.tp_mode == "fixed": tp_price = entry_price - self.target_spread

            status_payload = {
                "id": self.bot_id,
                "status": "active" if self.running else "inactive",
                "pnl": round(pnl_pct, 2),
                "pnl_percent": round(pnl_pct, 2),
                "price": price,
                "position": pos is not None,
                "entry_price": entry_price,
                "sl_price": sl_price,
                "tp_price": tp_price,
                "trading_mode": self.engine.trading_mode,
                "side": side
            }
            redis_client = get_redis_client()
            redis_client.publish(f"bot_status:{self.bot_id}", json.dumps(status_payload))
        except Exception:
            pass

    async def _run_loop(self):
        self.last_bb_fetch = 0
        self.cached_bb_data = None
        
        try:
            while self.running:
                current_tf = self.timeframes[self.current_tf_index]
                
                # 1. Fetch Bollinger Bands (Every 10 seconds to save API limits)
                current_time = time.time()
                if not self.cached_bb_data or (current_time - self.last_bb_fetch) >= 10:
                    self.logger.info(f"🔍 Monitoring timeframe: {current_tf} (Updating BB)")
                    bb_data = await self._fetch_bb_data(current_tf)
                    if bb_data:
                        self.cached_bb_data = bb_data
                        self.last_bb_fetch = current_time
                        
                if not self.cached_bb_data:
                    await asyncio.sleep(1)
                    continue
                    
                # 2. Fetch Live Price via WebSocket (Instant execution)
                try:
                    ticker = await self._ws_exchange.watch_ticker(self.symbol)
                    price = ticker['last']
                except Exception as e:
                    self.logger.warning(f"Failed to watch live price via WS: {e}")
                    await asyncio.sleep(1)
                    continue
                    
                lower_band = self.cached_bb_data['lower']
                middle_band = self.cached_bb_data['middle']
                upper_band = self.cached_bb_data['upper']
                
                # Publish status for frontend charts
                self._publish_status(price, upper_band, middle_band, lower_band)
                
                # Check Break Conditions (Cascading Logic)
                # If price drops below lower band by break_percentage, the band is "broken"
                break_threshold_lower = lower_band * (1 - (self.break_percentage / 100))
                break_threshold_upper = upper_band * (1 + (self.break_percentage / 100))
                
                band_broken = False
                
                if self.strategy_mode in ["long", "auto"] and price < break_threshold_lower:
                    self.logger.warning(f"⚠️ {current_tf} Lower Band BROKEN! Price {price} < {break_threshold_lower:.4f} (Threshold)")
                    band_broken = True
                elif self.strategy_mode in ["short", "auto"] and price > break_threshold_upper:
                    self.logger.warning(f"⚠️ {current_tf} Upper Band BROKEN! Price {price} > {break_threshold_upper:.4f} (Threshold)")
                    band_broken = True
                    
                if band_broken:
                    if self.current_tf_index < len(self.timeframes) - 1:
                        self.current_tf_index += 1
                        next_tf = self.timeframes[self.current_tf_index]
                        self.logger.info(f"🔄 Cascading to next timeframe: {next_tf}")
                    else:
                        self.logger.warning(f"⚠️ Reached max timeframe {current_tf}. Cannot cascade further.")
                    
                    await asyncio.sleep(2)
                    continue # Skip trading, wait for next TF analysis

                # If band is NOT broken, check for normal BB hits (Entry Signals)
                if not self.engine.active_position:
                    buy_threshold = lower_band * (1 + (self.band_tolerance / 100))
                    sell_threshold = upper_band * (1 - (self.band_tolerance / 100))
                    
                    if self.strategy_mode in ["long", "auto"] and price <= buy_threshold:
                        self.logger.info(f"📈 Long Entry Signal on {current_tf}! Price {price} hit LB zone {buy_threshold:.4f} (Actual LB: {lower_band:.4f})")
                        trade = await self.engine.execute_trade("buy", self.trade_amount, price)
                        if trade:
                            self.logger.info(f"✅ Executed LONG BUY at {price}")
                    elif self.strategy_mode in ["short", "auto"] and price >= sell_threshold:
                        self.logger.info(f"📉 Short Entry Signal on {current_tf}! Price {price} hit UB zone {sell_threshold:.4f} (Actual UB: {upper_band:.4f})")
                        trade = await self.engine.execute_trade("sell", self.trade_amount, price)
                        if trade:
                            self.logger.info(f"✅ Executed SHORT SELL at {price}")
                
                # Exit Logic (TP & SL)
                if self.engine.active_position:
                    exit_triggered = False
                    reason = ""
                    pos = self.engine.active_position
                    entry_price = pos['entry_price']
                    is_long = pos.get('side', 'buy').lower() in ['buy', 'long']
                    is_reverse_prevented = False # If true, skip ping-pong reverse
                    
                    # Track Highest/Lowest for TSL
                    if 'highest_price' not in pos: pos['highest_price'] = price
                    if 'lowest_price' not in pos: pos['lowest_price'] = price
                    pos['highest_price'] = max(pos['highest_price'], price)
                    pos['lowest_price'] = min(pos['lowest_price'], price)
                    
                    profit_pct = ((price - entry_price) / entry_price * 100) if is_long else ((entry_price - price) / entry_price * 100)
                    
                    # 1. Check Risk Stop Loss
                    if self.risk_pct > 0:
                        if is_long and price <= entry_price * (1 - (self.risk_pct / 100)):
                            exit_triggered = True
                            is_reverse_prevented = True
                            reason = f"hit Risk Stop Loss (Long SL: {entry_price * (1 - (self.risk_pct / 100)):.4f})"
                        elif not is_long and price >= entry_price * (1 + (self.risk_pct / 100)):
                            exit_triggered = True
                            is_reverse_prevented = True
                            reason = f"hit Risk Stop Loss (Short SL: {entry_price * (1 + (self.risk_pct / 100)):.4f})"

                    # 2. Check Breakeven SL
                    if not exit_triggered and self.sl_breakeven_trigger_pct > 0:
                        if 'breakeven_active' not in pos and profit_pct >= self.sl_breakeven_trigger_pct:
                            pos['breakeven_active'] = True
                            self.logger.info(f"🛡️ Breakeven SL Activated! Profit reached {profit_pct:.2f}% >= {self.sl_breakeven_trigger_pct}%")
                            
                        if pos.get('breakeven_active'):
                            be_price = entry_price * (1 + (self.sl_breakeven_target_pct / 100)) if is_long else entry_price * (1 - (self.sl_breakeven_target_pct / 100))
                            if (is_long and price <= be_price) or (not is_long and price >= be_price):
                                exit_triggered = True
                                is_reverse_prevented = True
                                reason = f"hit Breakeven Stop Loss at {be_price:.4f}"

                    # 3. Check Trailing Stop Loss (TSL)
                    if not exit_triggered and self.trailing_stop > 0 and self.tsl_activation_pct > 0:
                        if 'tsl_active' not in pos and profit_pct >= self.tsl_activation_pct:
                            pos['tsl_active'] = True
                            self.logger.info(f"🚀 TSL Activated! Profit reached {profit_pct:.2f}% >= {self.tsl_activation_pct}%. Trailing by {self.trailing_stop}%")
                            
                        if pos.get('tsl_active'):
                            if is_long:
                                tsl_price = pos['highest_price'] * (1 - (self.trailing_stop / 100))
                                if price <= tsl_price:
                                    exit_triggered = True
                                    is_reverse_prevented = True
                                    reason = f"hit Trailing Stop Loss (Dropped {self.trailing_stop}% from High {pos['highest_price']:.4f})"
                            else:
                                tsl_price = pos['lowest_price'] * (1 + (self.trailing_stop / 100))
                                if price >= tsl_price:
                                    exit_triggered = True
                                    is_reverse_prevented = True
                                    reason = f"hit Trailing Stop Loss (Rose {self.trailing_stop}% from Low {pos['lowest_price']:.4f})"

                    # 4. Standard BB Take Profit (Only if TSL is NOT actively trailing)
                    if not exit_triggered and not pos.get('tsl_active'):
                        if is_long:
                            if self.tp_mode == "dynamic":
                                tp_threshold = upper_band * (1 - (self.band_tolerance / 100))
                                if price >= tp_threshold:
                                    exit_triggered = True
                                    reason = f"hit Upper Band zone {tp_threshold:.4f} (Actual UB: {upper_band:.4f})"
                            elif self.tp_mode == "middle":
                                tp_threshold = middle_band * (1 - (self.band_tolerance / 100))
                                if price >= tp_threshold:
                                    exit_triggered = True
                                    reason = f"hit Middle Band zone {tp_threshold:.4f} (Actual MB: {middle_band:.4f})"
                            elif self.tp_mode == "fixed":
                                tp_price = entry_price + self.target_spread
                                if price >= tp_price:
                                    exit_triggered = True
                                    reason = f"hit Fixed Target Spread {tp_price:.4f}"
                        else: # short
                            if self.tp_mode == "dynamic":
                                tp_threshold = lower_band * (1 + (self.band_tolerance / 100))
                                if price <= tp_threshold:
                                    exit_triggered = True
                                    reason = f"hit Lower Band zone {tp_threshold:.4f} (Actual LB: {lower_band:.4f})"
                            elif self.tp_mode == "middle":
                                tp_threshold = middle_band * (1 + (self.band_tolerance / 100))
                                if price <= tp_threshold:
                                    exit_triggered = True
                                    reason = f"hit Middle Band zone {tp_threshold:.4f} (Actual MB: {middle_band:.4f})"
                            elif self.tp_mode == "fixed":
                                tp_price = entry_price - self.target_spread
                                if price <= tp_price:
                                    exit_triggered = True
                                    reason = f"hit Fixed Target Spread {tp_price:.4f}"
                                    
                    if exit_triggered:
                        self.logger.info(f"🎯 Exit Signal on {current_tf}! Price {price} {reason}")
                        exit_side = "sell" if is_long else "buy"
                        trade = await self.engine.execute_trade(exit_side, self.engine.active_position['amount'], price)
                        if trade:
                            self.logger.info(f"✅ Executed {exit_side.upper()} to close position at {price}")
                            self.logger.info(f"🔄 Resetting cascading timeframe to base ({self.timeframes[0]}) after successful trade.")
                            self.current_tf_index = 0
                            
                            # Auto Ping-Pong Reverse Entry
                            if self.strategy_mode == "auto":
                                if is_reverse_prevented:
                                    self.logger.info(f"🛑 Ping-Pong reversal SKIPPED because trade exited via Stop Loss / TSL.")
                                else:
                                    self.logger.info(f"🏓 Ping-Pong: Automatically opening reverse position at {price}")
                                    reverse_side = "sell" if is_long else "buy" # if we were long, we just sold, so open short!
                                    reverse_trade = await self.engine.execute_trade(reverse_side, self.trade_amount, price)
                                    if reverse_trade:
                                        self.logger.info(f"✅ Executed REVERSE {reverse_side.upper()} at {price}")
                
                # We no longer need asyncio.sleep() because watch_ticker inherently blocks until a new tick arrives!
                
        except asyncio.CancelledError:
            pass
        except Exception as e:
            self.logger.error(f"CascadingBB Task crashed: {e}")

    async def emergency_sell(self, sell_type: str = "market"):
        """Emergency closes the active position via API call."""
        if not self.engine.active_position:
            self.logger.info(f"No active position to emergency sell for bot {self.bot_id}")
            return
            
        pos = self.engine.active_position
        side = pos.get('side', 'buy').lower()
        is_long = side in ['buy', 'long']
        amount = pos['amount']
        
        # Try to get a recent price for logging
        try:
            ticker = await self._exchange.fetch_ticker(self.symbol)
            current_price = ticker['last']
        except Exception:
            current_price = pos['entry_price']
            
        exit_side = "sell" if is_long else "buy"
        
        self.logger.info(f"🚨 [EMERGENCY] Closing {side.upper()} position for bot {self.bot_id} via {sell_type.upper()}")
        
        res = await self.engine.execute_trade(exit_side, amount, current_price, order_type="market", params={'reduceOnly': True})
        if res:
            self.engine.active_position = None
            self.logger.info(f"✅ Emergency exit completed.")
            self._publish_status(current_price, 0, 0, 0)
