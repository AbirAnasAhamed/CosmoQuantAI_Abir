import asyncio
import logging
import time
from typing import Dict, Any, List
import ccxt.async_support as ccxt
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
        
        # Cascading Timeframes
        self.timeframes = ["1m", "3m", "5m", "15m", "30m", "1h", "4h", "1d", "1w", "1M"]
        self.current_tf_index = 0
        
        # Execution Engine
        self.engine = OrderBlockExecutionEngine(config, logger=self.logger, bot_id=self.bot_id)
        self.trade_amount = config.get("amount_per_trade", 10.0) # Assume 10 USDT or coins depending on setup
        
        self.running = False
        self._task = None
        self._exchange = None

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
        
        self._task = asyncio.create_task(self._run_loop())

    async def stop(self):
        """Stops the bot."""
        self.running = False
        if self._task:
            self._task.cancel()
        if self._exchange:
            await self._exchange.close()
        self.logger.info(f"🛑 Cascading BB Bot {self.bot_id} stopped.")

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

    async def _run_loop(self):
        try:
            while self.running:
                current_tf = self.timeframes[self.current_tf_index]
                self.logger.info(f"🔍 Monitoring timeframe: {current_tf}")
                
                bb_data = await self._fetch_bb_data(current_tf)
                if not bb_data:
                    await asyncio.sleep(5)
                    continue
                    
                price = bb_data['close']
                lower_band = bb_data['lower']
                middle_band = bb_data['middle']
                upper_band = bb_data['upper']
                
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
                    entry_price = self.engine.active_position['entry_price']
                    is_long = self.engine.active_position.get('side', 'buy') == 'buy'
                    
                    # 1. Check Risk Stop Loss (if enabled)
                    if self.risk_pct > 0:
                        if is_long:
                            sl_price = entry_price * (1 - (self.risk_pct / 100))
                            if price <= sl_price:
                                exit_triggered = True
                                reason = f"hit Risk Stop Loss (Long SL: {sl_price:.4f})"
                        else:
                            sl_price = entry_price * (1 + (self.risk_pct / 100))
                            if price >= sl_price:
                                exit_triggered = True
                                reason = f"hit Risk Stop Loss (Short SL: {sl_price:.4f})"

                    # 2. Check Take Profit (if SL not hit)
                    if not exit_triggered:
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
                                self.logger.info(f"🏓 Ping-Pong: Automatically opening reverse position at {price}")
                                reverse_side = "sell" if is_long else "buy" # if we were long, we just sold, so open short!
                                reverse_trade = await self.engine.execute_trade(reverse_side, self.trade_amount, price)
                                if reverse_trade:
                                    self.logger.info(f"✅ Executed REVERSE {reverse_side.upper()} at {price}")
                
                # Short delay before next poll
                await asyncio.sleep(5)
                
        except asyncio.CancelledError:
            pass
        except Exception as e:
            self.logger.error(f"CascadingBB Task crashed: {e}")
