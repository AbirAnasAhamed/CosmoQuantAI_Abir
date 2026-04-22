import logging
import asyncio
import time
import json
import ccxt
import ccxt.pro as ccxt_pro
from app.utils import get_redis_client
from app.strategies.order_block_bot import OrderBlockExecutionEngine
from app.strategies.helpers.absorption_tracker import AbsorptionTracker
from app.strategies.helpers.iceberg_tracker import IcebergTracker
from app.strategies.helpers.trend_finder import AdaptiveTrendFinder
from app.strategies.helpers.ut_bot_tracker import UTBotTracker
from app.strategies.helpers.ut_standalone_listener import UTStandaloneListener
from app.strategies.helpers.supertrend_tracker import SupertrendTracker
from app.strategies.helpers.supertrend_standalone_listener import SupertrendStandaloneListener
from app.strategies.helpers.dual_engine_standalone_listener import DualEngineStandaloneListener
from app.strategies.helpers.dual_engine_analyzer import DualEngineTracker
from app.services.market_depth_service import market_depth_service
from app.strategies.helpers.trading_session_filter import TradingSessionTracker
from app.strategies.helpers.wick_sr_tracker import WickSRTracker
from app.strategies.helpers.wick_sr_standalone_listener import WickSRStandaloneListener
from app.strategies.helpers.fibo_tp_calculator import calculate_fibo_extension_tp

logger = logging.getLogger(__name__)

# ----------------------------------------------------
# 🛡️ CosmoQuant Institutional-Grade Shared Logging System
# ----------------------------------------------------
class WallHunterFuturesLogger:
    def __init__(self, bot_id: int):
        self.bot_id = bot_id
        import logging
        self._logger = logging.getLogger("WallHunterFutures" + str(bot_id))

    def _push_redis(self, log_type: str, message: str):
        try:
            import datetime, json, redis
            from app.core.config import settings
            r = redis.from_url(settings.REDIS_URL, decode_responses=True)
            timestamp = datetime.datetime.now().strftime("%H:%M:%S")
            log_entry = {"time": timestamp, "type": log_type, "message": str(message)}
            # Specific channel for THIS bot (WebSocket uses this)
            r.publish(f"bot_logs:{self.bot_id}", json.dumps(log_entry))
            # Persistent list for history
            list_key = f"bot_logs_list:{self.bot_id}"
            r.rpush(list_key, json.dumps(log_entry))
            r.ltrim(list_key, -50, -1)
        except Exception:
            pass

    def info(self, msg, *args, **kwargs):
        formatted_msg = (str(msg) % args) if args else str(msg)
        self._logger.info(formatted_msg, **kwargs)
        self._push_redis("INFO", formatted_msg)

    def warning(self, msg, *args, **kwargs):
        formatted_msg = (str(msg) % args) if args else str(msg)
        self._logger.warning(formatted_msg, **kwargs)
        self._push_redis("WARNING", formatted_msg)

    def error(self, msg, *args, **kwargs):
        formatted_msg = (str(msg) % args) if args else str(msg)
        self._logger.error(formatted_msg, **kwargs)
        self._push_redis("ERROR", formatted_msg)
        
    def debug(self, msg, *args, **kwargs):
        self._logger.debug(msg, *args, **kwargs)
# ----------------------------------------------------

class WallHunterFuturesStrategy:
    def __init__(self, bot_record, ccxt_service):
        self.bot_record = bot_record
        self.bot_id = bot_record.id
        self.owner_id = bot_record.owner_id
        self.exchange_service = ccxt_service
        self.config = bot_record.config or {}
        
        # ফিউচার কনফিগারেশন
        self.leverage = self.config.get('leverage', 10)
        self.margin_mode = self.config.get('margin_mode', 'cross')
        self.reduce_only = self.config.get('reduce_only', True)
        self.direction = self.config.get('position_direction', 'auto') # long, short, auto
        self.symbol = bot_record.market
        self.exchange_id = (bot_record.exchange or "binance").lower()
        self.is_paper_trading = bot_record.is_paper_trading
        
        # Initialize Custom Logger for Web Dashboard
        self.logger = WallHunterFuturesLogger(self.bot_id)
        
        # Strategy Params (Adapted from Spot Bot)
        self.vol_threshold = self.config.get("vol_threshold", 500000)
        self.target_spread = self.config.get("target_spread", 0.0002)
        self.initial_risk_pct = self.config.get("risk_pct", 0.5)
        self.tsl_pct = self.config.get("trailing_stop", 0.2)
        self.min_wall_lifetime = self.config.get("min_wall_lifetime", 3.0)
        self.max_wall_distance_pct = self.config.get("max_wall_distance_pct", 1.0)
        self.amount_per_trade = self.config.get("amount_per_trade", 10.0)
        self.buy_order_type = self.config.get("buy_order_type", "market")
        self.sell_order_type = self.config.get("sell_order_type", "market")
        self.sl_order_type = self.config.get("sl_order_type", "market")
        self.tsl_activation_pct = self.config.get("tsl_activation_pct", 0.0)
        
        # --- NEW FEATURES: Partial TP & Triggers ---
        self.partial_tp_pct = self.config.get("partial_tp_pct", 50.0)
        self.partial_tp_trigger_pct = self.config.get("partial_tp_trigger_pct", 0.0)
        self.sl_breakeven_trigger_pct = self.config.get("sl_breakeven_trigger_pct", 0.0)
        self.sl_breakeven_target_pct = self.config.get("sl_breakeven_target_pct", 0.0)
        
        self.vpvr_enabled = self.config.get("vpvr_enabled", False)
        self.vpvr_tolerance = self.config.get("vpvr_tolerance", 0.2)
        self.top_hvns = []
        
        self.atr_sl_enabled = self.config.get("atr_sl_enabled", False)
        self.atr_period = self.config.get("atr_period", 14)
        self.atr_multiplier = self.config.get("atr_multiplier", 2.0)
        self.current_atr = 0.0
        
        self.enable_wall_trigger = self.config.get("enable_wall_trigger", True)
        self.enable_liq_trigger = self.config.get("enable_liq_trigger", False)
        self.liq_threshold = self.config.get("liq_threshold", 50000.0)
        self.enable_micro_scalp = self.config.get("enable_micro_scalp", False)
        self.micro_scalp_profit_ticks = self.config.get("micro_scalp_profit_ticks", 2)
        self.micro_scalp_min_wall = self.config.get("micro_scalp_min_wall", 100000.0)
        self.enable_dynamic_atr_scalp = self.config.get("enable_dynamic_atr_scalp", False)
        self.micro_scalp_atr_multiplier = self.config.get("micro_scalp_atr_multiplier", 0.5)
        self.enable_oib_filter = self.config.get("enable_oib_filter", False)
        self.min_oib_threshold = self.config.get("min_oib_threshold", 0.4)
        
        from collections import deque
        self.liq_history = deque()
        self.liq_cascade_window = self.config.get("liq_cascade_window", 5)
        self.enable_liq_cascade = self.config.get("enable_liq_cascade", False)
        self.follow_btc_liq = self.config.get("follow_btc_liq", False)
        self.btc_liq_threshold = self.config.get("btc_liq_threshold", 500000.0)
        self.enable_dynamic_liq = self.config.get("enable_dynamic_liq", False)
        self.dynamic_liq_multiplier = self.config.get("dynamic_liq_multiplier", 1.0)
        
        # --- Tape Reading / Imbalance ---
        self.enable_ob_imbalance = self.config.get("enable_ob_imbalance", False)
        self.ob_imbalance_ratio = self.config.get("ob_imbalance_ratio", 1.5)
        self.liquidation_safety_pct = self.config.get("liquidation_safety_pct", 5.0)

        # --- Proxy Orderbook Routing (Lead-Lag) ---
        self.enable_proxy_wall = self.config.get("enable_proxy_wall", False)
        self.proxy_exchange = self.config.get("proxy_exchange", self.exchange_id)
        self.proxy_symbol = self.config.get("proxy_symbol", "")
        if self.enable_proxy_wall and self.proxy_symbol:
            ext_suffix = f" on {self.proxy_exchange.upper()}" if self.proxy_exchange != self.exchange_id else ""
            self.logger.info(f"Proxy Orderbook Routing Enabled! Tracking {self.proxy_symbol}{ext_suffix} for Trade Entry on {self.symbol}.")

        # --- CVD Absorption Trigger ---
        self.enable_absorption = self.config.get("enable_absorption", False)
        self.absorption_threshold = self.config.get("absorption_threshold", 50000.0)
        self.absorption_window = self.config.get("absorption_window", 10)
        self.absorption_tracker = AbsorptionTracker(
            threshold=self.absorption_threshold,
            window_seconds=self.absorption_window
        )
        
        # --- NEW FEATURES: Iceberg & Hidden Wall Trigger ---
        self.enable_iceberg_trigger = self.config.get("enable_iceberg_trigger", False)
        self.iceberg_time_window_secs = self.config.get("iceberg_time_window_secs", 10)
        self.iceberg_min_absorbed_vol = self.config.get("iceberg_min_absorbed_vol", 100000.0)
        self.iceberg_tracker = IcebergTracker(
            window_seconds=self.iceberg_time_window_secs,
            min_absorbed_vol=self.iceberg_min_absorbed_vol
        )
        
        # --- BRAND NEW: BTC Correlation Filter ---
        self.enable_btc_correlation = self.config.get("enable_btc_correlation", False)
        self.btc_correlation_threshold = self.config.get("btc_correlation_threshold", 0.7)
        self.btc_time_window = self.config.get("btc_time_window", 15)
        self.btc_min_move_pct = self.config.get("btc_min_move_pct", 0.1)
        self.btc_correlation_tracker = None
        
        # --- NEW: Adaptive Trend Filter ---
        self.enable_trend_filter = self.config.get("enable_trend_filter", False)
        self.trend_filter_lookback = self.config.get("trend_filter_lookback", 200)
        self.trend_filter_threshold = self.config.get("trend_filter_threshold", "Strong")
        self.trend_finder = AdaptiveTrendFinder(
            lookback=self.trend_filter_lookback, 
            threshold=self.trend_filter_threshold
        ) if self.enable_trend_filter else None
        
        # --- NEW: Modular UT Bot Alerts ---
        self.enable_ut_trend_filter = self.config.get("enable_ut_trend_filter", False)
        self.enable_ut_entry_trigger = self.config.get("enable_ut_entry_trigger", False)
        self.enable_ut_trailing_sl = self.config.get("enable_ut_trailing_sl", False)
        self.ut_bot_sensitivity = self.config.get("ut_bot_sensitivity", 1.0)
        self.ut_bot_atr_period = self.config.get("ut_bot_atr_period", 10)
        self.ut_bot_use_heikin_ashi = self.config.get("ut_bot_use_heikin_ashi", False)
        self.ut_bot_timeframe = self.config.get("ut_bot_timeframe", "5m")
        self.ut_bot_candle_close = self.config.get("ut_bot_candle_close", False)
        self.ut_bot_validation_secs = self.config.get("ut_bot_validation_secs", 0)
        self.ut_bot_retest_snipe = self.config.get("ut_bot_retest_snipe", False)
        self.ut_trend_unlock_mode = self.config.get("enable_ut_trend_unlock_mode", False)
        
        any_ut_enabled = self.enable_ut_trend_filter or self.enable_ut_entry_trigger or self.enable_ut_trailing_sl
        self.ut_bot_tracker = UTBotTracker(
            exchange_id=self.exchange_id,
            symbol=self.symbol,
            sensitivity=self.ut_bot_sensitivity,
            atr_period=self.ut_bot_atr_period,
            use_heikin_ashi=self.ut_bot_use_heikin_ashi,
            timeframe=self.ut_bot_timeframe
        ) if any_ut_enabled else None
        
        self.ut_standalone_listener = UTStandaloneListener(self)

        # --- NEW: Modular Supertrend Alerts ---
        self.enable_supertrend_trend_filter = self.config.get("enable_supertrend_trend_filter", False)
        self.enable_supertrend_entry_trigger = self.config.get("enable_supertrend_entry_trigger", False)
        self.enable_supertrend_trailing_sl = self.config.get("enable_supertrend_trailing_sl", False)
        self.supertrend_trend_unlock_mode = self.config.get("enable_supertrend_trend_unlock_mode", False)
        self.enable_supertrend_exit = self.config.get("enable_supertrend_exit", False)
        self.supertrend_exit_timeout = self.config.get("supertrend_exit_timeout", 5)
        self.supertrend_period = self.config.get("supertrend_period", 10)
        self.supertrend_multiplier = self.config.get("supertrend_multiplier", 3.0)
        self.supertrend_timeframe = self.config.get("supertrend_timeframe", "5m")
        self.supertrend_candle_close = self.config.get("supertrend_candle_close", False)
        
        any_supertrend_enabled = self.enable_supertrend_trend_filter or self.enable_supertrend_entry_trigger or self.enable_supertrend_trailing_sl or self.enable_supertrend_exit
        self.supertrend_tracker = SupertrendTracker(
            exchange_id=self.exchange_id,
            symbol=self.symbol,
            atr_period=self.supertrend_period,
            multiplier=self.supertrend_multiplier,
            timeframe=self.supertrend_timeframe
        ) if any_supertrend_enabled else None
        
        self.supertrend_standalone_listener = SupertrendStandaloneListener(self) if any_supertrend_enabled else None

        _de_enabled = self.config.get("enable_dual_engine", False)
        self.dual_engine_tracker = DualEngineTracker(self.exchange_id, self.symbol, self.config) if _de_enabled else None
        self.dual_engine_standalone = DualEngineStandaloneListener(self) if _de_enabled else None
        
        # --- NEW: Trading Session Tracker ---
        self.trading_sessions = self.config.get("trading_sessions", [self.config.get("trading_session", "None")])
        self.session_tracker = TradingSessionTracker(
            bot_instance=self,
            session_names=self.trading_sessions,
            on_session_end=self._on_trading_session_end
        )
        
        # --- NEW: Smart Wick S/R ---
        self.enable_wick_sr = self.config.get("enable_wick_sr", False)
        self.wick_sr_modes = self.config.get("wick_sr_modes", ["bounce"])
        self.wick_sr_timeframe = self.config.get("wick_sr_timeframe", "1m")
        self.wick_sr_sweep_threshold = self.config.get("wick_sr_sweep_threshold", 3)
        self.wick_sr_min_touches = self.config.get("wick_sr_min_touches", 10)
        self.enable_wick_sr_oib = self.config.get("enable_wick_sr_oib", False)
        self.enable_dynamic_wick_tp = self.config.get("enable_dynamic_wick_tp", False)
        self.dynamic_tp_frontrun_pct = self.config.get("dynamic_tp_frontrun_pct", 0.0)
        
        # --- Auto Fibo Take Profit ---
        self.enable_auto_fibo_tp = self.config.get("enable_auto_fibo_tp", False)
        self.auto_fibo_target_level = self.config.get("auto_fibo_target_level", 1.618)
        self.auto_fibo_timeframe = self.config.get("auto_fibo_timeframe", "5m")
        self.auto_fibo_lookback = self.config.get("auto_fibo_lookback", 30)
        
        self.wick_sr_tracker = WickSRTracker(
            timeframe=self.wick_sr_timeframe,
            sweep_threshold_candles=self.wick_sr_sweep_threshold,
            min_touches=self.wick_sr_min_touches
        ) if self.enable_wick_sr else None
        
        self.wick_sr_listener = WickSRStandaloneListener(self)
        # ----------------------------------------
        
        # State
        self.running = False
        self.redis = get_redis_client()
        self.active_pos = None
        self.extreme_price = 0.0 # Will track Highest for Long, Lowest for Short
        self.tracked_walls = {} # {price: {first_seen, last_seen, vol, type}}
        self.unlocked_supertrend_dir = None # Holds 'buy' or 'sell' when unlocked
        self.unlocked_ut_dir = None # Holds 'buy' or 'sell' when unlocked
        self.last_debug_log_time = 0
        self.last_wall_alert_time = 0 # Throttling for entry-phase logs
        
        # Performance Tracking
        self.total_executed_orders = 0
        self.total_realized_pnl = 0.0
        self.total_wins = 0
        self.total_losses = 0
        
        # Tasks
        self._main_task = None
        self._heartbeat_task = None
        self._vpvr_task = None
        self._atr_task = None
        self._liq_task = None
        self._trades_task = None
        
        self.engine = None
        self.is_hedge_mode = False # Default to One-Way

    async def _on_trading_session_end(self, session_name: str):
        """Callback triggered when the active trading session ends."""
        msg = f"⚠️ *Trading Session Ended*\nBot has been stopped because the {session_name} session is over.\n_Open trades (if any) are left untouched._"
        asyncio.create_task(self._send_telegram(msg))
        self.logger.warning(f"Session {session_name} ended. Stopping bot {self.bot_id} (leaving position open).")
        try:
            from app.services.bot_manager import bot_manager
            asyncio.create_task(bot_manager.stop_bot(str(self.bot_id), str(self.owner_id)))
        except Exception as e:
            self.logger.error(f"Failed to auto-stop via bot_manager: {e}")
            self.running = False

    def _normalize_symbol(self, symbol: str) -> str:
        """Normalizes symbol for robust comparison (e.g. BTC/USDT:USDT -> BTCUSDT)"""
        if not symbol: return ""
        # Remove suffix like :USDT or :USDC if present for comparison
        base = symbol.split(":")[0] if ":" in symbol else symbol
        return base.replace("/", "").replace("-", "").upper()

    def _save_state(self):
        """Save active position state to Redis for recovery on restart."""
        if self.active_pos:
            state_key = f"wallhunter_futures:state:{self.bot_id}"
            try:
                self.redis.set(state_key, json.dumps(self.active_pos))
                logger.info(f"💾 Saved state to Redis: {state_key}")
            except Exception as e:
                logger.warning(f"Failed to save state to Redis: {e}")

    def _clear_state(self):
        """Clear active position state from Redis."""
        state_key = f"wallhunter_futures:state:{self.bot_id}"
        try:
            self.redis.delete(state_key)
            logger.info(f"🗑️ Cleared state from Redis: {state_key}")
        except Exception as e:
            logger.warning(f"Failed to clear state from Redis: {e}")

    def calculate_oib(self, orderbook, depth=10):
        """Calculate Orderbook Imbalance (OIB) for the top N levels. Returns percentage of Bid volume."""
        bids = orderbook.get('bids', [])[:depth]
        asks = orderbook.get('asks', [])[:depth]
        
        bid_vol = sum([level[1] for level in bids])
        ask_vol = sum([level[1] for level in asks])
        
        total_vol = bid_vol + ask_vol
        if total_vol == 0:
            return 0.5
            
        return bid_vol / total_vol

    async def start(self, api_key_record=None):
        """বট স্টার্ট করার মেইন এন্ট্রি পয়েন্ট"""
        self.running = True
        logger.info(f"🚀 [FuturesHunter {self.bot_id}] Starting on {self.symbol}")
        
        try:
            # ১. এক্সচেঞ্জ ইনিশিয়ালাইজেশন
            exchange_id = self.exchange_id
            if exchange_id == 'kucoin':
                exchange_id = 'kucoinfutures'
                
            exchange_class = getattr(ccxt_pro, exchange_id)
            
            # Format Symbol for Futures
            from app.services.ccxt_service import ccxt_service
            self.symbol = ccxt_service.format_futures_symbol(self.symbol, self.exchange_id)
            
            # Public instance for data
            self.public_exchange = exchange_class({'enableRateLimit': True})
            
            # Proxy Exchange Initialization (Cross-Exchange Routing)
            if self.enable_proxy_wall and hasattr(self, 'proxy_exchange') and self.proxy_exchange != self.exchange_id:
                try:
                    proxy_class = getattr(ccxt_pro, self.proxy_exchange, getattr(ccxt, self.proxy_exchange, None))
                    if proxy_class:
                        self.proxy_public_exchange = proxy_class({'enableRateLimit': True})
                        self.logger.info(f"🔄 Dual-Exchange Initialized: Native ({self.exchange_id}) | Proxy ({self.proxy_exchange})")
                    else:
                        raise Exception("Exchange class not found")
                except Exception as e:
                    self.logger.error(f"Failed to load proxy exchange {self.proxy_exchange}: {e}. Falling back to native.")
                    self.proxy_public_exchange = self.public_exchange
            else:
                self.proxy_public_exchange = self.public_exchange
            
            # Private instance for trading
            exchange_params = {
                'enableRateLimit': True,
                'options': {
                    'adjustForTimeDifference': True,
                    'recvWindow': 60000 if self.exchange_id == 'mexc' else 30000,
                    'new_updates': True if self.exchange_id == 'mexc' else False
                }
            }
            
            try:
                await self.public_exchange.load_markets()
                
                # Load markets for proxy exchange if it exists and is different
                if getattr(self, 'proxy_public_exchange', None) and self.proxy_public_exchange != self.public_exchange:
                    try:
                        await self.proxy_public_exchange.load_markets()
                        self.logger.info(f"✅ Connected to Proxy Exchange: {self.proxy_exchange.upper()}")
                    except Exception as e:
                        self.logger.warning(f"Could not load markets for proxy exchange {self.proxy_exchange}: {e}")
            except Exception as e:
                logger.warning(f"Could not load public markets: {e}")

            if not self.is_paper_trading and api_key_record:
                from app.core.security import decrypt_key
                exchange_params.update({
                    'apiKey': decrypt_key(api_key_record.api_key),
                    'secret': decrypt_key(api_key_record.secret_key)
                })
                if hasattr(api_key_record, 'passphrase') and api_key_record.passphrase:
                    exchange_params['password'] = decrypt_key(api_key_record.passphrase)
            
            self.private_exchange = exchange_class(exchange_params)
            
            try:
                await self.private_exchange.load_markets()
            except Exception as e:
                logger.warning(f"Could not load private markets: {e}")

            # --- ১.৫ ফিউচার সেটিংস সেটআপ (লেভারেজ, মার্জিন মোড) ---
            # MUST happen before Recovery to ensure correct environment (Sandbox vs Live)
            await self.initialize_futures_settings()

            # --- Smart State Recovery & Safe Startup Cleanup ---
            if not self.is_paper_trading and self.private_exchange:
                state_key = f"wallhunter_futures:state:{self.bot_id}"
                recovered_pos = None
                try:
                    saved_state_str = self.redis.get(state_key)
                    if saved_state_str:
                        saved_state = json.loads(saved_state_str.decode('utf-8')) if isinstance(saved_state_str, bytes) else json.loads(saved_state_str)
                        
                        # For Futures, check if we actually have an open position natively
                        positions = await self.private_exchange.fetch_positions([self.symbol])
                        has_pos = False
                        norm_target = self._normalize_symbol(self.symbol)
                        
                        found_symbols = []
                        for p in positions:
                            p_symbol = p.get('symbol', 'UNKNOWN')
                            norm_p = self._normalize_symbol(p_symbol)
                            contracts = float(p.get('contracts', 0) or 0)
                            found_symbols.append(f"{p_symbol}({contracts})")
                            
                            # Log every position found during recovery debug
                            if p_symbol == self.symbol or norm_p == norm_target:
                                if contracts > 0:
                                    has_pos = True
                                    logger.info(f"✅ Found matching active position for {p_symbol} ({contracts} contracts)")
                                    break
                        
                        if has_pos:
                            recovered_pos = saved_state
                            self.active_pos = recovered_pos
                            logger.info(f"🌟 [STATE RECOVERY] Successfully recovered active Futures position!")
                            asyncio.create_task(self._send_telegram(f"🌟 *Futures Sequence Recovered*\nBot successfully reattached to live position on restart!\nEntry: {recovered_pos.get('entry')}"))
                        elif saved_state.get('entry_order_id'):
                            # Recovery for pending entry (order placed but not yet found in positional data)
                            entry_id = saved_state.get('entry_order_id')
                            logger.info(f"🔍 [STATE RECOVERY] Found pending Futures entry order {entry_id}. Checking status...")
                            try:
                                status = await self.private_exchange.fetch_order(entry_id, self.symbol)
                                if status and status.get('status') in ['open', 'new']:
                                    logger.info(f"⏳ Pending entry order {entry_id} is still {status.get('status')}. Attaching bot.")
                                    recovered_pos = saved_state
                                    self.active_pos = recovered_pos
                                elif status and status.get('status') in ['closed', 'filled']:
                                    logger.info(f"🌟 [STATE RECOVERY] Entry order {entry_id} filled while offline! Recovering state.")
                                    recovered_pos = saved_state
                                    recovered_pos['entry'] = status.get('average') or status.get('price') or saved_state.get('entry')
                                    recovered_pos['amount'] = status.get('filled') or saved_state.get('amount')
                                    recovered_pos.pop('entry_order_id', None)
                                    self.active_pos = recovered_pos
                                    self._save_state()
                                else:
                                    logger.info(f"⚠️ Pending entry order {entry_id} was {status.get('status') if status else 'lost'}. Keeping state for safety (User check required).")
                                    # We don't clear state here anymore, letting the loop handle it or user intervene
                            except Exception as e:
                                logger.warning(f"Could not verify pending entry order {entry_id}: {e}")
                        else:
                            logger.info(f"ℹ️ Saved state exists but no native position found. Symbols checked: {found_symbols}")
                            # Conservative: We don't auto-clear Redis here unless we are absolutely sure.
                            # Standard loop will handle it if it needs to open new trades.
                except Exception as e:
                    logger.warning(f"⚠️ Failed to attempt state recovery: {e}")
                    
                if not recovered_pos:
                    try:
                        # Only clear orders if we are starting fresh (no recovered position)
                        self.logger.info(f"🧹 Checking for dangling open orders for {self.symbol} (Bot {self.bot_id})...")
                        open_orders = await self.private_exchange.fetch_open_orders(self.symbol)
                        
                        prefix = f"WH_{self.bot_id}_"
                        # Filter for orders that belong to THIS bot using the clientOrderId prefix
                        to_cancel = [o for o in open_orders if str(o.get('clientOrderId', '')).startswith(prefix) or str(o.get('info', {}).get('clientOrderId', '')).startswith(prefix)]
                        
                        if to_cancel:
                            self.logger.info(f"🧹 Found {len(to_cancel)} dangling orders for Bot {self.bot_id}. Analyzing...")
                            expected_entry_side = "sell" if getattr(self, 'strategy_mode', 'long') == "short" else "buy"
                            
                            orders_to_clear = []
                            adopted = False
                            
                            for order in to_cancel:
                                order_side = order.get('side', '').lower()
                                
                                if not recovered_pos and not adopted:
                                    fallback_price = order.get('average') or order.get('price') or self.highest_price
                                    
                                    if order_side == expected_entry_side:
                                        self.logger.info(f"🌟 Adopting dangling {order_side.upper()} order {order['id']} as pending ENTRY!")
                                        self.active_pos = {
                                            "entry": fallback_price,
                                            "amount": order.get('amount') or self.config.get("amount_per_trade", 0.0),
                                            "sl": fallback_price * 1.5 if order_side == "sell" else fallback_price * 0.5,
                                            "tp": fallback_price * 0.5 if order_side == "sell" else fallback_price * 1.5,
                                            "tp1": fallback_price * 0.5 if order_side == "sell" else fallback_price * 1.5,
                                            "tp1_hit": False,
                                            "breakeven_hit": False,
                                            "tsl_activated": False,
                                            "entry_order_id": order['id'],
                                            "limit_order_id": None,
                                            "micro_scalp": getattr(self, 'enable_micro_scalp', False)
                                        }
                                    else:
                                        self.logger.info(f"🌟 Adopting dangling {order_side.upper()} order {order['id']} as pending EXIT (Take Profit)!")
                                        assumed_entry = fallback_price * 1.05 if order_side == "buy" else fallback_price * 0.95
                                        self.active_pos = {
                                            "entry": assumed_entry,
                                            "amount": order.get('amount') or self.config.get("amount_per_trade", 0.0),
                                            "sl": assumed_entry * 1.5 if getattr(self, 'strategy_mode', 'long') == "short" else assumed_entry * 0.5, # Safe fallback SL
                                            "tp": fallback_price,
                                            "tp1": fallback_price,
                                            "tp1_hit": False,
                                            "breakeven_hit": False,
                                            "tsl_activated": False,
                                            "entry_order_id": None,
                                            "limit_order_id": order['id'],
                                            "micro_scalp": getattr(self, 'enable_micro_scalp', False)
                                        }
                                        
                                    recovered_pos = self.active_pos
                                    adopted = True
                                    self._save_state()
                                else:
                                    orders_to_clear.append(order)
                                    
                            if orders_to_clear:
                                self.logger.info(f"🧹 Clearing {len(orders_to_clear)} invalid/duplicate dangling orders...")
                                for order in orders_to_clear:
                                    try:
                                        await self.private_exchange.cancel_order(order['id'], self.symbol)
                                    except Exception as cancel_err:
                                        self.logger.warning(f"Failed to cancel order {order['id']}: {cancel_err}")
                                self.logger.info(f"✅ Dangling orders for Bot {self.bot_id} cleared.")
                        else:
                            self.logger.info(f"✨ No dangling orders found for Bot {self.bot_id}. Isolation check complete.")
                    except Exception as e:
                        self.logger.warning(f"⚠️ Could not perform safe order cleanup: {e}")
            
            # ৩. এক্সিকিউশন ইঞ্জিন
            engine_config = self.config.copy()
            engine_config['symbol'] = self.symbol
            engine_config['trading_mode'] = 'futures'
            engine_config['is_paper_trading'] = self.is_paper_trading
            engine_config['exchange'] = self.exchange_id # Pass actual exchange ID (kucoin)
            engine_config['is_hedge_mode'] = self.is_hedge_mode # পাস করা হলো
            self.engine = OrderBlockExecutionEngine(engine_config, exchange=self.private_exchange, logger=self.logger, bot_id=self.bot_id)
            
            # ৪. মেইন লুপ এবং হার্টবিট শুরু করা
            from app.strategies.helpers.btc_correlation_tracker import BtcCorrelationTracker
            self.btc_correlation_tracker = BtcCorrelationTracker(
                self.public_exchange, 
                self.symbol, 
                threshold=self.btc_correlation_threshold,
                window_minutes=self.btc_time_window,
                min_move_pct=self.btc_min_move_pct
            )

            if self.enable_proxy_wall and self.proxy_symbol:
                self._native_price_task = asyncio.create_task(self._native_price_loop())
            else:
                self._native_price_task = None

            self._main_task = asyncio.create_task(self._run_loop())
            self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())
            if getattr(self, 'vpvr_enabled', False):
                self._vpvr_task = asyncio.create_task(self._vpvr_updater_loop())
            else:
                self._vpvr_task = None
                
            if getattr(self, 'atr_sl_enabled', False) or getattr(self, 'enable_dynamic_atr_scalp', False):
                self._atr_task = asyncio.create_task(self._atr_updater_loop())
            else:
                self._atr_task = None
                
            if getattr(self, 'enable_liq_trigger', False):
                self._liq_task = asyncio.create_task(self._liquidation_listener())
            else:
                self._liq_task = None
                
            if self.config.get('enable_absorption', False) or getattr(self, 'enable_iceberg_trigger', False):
                self._trades_task = asyncio.create_task(self._trades_listener())
            else:
                self._trades_task = None
            
            if self.enable_btc_correlation:
                self._btc_task = asyncio.create_task(self.btc_correlation_tracker.start())
            else:
                self._btc_task = None
                
            if getattr(self, 'ut_bot_tracker', None):
                self._utbot_task = asyncio.create_task(self.ut_bot_tracker.start())
                self._ut_standalone_task = asyncio.create_task(self.ut_standalone_listener.start())
            else:
                self._utbot_task = None
                self._ut_standalone_task = None

            if getattr(self, 'supertrend_tracker', None):
                self._supertrend_task = asyncio.create_task(self.supertrend_tracker.start())
                self._supertrend_standalone_task = asyncio.create_task(self.supertrend_standalone_listener.start())
            else:
                self._supertrend_task = None
                self._supertrend_standalone_task = None

            if self.config.get("enable_dual_engine", False):
                self._dual_engine_task = asyncio.create_task(self.dual_engine_tracker.start())
                self._dual_engine_standalone_task = asyncio.create_task(self.dual_engine_standalone.start())
            else:
                self._dual_engine_task = None
                self._dual_engine_standalone_task = None
                
            if self.enable_wick_sr:
                self._wick_sr_task = asyncio.create_task(self.wick_sr_listener.start())
            else:
                self._wick_sr_task = None
                
            # --- Start Session Monitor ---
            await self.session_tracker.start_monitor()
            
            mode_str = "Paper Trading (Future)" if self.is_paper_trading else "Live Trading (Future)"
            
            trigger_logs = []
            if getattr(self, 'enable_wall_trigger', True):
                trigger_logs.append(f"Vol Threshold: {self.vol_threshold}")
            if getattr(self, 'enable_liq_trigger', False):
                trigger_logs.append(f"Liq Threshold: {self.liq_threshold}")
            trigger_str = "\n".join(trigger_logs)
            
            # Optional Limit Buffer: Only show if the order type is not Market
            limit_buffer = self.config.get("limit_buffer", 0.05)
            limit_buffer_str = f"Limit Buffer: {limit_buffer}%\n" if self.buy_order_type.lower() != "market" else ""

            any_ut = getattr(self, 'enable_ut_trend_filter', False) or getattr(self, 'enable_ut_entry_trigger', False) or getattr(self, 'enable_ut_trailing_sl', False)
            ut_summary_str = ""
            if any_ut:
                ut_mode = "Standalone" if (not self.enable_wall_trigger and not self.enable_liq_trigger) else "Confluence"
                ut_summary_str = f"UT Bot Alerts: ACTIVE ({ut_mode})\n"
                if getattr(self, 'enable_ut_entry_trigger', False): ut_summary_str += "  └─ Entry Trigger: ON\n"
                if getattr(self, 'enable_ut_trend_filter', False): ut_summary_str += "  └─ Trend Filter: ON\n"
                if getattr(self, 'enable_ut_trailing_sl', False): ut_summary_str += "  └─ Trailing SL: ON\n"

            any_supertrend = getattr(self, 'enable_supertrend_trend_filter', False) or getattr(self, 'enable_supertrend_entry_trigger', False) or getattr(self, 'enable_supertrend_trailing_sl', False) or getattr(self, 'enable_supertrend_exit', False)
            if any_supertrend:
                st_mode = "Standalone" if (not getattr(self, 'enable_wall_trigger', False) and not getattr(self, 'enable_liq_trigger', False)) else "Confluence"
                ut_summary_str += f"Supertrend Alerts: ACTIVE ({st_mode})\n"
                if getattr(self, 'enable_supertrend_entry_trigger', False): ut_summary_str += "  \u2514\u2500 Entry Trigger: ON\n"
                if getattr(self, 'enable_supertrend_trend_filter', False): ut_summary_str += "  \u2514\u2500 Trend Filter: ON\n"
                if getattr(self, 'enable_supertrend_trailing_sl', False): ut_summary_str += "  \u2514\u2500 Trailing SL: ON\n"
                if getattr(self, 'enable_supertrend_exit', False): ut_summary_str += f"  \u2514\u2500 Reversal Dual-Exit: ON ({getattr(self, 'supertrend_exit_timeout', 5)}s)\n"

            # Wick SR is shown in the BOT ACTIVATED numbered list (bot_manager.py), not here.
            valid_sessions = [s for s in getattr(self, 'trading_sessions', []) if s and s != "None"]
            session_str = f"\U0001f552 Trading Sessions: {', '.join(valid_sessions)}\n" if valid_sessions else ""
            startup_msg = (
                f"\U0001f7e2 WallHunter Bot [ID {self.bot_id}] Started!\n"
                f"Pair: {self.symbol}\n"
                f"Mode: {mode_str}\n"
                f"{session_str}"
                f"Buy Order: {self.buy_order_type.upper()}\n"
                f"{limit_buffer_str}"
                f"{trigger_str}\n"
                f"{ut_summary_str}"
            )

            await self._send_telegram(startup_msg)
            logger.info(f"\u2705 [FuturesHunter {self.bot_id}] Initialization Complete")


            
        except Exception as e:
            logger.error(f"❌ Failed to start Futures Bot {self.bot_id}: {str(e)}")
            await self.stop()
            self.running = False
            raise e

    async def stop(self):
        """বট স্টপ করার জন্য রিসোর্স ক্লিনআপ"""
        self.running = False
        logger.info(f"🛑 [FuturesHunter {self.bot_id}] Stopping...")
        if getattr(self, 'session_tracker', None):
            await self.session_tracker.stop_monitor()

        
        # --- FIX: Task Memory Leak / CPU Spike Prevention ---
        for task_attr in ['_main_task', '_heartbeat_task', '_vpvr_task', '_atr_task', '_liq_task', '_trades_task', '_btc_task', '_utbot_task', '_ut_standalone_task', '_supertrend_task', '_supertrend_standalone_task', '_dual_engine_task', '_dual_engine_standalone_task', '_native_price_task', '_wick_sr_task']:
            task = getattr(self, task_attr, None)
            if task and not task.done():
                try:
                    task.cancel()
                except Exception as e:
                    logger.error(f"Error cancelling task {task_attr}: {e}")
        # ----------------------------------------------------
        
        try:
            if self.public_exchange:
                await self.public_exchange.close()
            if self.private_exchange:
                await self.private_exchange.close()
                
            if getattr(self, 'proxy_public_exchange', None) and self.proxy_public_exchange != self.public_exchange:
                await self.proxy_public_exchange.close()
        except Exception as e:
            logger.error(f"Error closing exchanges: {e}")

    async def initialize_futures_settings(self):
        """এক্সচেঞ্জে লেভারেজ এবং মার্জিন মোড সেট করবে"""
        try:
            logger.info(f"[{self.bot_id}] Setting up Futures Market: {self.symbol}, Leverage {self.leverage}x, Mode: {self.margin_mode}")
            
            if self.is_paper_trading:
                self.private_exchange.set_sandbox_mode(True)
                
            # সেট লেভারেজ
            try:
                if self.exchange_id == 'mexc':
                    # MEXC requires both long and short leverage to be set separately
                    open_type = 1 if self.margin_mode == 'isolated' else 2
                    await self.private_exchange.set_leverage(self.leverage, self.symbol, {'openType': open_type, 'positionType': 1}) # Long
                    await self.private_exchange.set_leverage(self.leverage, self.symbol, {'openType': open_type, 'positionType': 2}) # Short
                elif self.exchange_id == 'kucoin':
                    if self.margin_mode.lower() == 'cross':
                        await self.private_exchange.set_leverage(self.leverage, self.symbol, {'marginMode': 'cross'})
                    else:
                        # CCXT Kucoin only supports setting Cross leverage. Isolated is default or unsupported.
                        pass
                else:
                    await self.private_exchange.set_leverage(self.leverage, self.symbol)
            except Exception as e:
                logger.warning(f"Could not set leverage (might already be set): {e}")
                
            try:
                if self.exchange_id == 'mexc':
                    # MEXC setMarginMode requires leverage as well, and symbol must be in params for some versions
                    await self.private_exchange.set_margin_mode(self.margin_mode.lower(), self.symbol, {'leverage': self.leverage, 'symbol': self.symbol})
                elif self.exchange_id == 'kucoin':
                    # CCXT handles marginMode casing natively for Kucoin, passing it in params overrides it and breaks it
                    await self.private_exchange.set_margin_mode(self.margin_mode.lower(), self.symbol)
                else:
                    await self.private_exchange.set_margin_mode(self.margin_mode.lower(), self.symbol)
            except Exception as e:
                logger.warning(f"Could not set margin mode (might already be set): {e}")

            # ৩. ডাইনামিক পজিশন মোড ডিটেকশন (Binance Hedge vs One-Way)
            if self.exchange_id in ['binance', 'binanceusdm']:
                # Paper trading-এ API key নেই, private call skip করো
                if self.is_paper_trading:
                    self.is_hedge_mode = False
                    self.logger.info(f"ℹ️ [{self.bot_id}] Paper Trading — skipping position mode detection (defaulting to One-Way).")
                else:
                    try:
                        self.logger.info(f"🔍 [{self.bot_id}] Fetching Binance Position Mode...")
                        # CCXT CamelCase method is the primary (confirmed working)
                        # Fallback chain: CamelCase → snake_case → fapiprivate variant
                        response = None
                        for method_name in [
                            'fapiPrivateGetPositionSideDual',
                            'fapiprivateGetPositionsideDual',
                            'fapiprivate_get_positionside_dual',
                        ]:
                            method = getattr(self.private_exchange, method_name, None)
                            if method and callable(method):
                                try:
                                    response = await method()
                                    break
                                except Exception:
                                    continue

                        if response is not None:
                            self.is_hedge_mode = response.get('dualSidePosition', False)
                            mode_name = "Hedge Mode" if self.is_hedge_mode else "One-Way Mode"
                            self.logger.info(f"✅ [{self.bot_id}] [Binance] Detected Position Mode: {mode_name}")
                        else:
                            raise RuntimeError("All FAPI position mode methods failed or unavailable.")
                    except Exception as e:
                        logger.warning(f"⚠️ [{self.bot_id}] Could not detect Binance position mode (defaulting to One-Way): {e}")
                        self.is_hedge_mode = False
            elif self.exchange_id == 'binancecoinm':
                if self.is_paper_trading:
                    self.is_hedge_mode = False
                    self.logger.info(f"ℹ️ [{self.bot_id}] Paper Trading — skipping COIN-M position mode detection (defaulting to One-Way).")
                else:
                    try:
                        # Inverse Futures (COIN-M) — same fallback chain pattern
                        response = None
                        for method_name in [
                            'dapiPrivateGetPositionSideDual',
                            'dapiprivateGetPositionsideDual',
                            'dapiprivate_get_positionside_dual',
                        ]:
                            method = getattr(self.private_exchange, method_name, None)
                            if method and callable(method):
                                try:
                                    response = await method()
                                    break
                                except Exception:
                                    continue

                        if response is not None:
                            self.is_hedge_mode = response.get('dualSidePosition', False)
                            mode_name = "Hedge Mode" if self.is_hedge_mode else "One-Way Mode"
                            logger.info(f"✅ [{self.bot_id}] [Binance COIN-M] Detected Position Mode: {mode_name}")
                        else:
                            raise RuntimeError("All DAPI position mode methods failed or unavailable.")
                    except Exception as e:
                        logger.warning(f"⚠️ [{self.bot_id}] Could not detect Binance COIN-M position mode: {e}")
                        self.is_hedge_mode = False
                
        except Exception as e:
            logger.error(f"Futures Settings initialization error: {e}")

    async def _native_price_loop(self):
        """Cross-Exchange: Fetches native price continuously for accurate risk management while proxy watches orderbook."""
        self.logger.info(f"🔄 Native Price Tracker Started for {self.symbol} on {self.exchange_id}")
        while self.running:
            try:
                if getattr(self, 'public_exchange', None):
                    try:
                        ticker = await self.public_exchange.watch_ticker(self.symbol)
                        self.current_native_price = ticker['last'] if ticker.get('last') else (ticker.get('ask') + ticker.get('bid')) / 2
                    except Exception:
                        ticker = await self.public_exchange.fetch_ticker(self.symbol)
                        self.current_native_price = ticker['last'] if ticker.get('last') else (ticker.get('ask') + ticker.get('bid')) / 2
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.warning(f"Native price fetch error: {e}")
            await asyncio.sleep(0.5)

    async def _heartbeat_loop(self):
        while self.running:
            try:
                extras = []
                any_ut = getattr(self, 'enable_ut_trend_filter', False) or getattr(self, 'enable_ut_entry_trigger', False) or getattr(self, 'enable_ut_trailing_sl', False)
                if any_ut:
                    ut_mode = "Standalone" if (not getattr(self, 'enable_wall_trigger', False) and not getattr(self, 'enable_liq_trigger', False)) else "Confluence"
                    extras.append(f"🤖 UT: {ut_mode}")
                    
                any_st = getattr(self, 'enable_supertrend_trend_filter', False) or getattr(self, 'enable_supertrend_entry_trigger', False) or getattr(self, 'enable_supertrend_trailing_sl', False)
                if any_st:
                    st_mode = "Standalone" if (not getattr(self, 'enable_wall_trigger', False) and not getattr(self, 'enable_liq_trigger', False)) else "Confluence"
                    st_trend = "Unknown"
                    if getattr(self, "supertrend_tracker", None):
                        tdir = self.supertrend_tracker.latest_trend_dir
                        st_trend = "BUY" if tdir == 1 else "SELL" if tdir == -1 else "Unknown"
                    extras.append(f"🌊 ST ({st_trend}): {st_mode}")

                de_status = ""
                if getattr(self, "dual_engine_tracker", None) and self.dual_engine_tracker.is_enabled:
                    de_mode = self.config.get("dual_engine_mode", "Classic").upper()
                    sig = self.dual_engine_tracker.current_state.get('signal', 'NEUTRAL')
                    if de_mode in ['HYBRID', 'LEGACY']:
                        score = self.dual_engine_tracker.current_state.get('insight_score', 0)
                        de_status = f" | \U0001f9e0 Dual Engine [{de_mode}]: {sig} (Score: {score})"
                    else:
                        de_status = f" | \U0001f9e0 Dual Engine [CLASSIC]: {sig}"

                # Wick SR live status
                wick_sr_status = ""
                if getattr(self, 'enable_wick_sr', False) and getattr(self, 'wick_sr_tracker', None):
                    levels = self.wick_sr_tracker.levels
                    active  = sum(1 for l in levels if l.get('status') == 'ACTIVE')
                    sw      = sum(1 for l in levels if l.get('status') == 'BROKEN_SWEEP_WATCH')
                    rt      = sum(1 for l in levels if l.get('status') == 'BROKEN_RETEST')
                    modes_str = "/".join([m.title() for m in getattr(self, 'wick_sr_modes', ['bounce'])])
                    cp = getattr(self.wick_sr_tracker, 'last_close', 0.0)
                    near_levels = sum(1 for l in levels if l.get('status') == 'ACTIVE' and cp > 0 and abs(l['price'] - cp) / cp <= 0.015)
                    
                    if len(levels) > 0 and near_levels == 0:
                        direction = getattr(self, 'direction', 'long')
                        if direction == 'long': status_str = "👀 Finding support (waiting for signal)..."
                        elif direction == 'short': status_str = "👀 Finding resistance (waiting for signal)..."
                        else: status_str = "👀 Finding zones (waiting for signal)..."
                        wick_sr_status = f" | \U0001f525 WickSR [{modes_str}] Lvls:{len(levels)} (No near levels) | {status_str}"
                    elif near_levels > 0:
                        active_modes = getattr(self, 'wick_sr_modes', [])
                        if len(active_modes) == 1:
                            if active_modes[0] == 'bounce': action_str = "Bounce rejection"
                            elif active_modes[0] == 'breakout': action_str = "Breakout momentum"
                            elif active_modes[0] == 'sweep': action_str = "Liquidity Sweep (Trap)"
                            elif active_modes[0] == 'retest': action_str = "SR Retest"
                            else: action_str = modes_str
                        else:
                            action_str = f"{modes_str} signals"
                            
                        wick_sr_status = (
                            f" | \U0001f525 WickSR [{modes_str}] "
                            f"🎯 Near {near_levels} Zones! Watching for {action_str}..."
                        )
                    else:
                        wick_sr_status = " | \U0001f525 WickSR [Initializing...]"

                extra_str = f" | {' | '.join(extras)}" if extras else ""

                # Session status for heartbeat
                valid_sessions = [s for s in getattr(self, 'trading_sessions', []) if s and s != "None"]
                if valid_sessions:
                    session_active = TradingSessionTracker.is_session_active(self.trading_sessions)
                    display_name = ", ".join(valid_sessions)
                    session_tag = f" | Session: {display_name} [ACTIVE]" if session_active else f" | Session: {display_name} [WAITING]"
                else:
                    session_tag = ""

                logger.info(
                    f"\U0001f493 [FuturesHunter {self.bot_id}] monitoring {self.symbol} (Futures Mode)"
                    f"{extra_str}{de_status}{wick_sr_status}{session_tag}..."
                )
                await asyncio.sleep(10)
            except Exception as e:
                self.logger.error(f"Heartbeat loop error: {e}")
                await asyncio.sleep(10)

    async def _run_loop(self):
        """মেইন স্ট্র্যাটেজি লুপ: L2 অর্ডারবুক ট্র্যাকিং"""
        while self.running:
            try:
                # WebSocket এর মাধ্যমে অর্ডারবুক ওয়াচ করা
                limit = market_depth_service._normalize_order_book_limit(self.proxy_exchange if self.enable_proxy_wall else self.exchange_id, 20)
                watch_sym = self.proxy_symbol if self.enable_proxy_wall and self.proxy_symbol else self.symbol
                target_exchange = getattr(self, 'proxy_public_exchange', self.public_exchange)
                
                try:
                    orderbook = await target_exchange.watch_order_book(watch_sym, limit=limit)
                except Exception as e:
                    logger.warning(f"WS Orderbook error: {e}, falling back to REST")
                    await asyncio.sleep(1.5) # Rate limit protection for REST fallback
                    orderbook = await target_exchange.fetch_order_book(watch_sym, limit=limit)
                
                if not orderbook['bids'] or not orderbook['asks']:
                    await asyncio.sleep(1)
                    continue

                best_bid = orderbook['bids'][0][0]
                best_ask = orderbook['asks'][0][0]
                mid_price = (best_bid + best_ask) / 2
                current_time = time.time()

                # Periodic debug info (every 10 seconds)
                if current_time - self.last_debug_log_time >= 10:
                    self.last_debug_log_time = current_time
                    max_bid = max([level[1] for level in orderbook['bids']]) if orderbook['bids'] else 0
                    max_ask = max([level[1] for level in orderbook['asks']]) if orderbook['asks'] else 0
                    # Only show Threshold when Wall Trigger is actually enabled — avoids confusion
                    if getattr(self, 'enable_wall_trigger', False):
                        logger.info(f"🔍 [Debug {self.bot_id}] {self.symbol} Mid: {mid_price:.6f} | Max Bid: {max_bid:,.0f} | Max Ask: {max_ask:,.0f} | Threshold: {self.vol_threshold:,.0f}")
                    else:
                        logger.info(f"🔍 [Debug {self.bot_id}] {self.symbol} Mid: {mid_price:.6f} | Max Bid: {max_bid:,.0f} | Max Ask: {max_ask:,.0f}")

                if not self.active_pos:
                    # --- Session Checks ---
                    if not TradingSessionTracker.is_session_active(self.trading_sessions):
                        await asyncio.sleep(1)
                        continue # Skip entry searches outside of session
                    if getattr(self, 'supertrend_trend_unlock_mode', False) and getattr(self, 'supertrend_tracker', None):
                        closed_only = getattr(self, 'supertrend_candle_close', False)
                        if self.supertrend_tracker.is_entry_signal("buy", closed_only):
                            if self.unlocked_supertrend_dir != "buy":
                                self.unlocked_supertrend_dir = "buy"
                                self.logger.info("🔓 [Supertrend] Trend Unlocked for BUY (Long) trades!")
                        elif self.supertrend_tracker.is_entry_signal("sell", closed_only):
                            if self.unlocked_supertrend_dir != "sell":
                                self.unlocked_supertrend_dir = "sell"
                                self.logger.info("🔓 [Supertrend] Trend Unlocked for SELL (Short) trades!")
                                
                    if getattr(self, 'ut_trend_unlock_mode', False) and getattr(self, 'ut_bot_tracker', None):
                        closed_only = getattr(self, 'ut_bot_candle_close', False)
                        if self.ut_bot_tracker.is_entry_signal("buy", closed_only):
                            if self.unlocked_ut_dir != "buy":
                                self.unlocked_ut_dir = "buy"
                                self.logger.info("🔓 [UT Bot] Trend Unlocked for BUY (Long) trades!")
                        elif self.ut_bot_tracker.is_entry_signal("sell", closed_only):
                            if self.unlocked_ut_dir != "sell":
                                self.unlocked_ut_dir = "sell"
                                self.logger.info("🔓 [UT Bot] Trend Unlocked for SELL (Short) trades!")
                    
                    if self.enable_iceberg_trigger:
                        self.iceberg_tracker.update_orderbook(orderbook['bids'], orderbook['asks'])
                        
                        target_side = "buy" if self.direction in ['long', 'auto'] else "sell"
                        
                        ice_res = self.iceberg_tracker.check_for_iceberg(target_side, mid_price)
                        if ice_res and ice_res.get('iceberg_detected'):
                            price = ice_res['price']
                            self.logger.info(f"💎 ICEBERG TRIGGER! Massive absorption detected defending {price}. Executing high-priority Snipe!")
                            
                            try:
                                event_payload = {
                                    "type": "ICEBERG_DETECTED",
                                    "symbol": self.symbol,
                                    "side": target_side,
                                    "price": price,
                                    "absorbed_vol": ice_res.get("absorbed_vol", 0),
                                    "limit_vol_remaining": ice_res.get("limit_vol_remaining", 0)
                                }
                                self.redis.publish("heatmap_events", json.dumps(event_payload))
                            except Exception as e:
                                self.logger.error(f"Failed to publish Heatmap event: {e}")

                            if self.enable_proxy_wall:
                                try:
                                    native_book = await self.public_exchange.fetch_order_book(self.symbol, limit=5)
                                    native_best_bid = native_book['bids'][0][0]
                                    native_best_ask = native_book['asks'][0][0]
                                    native_mid = (native_best_bid + native_best_ask) / 2
                                    await self.execute_snipe(price, target_side, native_mid, native_best_bid, native_best_ask)
                                except Exception as e:
                                    self.logger.warning(f"Error fetching native execution book for proxy snipe: {e}. Falling back to proxy price.")
                                    await self.execute_snipe(price, target_side, mid_price, best_bid, best_ask)
                            else:
                                await self.execute_snipe(price, target_side, mid_price, best_bid, best_ask)
                                
                            self.tracked_walls.clear()
                            continue

                    if getattr(self, 'enable_wick_sr', False) and getattr(self, 'wick_sr_tracker', None):
                        wick_signals = self.wick_sr_tracker.get_signals(mid_price)
                        for w_sig in wick_signals:
                            # Check if the triggered mode is enabled
                            if w_sig['mode'] in self.wick_sr_modes:
                                raw_side = w_sig['side']
                                target_side = 'buy' if raw_side == 'long' else 'sell'
                                
                                # Option: Futures check direction restrictions
                                if target_side == "sell" and self.direction == "long":
                                    continue # Bot restricted to long only
                                elif target_side == "buy" and self.direction == "short":
                                    continue # Bot restricted to short only
                                
                                # Evaluate Wick SR OIB Confluence
                                is_confluence_valid = True
                                oib_ratio = 0.5
                                oib_log_str = "(OIB Filter: OFF)"
                                if getattr(self, 'enable_wick_sr_oib', False):
                                    oib_ratio = self.calculate_oib(orderbook, depth=10)
                                    oib_log_str = f"({oib_ratio*100:.1f}% OIB)"
                                    min_oib = getattr(self, 'min_oib_threshold', 0.4)
                                    if target_side == 'buy' and oib_ratio < min_oib:
                                        self.logger.info(f"🚫 Wick SR Snipe ({w_sig['mode'].upper()}) rejected! Weak Bid OIB ({oib_ratio*100:.1f}%).")
                                        is_confluence_valid = False
                                    elif target_side == 'sell' and (1 - oib_ratio) < min_oib:
                                        self.logger.info(f"🚫 Wick SR Snipe ({w_sig['mode'].upper()}) rejected! Weak Ask OIB ({(1-oib_ratio)*100:.1f}%).")
                                        is_confluence_valid = False
                                        
                                if is_confluence_valid:
                                    self.logger.info(f"🔥 WICK S/R TRIGGER! Executing {w_sig['mode'].upper()} {target_side.upper()} Snipe at {w_sig['price']} {oib_log_str}!")
                                    if self.enable_proxy_wall:
                                        try:
                                            native_book = await self.public_exchange.fetch_order_book(self.symbol, limit=5)
                                            native_mid = (native_book['bids'][0][0] + native_book['asks'][0][0]) / 2
                                            await self.execute_snipe(w_sig['price'], target_side, native_mid, native_book['bids'][0][0], native_book['asks'][0][0])
                                        except Exception as e:
                                            await self.execute_snipe(w_sig['price'], target_side, mid_price, best_bid, best_ask)
                                    else:
                                        await self.execute_snipe(w_sig['price'], target_side, mid_price, best_bid, best_ask)
                                    self.tracked_walls.clear()
                                    break # Exit the wick sig loop to avoid double entries
                            
                        # If a wick signal just executed and opened a position, move to the next tick safely
                        if self.active_pos:
                            continue

                    if not self.enable_wall_trigger:
                        self._publish_status(mid_price)
                        continue

                    current_walls = {}
                    potential_triggers = []
                    
                    # ১. বড় ওয়াল ডিটেক্ট করা
                    bid_vol_total = 0.0
                    ask_vol_total = 0.0
                    
                    # Accumulate volume for imbalance check + detect BUY walls
                    for level in orderbook['bids']:
                        price, vol = level[0], level[1]
                        bid_vol_total += vol
                        if self.direction in ['long', 'auto'] and vol >= self.vol_threshold:
                            dist_pct = abs(price - mid_price) / mid_price * 100
                            if dist_pct <= self.max_wall_distance_pct:
                                current_walls[price] = {'vol': vol, 'type': 'buy'}
                        elif self.direction in ['long', 'auto'] and vol >= (self.vol_threshold * 0.5):
                            if current_time - self.last_debug_log_time >= 10:
                                logger.debug(f"ℹ️ Found buy wall at {price} with vol {vol:,.0f} (Too small, threshold: {self.vol_threshold:,.0f})")
                                
                    # Accumulate volume for imbalance check + detect SELL walls
                    for level in orderbook['asks']:
                        price, vol = level[0], level[1]
                        ask_vol_total += vol
                        if self.direction in ['short', 'auto'] and vol >= self.vol_threshold:
                            dist_pct = abs(price - mid_price) / mid_price * 100
                            if dist_pct <= self.max_wall_distance_pct:
                                current_walls[price] = {'vol': vol, 'type': 'sell'}
                        elif self.direction in ['short', 'auto'] and vol >= (self.vol_threshold * 0.5):
                            if current_time - self.last_debug_log_time >= 10:
                                logger.debug(f"ℹ️ Found sell wall at {price} with vol {vol:,.0f} (Too small, threshold: {self.vol_threshold:,.0f})")

                    # ২. ট্র্যাকিং এবং স্পুফিং ডিটেকশন (Collect all confirmed walls)
                    for price, info in current_walls.items():
                        if price in self.tracked_walls:
                            self.tracked_walls[price]['last_seen'] = current_time
                            alive_time = current_time - self.tracked_walls[price]['first_seen']
                            
                            if alive_time >= self.min_wall_lifetime:
                                wall_type = self.tracked_walls[price]['type']
                                
                                # VPVR Confirmation
                                if self.vpvr_enabled and self.top_hvns:
                                    is_hvn_aligned = any(abs(price - hvn) / hvn <= (self.vpvr_tolerance / 100.0) for hvn in self.top_hvns)
                                    if not is_hvn_aligned:
                                        if not self.tracked_walls[price].get('hvn_rejected'):
                                            logger.info(f"🚫 Wall at {price} rejected: Not near any HVN.")
                                            self.tracked_walls[price]['hvn_rejected'] = True
                                        continue
                                
                                potential_triggers.append({
                                    'price': price,
                                    'vol': info['vol'],
                                    'type': wall_type
                                })
                        else:
                            self.tracked_walls[price] = {
                                "vol": info['vol'],
                                "type": info['type'],
                                "first_seen": current_time,
                                "last_seen": current_time
                            }
                    
                    # ৩. সেরা ওয়াল নির্বাচন (Highest Volume Wall)
                    if potential_triggers:
                        # Sort by volume descending
                        potential_triggers.sort(key=lambda x: x['vol'], reverse=True)
                        
                        # Apply Imbalance check if enabled
                        if ask_vol_total == 0 and bid_vol_total == 0:
                            imbalance_ratio = 1.0 # Neutral (prevents fakeout)
                        elif ask_vol_total == 0:
                            imbalance_ratio = 10.0
                        else:
                            imbalance_ratio = bid_vol_total / ask_vol_total
                        
                        best_wall = None
                        for wall in potential_triggers:
                            # If AUTO mode, check imbalance
                            if self.direction == 'auto' and self.enable_ob_imbalance:
                                safe_ratio = self.ob_imbalance_ratio if getattr(self, 'ob_imbalance_ratio', 1.5) > 0 else 1.5
                                if wall['type'] == 'buy' and imbalance_ratio < safe_ratio:
                                    continue # Not enough buy pressure
                                if wall['type'] == 'sell' and imbalance_ratio > (1 / safe_ratio):
                                    continue # Not enough sell pressure
                            
                            best_wall = wall
                            break
                        
                        if best_wall:
                            should_log_alert = current_time - self.last_wall_alert_time >= 2.0
                            
                            if should_log_alert:
                                self.logger.info(f"🟢 [BEST WALL] {best_wall['type'].upper()} Confirmed at {best_wall['price']} (Vol: {best_wall['vol']}). Snipping!")
                                if self.enable_ob_imbalance:
                                    self.logger.info(f"📊 Market Imbalance: {imbalance_ratio:.2f}x (Threshold: {self.ob_imbalance_ratio}x)")
                                self.last_wall_alert_time = current_time
                            
                            reason = f"Wall confirmed at {best_wall['price']}"
                            if self.enable_ob_imbalance:
                                reason += f" (Imbalance: {imbalance_ratio:.2f}x)"
                            
                            # CVD Absorption Check
                            if self.enable_absorption:
                                wall_type = best_wall['type'] # 'buy' or 'sell'
                                # In Futures, 'buy' wall means we want to go LONG (reversal from shorts hitting the wall)
                                # AbsorptionTracker.is_absorption_detected(side) expects the side of the WALL
                                if not self.absorption_tracker.is_absorption_detected(wall_type):
                                    continue
                                self.logger.info(f"🧬 [ABSORPTION] Confirmed {wall_type.upper()} absorption at {best_wall['price']}!")
                            
                            # BTC Correlation Anti-Fakeout Check
                            if self.enable_btc_correlation and self.btc_correlation_tracker:
                                target_side = "buy" if best_wall['type'] == 'buy' else "sell"
                                if not self.btc_correlation_tracker.is_aligned(target_side):
                                    if should_log_alert:
                                        metrics = self.btc_correlation_tracker.get_metrics_string()
                                        self.logger.info(f"🚫 [BTC Divergence] Wall at {best_wall['price']} rejected! {metrics}")
                                    continue
                                    
                            # Adaptive Trend Filter Check
                            if self.enable_trend_filter and self.trend_finder:
                                target_side = "buy" if best_wall['type'] == 'buy' else "sell"
                                
                                # Fetch recent klines to evaluate trend instantly before snipe
                                try:
                                    klines = await market_depth_service.fetch_ohlcv(self.symbol, self.exchange_id, '1m', 1200)
                                    if klines:
                                        close_prices = [float(k['close']) for k in klines]
                                        trend_analysis = self.trend_finder.analyze_trend(close_prices)
                                        is_acceptable, tb_reason = self.trend_finder.is_trend_acceptable(trend_analysis, target_side)
                                        if not is_acceptable:
                                            if should_log_alert:
                                                self.logger.info(f"🚫 [Trend Filter] Wall at {best_wall['price']} rejected! {tb_reason}")
                                            continue
                                        else:
                                            self.logger.info(f"📈 [Trend Filter] {tb_reason}")
                                            reason += f" ({tb_reason})"
                                except Exception as e:
                                    self.logger.warning(f"⚠️ [Trend Filter] Could not fetch OHLCV for trend check: {e}. Allowing trade (pass-through).")
                                    # Pass-through on fetch failure — don't block entries due to transient network errors

                            # --- Modular UT Bot Alerts Filter ---
                            target_side = "buy" if best_wall['type'] == 'buy' else "sell"
                            if self.enable_ut_entry_trigger and self.ut_bot_tracker:
                                if getattr(self, 'ut_trend_unlock_mode', False):
                                    if self.unlocked_ut_dir != target_side:
                                        if should_log_alert:
                                            self.logger.info(f"🚫 [UT Unlock Filter] Wall at {best_wall['price']} rejected! Waiting for initial {target_side.upper()} crossover.")
                                        continue
                                    else:
                                        self.logger.info(f"🔓 [UT Unlock] Path is clear for {target_side.upper()}!")
                                else:
                                    if not self.ut_bot_tracker.is_entry_signal(target_side):
                                        if should_log_alert:
                                            self.logger.info(f"🚫 [UT Entry Filter] Wall at {best_wall['price']} rejected! No exact crossover entry signal.")
                                        continue
                                    else:
                                        self.logger.info(f"📈 [UT Entry Filter] Exact {target_side.upper()} crossover signal detected!")

                            if self.enable_ut_trend_filter and self.ut_bot_tracker:
                                if not self.ut_bot_tracker.is_trend_aligned(target_side):
                                    if should_log_alert:
                                        self.logger.info(f"🚫 [UT Trend Filter] Wall at {best_wall['price']} rejected! Trend direction misaligned.")
                                    continue
                                else:
                                    self.logger.info(f"📈 [UT Trend Filter] Trend is aligned for {target_side.upper()}.")
                            
                            # --- Modular Supertrend Alerts Filter ---
                            if self.enable_supertrend_entry_trigger and self.supertrend_tracker:
                                if getattr(self, 'supertrend_trend_unlock_mode', False):
                                    if self.unlocked_supertrend_dir != target_side:
                                        if should_log_alert:
                                            self.logger.info(f"🚫 [Supertrend Unlock] Wall at {best_wall['price']} rejected! Waiting for initial {target_side.upper()} crossover.")
                                        continue
                                    else:
                                        self.logger.info(f"🔓 [Supertrend Unlock] Path is clear for {target_side.upper()}!")
                                else:
                                    if not self.supertrend_tracker.is_entry_signal(target_side):
                                        if should_log_alert:
                                            self.logger.info(f"🚫 [Supertrend Entry Filter] Wall at {best_wall['price']} rejected! No crossover entry signal.")
                                        continue
                                    else:
                                        self.logger.info(f"📈 [Supertrend Entry Filter] Exact {target_side.upper()} crossover signal detected!")

                            if self.enable_supertrend_trend_filter and self.supertrend_tracker:
                                if not self.supertrend_tracker.is_trend_aligned(target_side):
                                    if should_log_alert:
                                        self.logger.info(f"🚫 [Supertrend Trend Filter] Wall at {best_wall['price']} rejected! Trend direction misaligned.")
                                    continue
                                else:
                                    self.logger.info(f"📈 [Supertrend Trend Filter] Trend is aligned for {target_side.upper()}.")
                            
                            if getattr(self.dual_engine_tracker, "is_enabled", False):
                                if not self.dual_engine_tracker.is_aligned(target_side):
                                    if should_log_alert:
                                        self.logger.info(f"🚫 [Dual Engine] Wall at {best_wall['price']} rejected! {self.dual_engine_tracker.get_metrics_string()}")
                                    continue
                                else:
                                    self.logger.info(f"📈 [Dual Engine] Confirmed aligned for {target_side.upper()}! {self.dual_engine_tracker.get_metrics_string()}")
                                    reason += f" (Dual Engine)"
                            
                            # --- Multi-Level Orderbook Imbalance (OIB) ---
                            if getattr(self, 'enable_oib_filter', False):
                                oib_ratio = self.calculate_oib(orderbook, depth=10)
                                min_oib_threshold = getattr(self, 'min_oib_threshold', 0.4)
                                
                                if target_side == "buy" and oib_ratio < min_oib_threshold:
                                    if should_log_alert:
                                        self.logger.info(f"🚫 [OIB Filter] Snipe at {best_wall['price']} rejected! Weak Bid presence ({oib_ratio*100:.1f}%).")
                                    continue
                                elif target_side == "sell" and (1 - oib_ratio) < min_oib_threshold:
                                    if should_log_alert:
                                        self.logger.info(f"🚫 [OIB Filter] Snipe at {best_wall['price']} rejected! Weak Ask presence ({(1-oib_ratio)*100:.1f}%).")
                                    continue
                                else:
                                    support = oib_ratio if target_side == "buy" else (1-oib_ratio)
                                    self.logger.info(f"📈 [OIB Filter] Orderbook supports {target_side.upper()} with {support*100:.1f}% dominance.")

                            if self.enable_proxy_wall:
                                try:
                                    native_book = await self.public_exchange.fetch_order_book(self.symbol, limit=5)
                                    native_best_bid = native_book['bids'][0][0]
                                    native_best_ask = native_book['asks'][0][0]
                                    native_mid = (native_best_bid + native_best_ask) / 2
                                    await self.execute_snipe(best_wall['price'], target_side, native_mid, native_best_bid, native_best_ask, reason=reason)
                                except Exception as e:
                                    self.logger.warning(f"Error fetching native execution book for proxy snipe: {e}. Falling back to proxy price.")
                                    await self.execute_snipe(best_wall['price'], target_side, mid_price, best_bid, best_ask, reason=reason)
                            else:
                                await self.execute_snipe(best_wall['price'], target_side, mid_price, best_bid, best_ask, reason=reason)
                            self.tracked_walls.clear()
                    
                    # ৪. ভ্যানিশ হওয়া ওয়ালগুলো সরানো (Grace Period: 2 Seconds)
                    spoofed = []
                    for p, data in self.tracked_walls.items():
                        if p not in current_walls:
                            # Allow a 2-second grace period for network lag or partial fills
                            if current_time - data['last_seen'] > 2.0:
                                spoofed.append(p)
                                
                    for p in spoofed:
                        del self.tracked_walls[p]
                
                else:
                    # ৪. রিস্ক ম্যানেজমেন্ট (TSL, TP)
                    if self.enable_proxy_wall and hasattr(self, 'current_native_price') and self.current_native_price:
                        await self.manage_risk(self.current_native_price)
                    else:
                        await self.manage_risk(mid_price)

                if self.enable_proxy_wall and hasattr(self, 'current_native_price') and self.current_native_price:
                    self._publish_status(self.current_native_price)
                else:
                    self._publish_status(mid_price)
                await asyncio.sleep(0.001)

            except Exception as e:
                self.logger.error(f"Futures Hunter Loop Error: {e}")
                await asyncio.sleep(2)

    async def execute_snipe(self, wall_price: float, side: str, current_mid_price: float, best_bid: float = None, best_ask: float = None, reason: str = "Wall Detection", override_order_type: str = None, override_limit_price: float = None):
        """অর্ডার এক্সিকিউট করা"""
        pos_side = "LONG" if side == "buy" else "SHORT"
        try:
            # User explicitly requested STRICT POST-ONLY limit entry mode for all WallHunter Bot entries.
            snipe_order_type = override_order_type if override_order_type else "limit"
            
            if snipe_order_type == "limit":
                if side == "buy":
                    base_limit_price = best_bid if best_bid else current_mid_price
                else:
                    base_limit_price = best_ask if best_ask else current_mid_price
            else:
                if side == "buy":
                    base_limit_price = best_ask if best_ask else current_mid_price
                else:
                    base_limit_price = best_bid if best_bid else current_mid_price
                    
            entry_price = override_limit_price if override_limit_price else base_limit_price

            # --- LIQUIDATION SAFETY GUARD ---
            liq_safety_pct = getattr(self, 'liquidation_safety_pct', 0.0)
            if liq_safety_pct > 0 and self.leverage > 1:
                # Estimate liquidation distance: long liq ≈ entry*(1 - 1/lev), short liq ≈ entry*(1 + 1/lev)
                liq_distance_pct = (1.0 / self.leverage) * 100.0
                if liq_distance_pct < liq_safety_pct:
                    self.logger.info(
                        f"🚫 [Liq Safety] Entry BLOCKED! Estimated liq distance {liq_distance_pct:.1f}% "
                        f"< safety threshold {liq_safety_pct:.1f}% at {self.leverage}x leverage."
                    )
                    return

            # Total Position Size = Amount * Leverage
            total_notional = self.amount_per_trade * self.leverage
            base_amount_tokens = total_notional / entry_price
            
            # Convert tokens to contracts (essential for Kucoin, OKX, Bybit, etc.)
            contract_size = 1.0
            if self.public_exchange and getattr(self.public_exchange, 'markets', None):
                market = self.public_exchange.markets.get(self.symbol, {})
                contract_size = market.get('contractSize', 1.0)
                
            contracts = base_amount_tokens / contract_size
            
            # Fetch minimum contract size from CCXT (usually 1.0)
            min_amount = 1.0
            min_cost = 0.0
            if self.public_exchange and getattr(self.public_exchange, 'markets', None):
                market = self.public_exchange.markets.get(self.symbol, {})
                limits = market.get('limits', {})
                min_amount = limits.get('amount', {}).get('min', 1.0)
                min_cost = limits.get('cost', {}).get('min', 0.0)
                if min_amount is None:
                    min_amount = 1.0
                    
            target_notional = contracts * contract_size * entry_price
            if min_cost and min_cost > 0 and target_notional < min_cost:
                logger.error(f"❌ [FuturesHunter] Snipe Aborted: Target notional ${target_notional:.2f} < Exchange Min Notional ${min_cost:.2f}.")
                return
            
            # Integer rounding for Kucoin/MEXC futures if min_amount is integer-like
            if min_amount >= 1.0:
                base_amount = float(int(contracts))
            else:
                base_amount = float(f"{contracts:.6f}")
                
            if base_amount < min_amount:
                logger.warning(f"Calculated contracts ({base_amount}) < minimum ({min_amount}). Trying to place min_amount, but might fail with Insufficient Balance.")
                base_amount = min_amount
            
            logger.info(f"⚡ [FuturesHunter] Entering {pos_side} at {entry_price} (Amount: {base_amount} contracts)")
            logger.info(f"📝 Reason: {reason}")
            
            if snipe_order_type == "marketable_limit":
                snipe_order_type = "market"
                
            order_params = {"postOnly": True} if snipe_order_type == "limit" else {}
                
            res = await self.engine.execute_trade(side, base_amount, entry_price, order_type=snipe_order_type, params=order_params)
            if res:
                # --- NEW: Partial Fill Management for Entry ---
                if self.buy_order_type in ['limit', 'marketable_limit'] and res.get('id') and not self.is_paper_trading:
                    try:
                        order_status = None
                        for _ in range(10):
                            await asyncio.sleep(1.0)
                            try:
                                order_status = await self.engine.exchange.fetch_order(res['id'], self.symbol)
                                if order_status and order_status.get('status') != 'open':
                                    break
                            except Exception: pass
                            
                        if order_status and order_status.get('status') == 'open':
                            logger.warning(f"⚠️ Entry order {res['id']} is still open! Cancelling remainder...")
                            await self.engine.cancel_order(res['id'])
                            await asyncio.sleep(0.5)
                            
                            final_status = await self.engine.exchange.fetch_order(res['id'], self.symbol)
                            filled = final_status.get('filled', 0.0)
                            
                            if filled <= 0:
                                logger.info(f"❌ Entry order was completely unfilled before cancellation. Aborting snipe.")
                                return
                                
                            logger.info(f"🔄 Partial Fill Detected! Requested: {base_amount}, Filled: {filled}. Adjusting position size.")
                            base_amount_raw = float(self.engine.exchange.amount_to_precision(self.symbol, filled)) if hasattr(self.engine.exchange, 'amount_to_precision') else filled
                            base_amount = base_amount_raw
                            
                            res['average'] = final_status.get('average') or res.get('average')
                            res['price'] = final_status.get('price') or res.get('price')
                    except Exception as e:
                        logger.error(f"Error handling partial fill verification on entry: {e}")
                # ---------------------------------------------
                
                actual_entry = res.get('average') or res.get('price') or entry_price
                
                dynamic_tp_price = None
                if getattr(self, 'enable_wick_sr', False) and getattr(self, 'enable_dynamic_wick_tp', False) and hasattr(self, 'wick_sr_tracker'):
                    dynamic_tp_price = self.wick_sr_tracker.get_dynamic_tp(
                        side=side, 
                        entry_price=actual_entry, 
                        frontrun_pct=getattr(self, 'dynamic_tp_frontrun_pct', 0.0)
                    )
                
                # --- NEW: AUTO FIBO MAX TP EXTENSION ---
                if not dynamic_tp_price and getattr(self, 'enable_auto_fibo_tp', False):
                    try:
                        fibo_tf = getattr(self, 'auto_fibo_timeframe', '5m')
                        fibo_level = getattr(self, 'auto_fibo_target_level', 1.618)
                        fibo_lookback = getattr(self, 'auto_fibo_lookback', 30)
                        
                        ohlcv = await self.public_exchange.fetch_ohlcv(self.symbol, timeframe=fibo_tf, limit=fibo_lookback)
                        if ohlcv:
                            calculated_tp = calculate_fibo_extension_tp(ohlcv, actual_entry, side, float(fibo_level))
                            if calculated_tp:
                                dynamic_tp_price = calculated_tp
                                logger.info(f"🎯 [AUTO-FIBO] Computed Maximum Dynamic TP: {dynamic_tp_price:.6f} at {fibo_level}x Extension!")
                    except Exception as e:
                        logger.error(f"Failed to compute Auto-Fibo TP! Falling back to spread. Err: {e}")
                
                if side == "buy": # LONG
                    sl_price = actual_entry * (1 - (self.initial_risk_pct / 100)) if self.initial_risk_pct > 0 else 0.0
                    if dynamic_tp_price and dynamic_tp_price > actual_entry:
                        tp_price = dynamic_tp_price
                        logger.info(f"🎯 [Dynamic TP] Set to {tp_price:.6f} dynamically!")
                    else:
                        tp_price = actual_entry + self.target_spread
                        if getattr(self, 'enable_dynamic_wick_tp', False) or getattr(self, 'enable_auto_fibo_tp', False):
                            logger.info(f"⚠️ [Dynamic TP] Fallback Spread TP activated: {tp_price:.6f}")
                            
                    self.active_pos = {
                        "entry": float(actual_entry),
                        "amount": base_amount,
                        "sl": sl_price,
                        "tp": tp_price,
                        "side": "long",
                        "breakeven_hit": False,
                        "tsl_activated": False,
                        "entry_order_id": res.get('id')
                    }
                else: # SHORT
                    sl_price = actual_entry * (1 + (self.initial_risk_pct / 100)) if self.initial_risk_pct > 0 else float('inf')
                    if dynamic_tp_price and dynamic_tp_price < actual_entry:
                        tp_price = dynamic_tp_price
                        logger.info(f"🎯 [Dynamic TP] Set to {tp_price:.6f} dynamically!")
                    else:
                        tp_price = actual_entry - self.target_spread
                        if getattr(self, 'enable_dynamic_wick_tp', False) or getattr(self, 'enable_auto_fibo_tp', False):
                            logger.info(f"⚠️ [Dynamic TP] Fallback Spread TP activated: {tp_price:.6f}")
                            
                    self.active_pos = {
                        "entry": float(actual_entry),
                        "amount": base_amount,
                        "sl": sl_price,
                        "tp": tp_price,
                        "side": "short",
                        "breakeven_hit": False,
                        "tsl_activated": False,
                        "entry_order_id": res.get('id')
                    }

                self.extreme_price = actual_entry
                
                # --- NEW: Partial TP1 calculation ---
                if self.enable_micro_scalp:
                    if getattr(self, 'enable_dynamic_atr_scalp', False) and getattr(self, 'current_atr', 0) > 0:
                        atr_distance = self.current_atr * getattr(self, 'micro_scalp_atr_multiplier', 0.5)
                        tick_profit_pct = (atr_distance / actual_entry) if actual_entry > 0 else 0
                        tp_price = actual_entry * (1 + tick_profit_pct) if side == "buy" else actual_entry * (1 - tick_profit_pct)
                    else:
                        tick_profit_pct = self.micro_scalp_profit_ticks * 0.0001
                        tp_price = actual_entry * (1 + tick_profit_pct) if side == "buy" else actual_entry * (1 - tick_profit_pct)
                        
                    # BUG FIX: ATR dynamic SL — use max/min guard so SL never moves against protection
                    if getattr(self, 'enable_dynamic_atr_scalp', False) and getattr(self, 'current_atr', 0) > 0:
                        sl_distance = self.current_atr * getattr(self, 'atr_multiplier', 1.0)
                        sl_pct = (sl_distance / actual_entry) if actual_entry > 0 else 0
                        atr_sl_price = actual_entry * (1 - sl_pct) if side == "buy" else actual_entry * (1 + sl_pct)
                        current_sl = self.active_pos.get('sl', 0)
                        if side == "buy":
                            # For LONG: SL should be as HIGH as possible (closest to entry but still below)
                            self.active_pos['sl'] = max(current_sl, atr_sl_price) if current_sl > 0 else atr_sl_price
                        else:
                            # For SHORT: SL should be as LOW as possible (closest to entry but still above)
                            self.active_pos['sl'] = min(current_sl, atr_sl_price) if current_sl > 0 else atr_sl_price
                        
                    # BUG FIX: include sl_order_id: None to prevent ghost order ID from previous positions
                    self.active_pos.update({
                        "tp": tp_price,
                        "tp1": tp_price, 
                        "tp1_hit": True,
                        "breakeven_hit": False,
                        "limit_order_id": None,
                        "sl_order_id": None  # Clear any stale SL order reference
                    })
                else:
                    if getattr(self, 'partial_tp_trigger_pct', 0.0) > 0:
                        if side == "buy": # LONG
                            tp1_price = actual_entry * (1 + (self.partial_tp_trigger_pct / 100))
                        else: # SHORT
                            tp1_price = actual_entry * (1 - (self.partial_tp_trigger_pct / 100))
                    else:
                        tp_dist = abs(self.active_pos['tp'] - actual_entry)
                        if side == "buy": # LONG
                            tp1_price = actual_entry + (tp_dist * 0.5)
                        else: # SHORT
                            tp1_price = actual_entry - (tp_dist * 0.5)

                    self.active_pos.update({
                        "tp1": tp1_price,
                        "tp1_hit": False,
                        "breakeven_hit": False,
                        "limit_order_id": None,
                        "sl_order_id": None
                    })

                # --- PLACE NATIVE SL ORDER ---
                if getattr(self, 'initial_risk_pct', 0) > 0:
                    exit_side = "sell" if side == "buy" else "buy"
                    sl_type = getattr(self, 'sl_order_type', 'market')
                    try:
                        sl_params = {'reduceOnly': True, 'stopPrice': self.active_pos['sl']}
                        if sl_type in ('limit', 'stop_limit'):
                            # Native Stop-Limit — price-bounded stop order
                            sl_params['price'] = self.active_pos['sl']
                            sl_res = await self.engine.execute_trade(exit_side, base_amount, self.active_pos['sl'], order_type="STOP", params=sl_params)
                        else:
                            # market / soft_limit / default → stop_market (safest native fallback)
                            sl_res = await self.engine.execute_trade(exit_side, base_amount, self.active_pos['sl'], order_type="stop_market", params=sl_params)
                            
                        if sl_res and 'id' in sl_res:
                            self.active_pos['sl_order_id'] = sl_res['id']
                            self.logger.info(f"Placed Native Stop-Loss Order {sl_res['id']} at {self.active_pos['sl']}")
                    except Exception as e:
                        self.logger.error(f"Failed to place Native Stop-Loss order: {e}")

                # --- PLACE LIMIT ORDER ---
                exit_order_type = self.sell_order_type if side == "buy" else self.buy_order_type
                if exit_order_type == 'limit':
                    exit_side = "sell" if side == "buy" else "buy"
                    tp_params = {'reduceOnly': True, 'postOnly': True}
                    limit_res = await self.engine.execute_trade(exit_side, base_amount, self.active_pos['tp'], order_type="limit", params=tp_params)
                    if limit_res and 'id' in limit_res:
                        self.active_pos['limit_order_id'] = limit_res['id']
                        self.logger.info(f"Placed Limit TP Order {limit_res['id']} at {self.active_pos['tp']}")

                self.logger.info(f"✅ Position Opened: {pos_side} | Entry {actual_entry}, SL {self.active_pos['sl']}, TP {self.active_pos['tp']}")
                self._save_state()
                asyncio.create_task(self._send_telegram(
                    f"⚡ WallHunter Entered!\n"
                    f"Pair: {self.symbol}\n"
                    f"Entry {actual_entry:.6f}\n"
                    f"TP1: {self.active_pos['tp1']:.6f}\n"
                    f"Final TP: {self.active_pos['tp']:.6f}\n"
                    f"SL: {self.active_pos['sl']:.6f}"
                ))
                
        except Exception as e:
            self.logger.error(f"Snipe Execution Error: {e}")

    async def manage_risk(self, current_price: float):
        """রিস্ক ম্যানেজমেন্ট (TP/SL/TSL)"""
        if not self.active_pos: return
        
        # --- NEW: Entry Order Guard (Recovery Monitoring) ---
        entry_order_id = self.active_pos.get('entry_order_id')
        if entry_order_id and not self.is_paper_trading:
            try:
                status = await self.private_exchange.fetch_order(entry_order_id, self.symbol)
                if status and status.get('status') in ['open', 'new']:
                    # Exit early, waiting for entry fill
                    return
                elif status and status.get('status') in ['closed', 'filled']:
                    self.logger.info(f"✅ Futures Entry Order {entry_order_id} filled. Enabling risk management.")
                    self.active_pos['entry'] = status.get('average') or status.get('price') or self.active_pos['entry']
                    self.active_pos['amount'] = status.get('filled') or self.active_pos['amount']
                    self.active_pos.pop('entry_order_id', None)
                    self._save_state()
                elif status and status.get('status') in ['canceled', 'cancelled', 'expired']:
                    filled = status.get('filled', 0.0)
                    if filled > 0:
                        self.logger.info(f"⚠️ Futures Entry Order {entry_order_id} was cancelled but partially filled ({filled}).")
                        self.active_pos['amount'] = filled
                        self.active_pos.pop('entry_order_id', None)
                        self._save_state()
                    else:
                        self.logger.warning(f"🗑️ Futures Entry Order {entry_order_id} cancelled with zero fill. Discarding position state.")
                        self._clear_state()
                        self.active_pos = None
                        return
            except Exception as e:
                logger.warning(f"⚠️ Could not verify Futures entry order {entry_order_id}: {e}")
                return
        # ----------------------------------------------------

        # --- NEW: SL Limit Order Guard (Recovery/Pending Fill Monitoring) ---
        sl_limit_order_id = self.active_pos.get('sl_limit_order_id')
        if sl_limit_order_id and not self.is_paper_trading:
            try:
                status = await self.engine.exchange.fetch_order(sl_limit_order_id, self.symbol)
                if status and status.get('status') in ['open', 'new']:
                    # --- AUTO-CHASE MAKER RULE ---
                    chase_interval = 2.0
                    if not hasattr(self, '_last_sl_chase_time') or time.time() - self._last_sl_chase_time > chase_interval:
                        self._last_sl_chase_time = time.time()
                        try:
                            from app.services.market_depth_service import market_depth_service
                            limit_size = market_depth_service._normalize_order_book_limit(self.exchange_id, 5) if hasattr(market_depth_service, '_normalize_order_book_limit') else 5
                            ob = await self.public_exchange.fetch_order_book(self.symbol, limit=limit_size)
                            best_bid = ob['bids'][0][0] if ob['bids'] else 0
                            best_ask = ob['asks'][0][0] if ob['asks'] else 0
                            
                            exit_side = "sell" if self.active_pos.get('side', 'long') == "long" else "buy"
                            target_price = best_bid if exit_side == "buy" else best_ask
                            
                            current_order_price = float(status.get('price', 0))
                            
                            if current_order_price > 0 and target_price > 0 and current_order_price != target_price:
                                logger.info(f"🏃 Auto-Chase: Limit SL price ({current_order_price}) left behind! Cancelling to chase {target_price}")
                                try:
                                    await self.engine.cancel_order(sl_limit_order_id)
                                except Exception: pass
                                self.active_pos.pop('sl_limit_order_id', None)
                                self._save_state()
                                return # Next tick will re-assess and replace
                        except Exception as e:
                            logger.debug(f"Auto-chase check failed: {e}")
                    return # Exit early, don't execute actions yet while SL is pending on book

                elif status and status.get('status') in ['closed', 'filled']:
                    logger.info(f"✅ Strict Limit SL {sl_limit_order_id} has filled!")
                    # Treat same as standard exit
                    filled_price = status.get('average') or status.get('price') or self.active_pos['sl']
                    sell_amount = status.get('filled') or self.active_pos['amount']
                    
                    if self.active_pos.get('side', 'long') == "long":
                        pnl_val = (filled_price - self.active_pos['entry']) * sell_amount
                    else:
                        pnl_val = (self.active_pos['entry'] - filled_price) * sell_amount
                        
                    self.total_realized_pnl += pnl_val
                    self.total_executed_orders += 1
                    
                    await self._send_telegram(f"🛡️ Futures EXIT - Stopped out via Limit Maker!\nPair: {self.symbol}\nExit Price: {filled_price:.6f}\n💰 Trade PnL: ${pnl_val:.2f}\n\n📊 Total PnL: ${self.total_realized_pnl:.2f}")
                    self._clear_state()
                    self.active_pos = None
                    return
                elif status and status.get('status') in ['canceled', 'cancelled', 'expired', 'rejected']:
                    filled = status.get('filled', 0.0)
                    if filled > 0:
                        logger.info(f"⚠️ Limit SL Order completely broken but partial fill ({filled}). Discarding position state to sync.")
                    else:
                        logger.warning(f"🗑️ Limit SL Order {sl_limit_order_id} was {status.get('status')}. You may need to manual exit.")
                    self._clear_state()
                    self.active_pos = None
                    return
            except Exception as e:
                logger.warning(f"⚠️ Could not verify SL Limit order {sl_limit_order_id}: {e}")
                return
        # -----------------------------------------------------------------

        side = self.active_pos['side']
        exit_order_type = self.sell_order_type if side == "long" else self.buy_order_type

        # --- NEW: Supertrend Maker-to-Taker Fallback Dual-Exit ---
        supertrend_reversal = False
        if getattr(self, 'enable_supertrend_exit', False) and getattr(self, 'supertrend_tracker', None):
            # Check for reversal based on mode. Reversal to opposite direction means exit.
            if side == "long":
                if self.supertrend_tracker.is_entry_signal('sell'):
                    supertrend_reversal = True
            else:
                if self.supertrend_tracker.is_entry_signal('buy'):
                    supertrend_reversal = True
                    
        if supertrend_reversal and not self.active_pos.get('fallback_exit_in_progress'):
            self.logger.warning(f"🚨 Supertrend Reversal Detected! Triggering Maker-to-Taker Exit.")
            self.active_pos['fallback_exit_in_progress'] = True
            self._save_state()
            asyncio.create_task(self._execute_fallback_exit(current_price))
            return
        # ---------------------------------------------------------

        # 1. Check if the limit TP order has already been filled by the exchange
        if exit_order_type == 'limit' and self.active_pos.get('limit_order_id') and not self.is_paper_trading:
            try:
                order_status = await self.private_exchange.fetch_order(self.active_pos['limit_order_id'], self.symbol)
                if order_status and order_status.get('status') == 'closed':
                    filled_price = order_status.get('average') or order_status.get('price') or self.active_pos['tp']
                    executed_amount = order_status.get('filled') or self.active_pos.get('amount')
                    
                    if side == "long":
                        pnl_val = (filled_price - self.active_pos['entry']) * executed_amount
                    else:
                        pnl_val = (self.active_pos['entry'] - filled_price) * executed_amount
                        
                    self.total_realized_pnl += pnl_val
                    self.total_executed_orders += 1
                    if pnl_val > 0:
                        self.total_wins += 1
                    else:
                        self.total_losses += 1
                        
                    await self._send_telegram(f"🎯 Futures EXIT - Limit TP Filled!\nPair: {self.symbol}\nExit Price: {filled_price:.6f}\n💰 Trade PnL: ${pnl_val:.2f}\n\n📊 Total PnL: ${self.total_realized_pnl:.2f}\n🏆 Wins: {self.total_wins} | 💔 Losses: {self.total_losses}")
                    self.logger.info(f"✅ Limit TP Order {self.active_pos['limit_order_id']} was filled by exchange at {filled_price}")
                    
                    # CANCEL DANGLING NATIVE SL
                    if self.active_pos.get('sl_order_id'):
                        try:
                            await self.engine.cancel_order(self.active_pos['sl_order_id'])
                            self.logger.info(f"🧹 Cleaned up hanging Native SL Order {self.active_pos['sl_order_id']} after TP Fill.")
                        except Exception as e:
                            self.logger.warning(f"Failed to clean up Native SL Order: {e}")
                            
                    self._clear_state()
                    self.active_pos = None
                    return
            except Exception as e:
                logger.warning(f"Error checking limit order status: {e}")

        # Trailing Stop Update
        state_changed = False
        if side == "long":
            if current_price > self.extreme_price:
                self.extreme_price = current_price
                
                # Check TSL Activation
                activation_pct = getattr(self, 'tsl_activation_pct', 0.0)
                if activation_pct > 0 and not self.active_pos.get('tsl_activated'):
                    trigger = self.active_pos['entry'] * (1 + (activation_pct / 100))
                    if current_price >= trigger:
                        self.active_pos['tsl_activated'] = True
                        self.logger.info(f"🚀 Trailing SL Activated for LONG at {current_price:.6f}!")
                
                if activation_pct == 0.0 or self.active_pos.get('tsl_activated'):
                    old_sl = self.active_pos['sl']
                    if getattr(self, 'enable_ut_trailing_sl', False) and getattr(self, 'ut_bot_tracker', None):
                        ut_sl = self.ut_bot_tracker.get_dynamic_trailing_sl("long")
                        if ut_sl > 0:
                            self.active_pos['sl'] = max(self.active_pos['sl'], ut_sl)
                    elif getattr(self, 'enable_supertrend_trailing_sl', False) and getattr(self, 'supertrend_tracker', None):
                        st_sl = self.supertrend_tracker.get_dynamic_trailing_sl("long")
                        if st_sl > 0:
                            self.active_pos['sl'] = max(self.active_pos['sl'], st_sl)
                    elif self.atr_sl_enabled and getattr(self, 'current_atr', 0) > 0:
                        atr_sl = self.extreme_price - (self.current_atr * self.atr_multiplier)
                        if getattr(self, 'tsl_pct', 0.0) > 0:
                            new_sl = self.extreme_price * (1 - (self.tsl_pct / 100))
                            new_sl = max(new_sl, atr_sl)
                        else:
                            new_sl = atr_sl
                        self.active_pos['sl'] = max(self.active_pos['sl'], new_sl)
                    elif getattr(self, 'tsl_pct', 0.0) > 0:
                        new_sl = self.extreme_price * (1 - (self.tsl_pct / 100))
                        self.active_pos['sl'] = max(self.active_pos['sl'], new_sl)
                        
                    # Update Exchange Native SL if moved by at least 0.2%
                    if self.active_pos['sl'] > old_sl and self.active_pos.get('sl_order_id'):
                        pct_change = ((self.active_pos['sl'] - old_sl) / old_sl * 100) if old_sl > 0 else 100.0
                        if pct_change >= 0.2:
                            state_changed = True
                            try:
                                await self.engine.cancel_order(self.active_pos['sl_order_id'])
                                _tsl_sl_type = getattr(self, 'sl_order_type', 'market')
                                _tsl_order_type = "STOP" if _tsl_sl_type in ('limit', 'stop_limit') else "stop_market"
                                sl_params = {'reduceOnly': True, 'stopPrice': self.active_pos['sl']}
                                if _tsl_sl_type in ('limit', 'stop_limit'):
                                    sl_params['price'] = self.active_pos['sl']
                                sl_res = await self.engine.execute_trade("sell", self.active_pos['amount'], self.active_pos['sl'], order_type=_tsl_order_type, params=sl_params)
                                if sl_res and 'id' in sl_res:
                                    self.active_pos['sl_order_id'] = sl_res['id']
                                    logger.info(f"🔄 Native TSL Exchange Update: LONG SL moved to {self.active_pos['sl']:.6f}")
                            except Exception as e: pass
        else: # short
            if current_price < self.extreme_price or self.extreme_price == 0:
                self.extreme_price = current_price
                
                # Check TSL Activation
                activation_pct = getattr(self, 'tsl_activation_pct', 0.0)
                if activation_pct > 0 and not self.active_pos.get('tsl_activated'):
                    trigger = self.active_pos['entry'] * (1 - (activation_pct / 100))
                    if current_price <= trigger:
                        self.active_pos['tsl_activated'] = True
                        logger.info(f"🚀 Trailing SL Activated for SHORT at {current_price:.6f}!")
                
                if activation_pct == 0.0 or self.active_pos.get('tsl_activated'):
                    old_sl = self.active_pos['sl']
                    if getattr(self, 'enable_ut_trailing_sl', False) and getattr(self, 'ut_bot_tracker', None):
                        ut_sl = self.ut_bot_tracker.get_dynamic_trailing_sl("short")
                        if ut_sl > 0:
                            self.active_pos['sl'] = min(self.active_pos['sl'], ut_sl)
                    elif getattr(self, 'enable_supertrend_trailing_sl', False) and getattr(self, 'supertrend_tracker', None):
                        st_sl = self.supertrend_tracker.get_dynamic_trailing_sl("short")
                        if st_sl > 0:
                            self.active_pos['sl'] = min(self.active_pos['sl'], st_sl)
                    elif self.atr_sl_enabled and getattr(self, 'current_atr', 0) > 0:
                        atr_sl = self.extreme_price + (self.current_atr * self.atr_multiplier)
                        if getattr(self, 'tsl_pct', 0.0) > 0:
                            new_sl = self.extreme_price * (1 + (self.tsl_pct / 100))
                            new_sl = min(new_sl, atr_sl)
                        else:
                            new_sl = atr_sl
                        self.active_pos['sl'] = min(self.active_pos['sl'], new_sl)
                    elif getattr(self, 'tsl_pct', 0.0) > 0:
                        new_sl = self.extreme_price * (1 + (self.tsl_pct / 100))
                        self.active_pos['sl'] = min(self.active_pos['sl'], new_sl)
                        
                    # Update Exchange Native SL if moved by at least 0.2%
                    if self.active_pos['sl'] < old_sl and self.active_pos.get('sl_order_id'):
                        pct_change = ((old_sl - self.active_pos['sl']) / old_sl * 100) if old_sl > 0 else 100.0
                        if pct_change >= 0.2:
                            state_changed = True
                            try:
                                await self.engine.cancel_order(self.active_pos['sl_order_id'])
                                _tsl_sl_type = getattr(self, 'sl_order_type', 'market')
                                _tsl_order_type = "STOP" if _tsl_sl_type in ('limit', 'stop_limit') else "stop_market"
                                sl_params = {'reduceOnly': True, 'stopPrice': self.active_pos['sl']}
                                if _tsl_sl_type in ('limit', 'stop_limit'):
                                    sl_params['price'] = self.active_pos['sl']
                                sl_res = await self.engine.execute_trade("buy", self.active_pos['amount'], self.active_pos['sl'], order_type=_tsl_order_type, params=sl_params)
                                if sl_res and 'id' in sl_res:
                                    self.active_pos['sl_order_id'] = sl_res['id']
                                    logger.info(f"🔄 Native TSL Exchange Update: SHORT SL moved to {self.active_pos['sl']:.6f}")
                            except Exception as e: pass

        # --- NEW: Independent Breakeven SL Logic ---
        if getattr(self, 'sl_breakeven_trigger_pct', 0.0) > 0 and not self.active_pos.get('breakeven_hit'):
            entry = self.active_pos['entry']
            if side == "long":
                trigger_price = entry * (1 + (self.sl_breakeven_trigger_pct / 100))
                if current_price >= trigger_price:
                    new_breakeven_sl = entry * (1 + (self.sl_breakeven_target_pct / 100))
                    if new_breakeven_sl > self.active_pos['sl']:
                        self.active_pos['sl'] = new_breakeven_sl
                        self.active_pos['breakeven_hit'] = True
                        logger.info(f"🛡️ Set LONG SL to Risk-Free Breakeven at {new_breakeven_sl:.6f}")
                        
                        # UPDATE NATIVE SL ORDER
                        if self.active_pos.get('sl_order_id'):
                            try:
                                await self.engine.cancel_order(self.active_pos['sl_order_id'])
                                _be_sl_type = getattr(self, 'sl_order_type', 'market')
                                _be_order_type = "STOP" if _be_sl_type in ('limit', 'stop_limit') else "stop_market"
                                sl_params = {'reduceOnly': True, 'stopPrice': new_breakeven_sl}
                                if _be_sl_type in ('limit', 'stop_limit'):
                                    sl_params['price'] = new_breakeven_sl
                                sl_res = await self.engine.execute_trade("sell", self.active_pos['amount'], new_breakeven_sl, order_type=_be_order_type, params=sl_params)
                                if sl_res and 'id' in sl_res:
                                    self.active_pos['sl_order_id'] = sl_res['id']
                            except Exception as e: pass
                            
                        asyncio.create_task(self._send_telegram(f"🛡️ Stop-Loss moved to Risk-Free!\nPair: {self.symbol}\nNew SL: {new_breakeven_sl:.6f}"))
            else: # short
                trigger_price = entry * (1 - (self.sl_breakeven_trigger_pct / 100))
                if current_price <= trigger_price:
                    new_breakeven_sl = entry * (1 - (self.sl_breakeven_target_pct / 100))
                    if new_breakeven_sl < self.active_pos['sl']:
                        self.active_pos['sl'] = new_breakeven_sl
                        self.active_pos['breakeven_hit'] = True
                        logger.info(f"🛡️ Set SHORT SL to Risk-Free Breakeven at {new_breakeven_sl:.6f}")
                        
                        # UPDATE NATIVE SL ORDER
                        if self.active_pos.get('sl_order_id'):
                            try:
                                await self.engine.cancel_order(self.active_pos['sl_order_id'])
                                _be_sl_type = getattr(self, 'sl_order_type', 'market')
                                _be_order_type = "STOP" if _be_sl_type in ('limit', 'stop_limit') else "stop_market"
                                sl_params = {'reduceOnly': True, 'stopPrice': new_breakeven_sl}
                                if _be_sl_type in ('limit', 'stop_limit'):
                                    sl_params['price'] = new_breakeven_sl
                                sl_res = await self.engine.execute_trade("buy", self.active_pos['amount'], new_breakeven_sl, order_type=_be_order_type, params=sl_params)
                                if sl_res and 'id' in sl_res:
                                    self.active_pos['sl_order_id'] = sl_res['id']
                            except Exception as e: pass
                            
                        asyncio.create_task(self._send_telegram(f"🛡️ Stop-Loss moved to Risk-Free!\nPair: {self.symbol}\nNew SL: {new_breakeven_sl:.6f}"))

        # TP / SL চেক
        should_exit = False
        reason = ""
        
        if side == "long":
            # Scale-Out (Partial TP1)
            if self.partial_tp_pct > 0 and not self.active_pos.get('tp1_hit') and current_price >= self.active_pos['tp1']:
                await self.execute_partial_close(current_price)
                return

            if current_price >= self.active_pos['tp']:
                if exit_order_type == 'limit' and self.active_pos.get('limit_order_id') and not self.is_paper_trading:
                    pass # Exchange will natively fill the limit order
                else:
                    should_exit = True
                    reason = "Take Profit"
            elif current_price <= self.active_pos['sl']:
                should_exit = True
                reason = "Stop Loss"
        else: # short
            # Scale-Out (Partial TP1)
            if self.partial_tp_pct > 0 and not self.active_pos.get('tp1_hit') and current_price <= self.active_pos['tp1']:
                await self.execute_partial_close(current_price)
                return

            if current_price <= self.active_pos['tp']:
                if exit_order_type == 'limit' and self.active_pos.get('limit_order_id') and not self.is_paper_trading:
                    pass # Exchange will natively fill the limit order
                else:
                    should_exit = True
                    reason = "Take Profit"
            elif current_price >= self.active_pos['sl']:
                should_exit = True
                reason = "Stop Loss"

        if should_exit:
            logger.info(f"🚩 Exiting {side.upper()} Position: {reason} at {current_price}")
            
            sell_amount_raw = self.active_pos['amount']
            
            # Cancel open limit order if SL/TSL hits
            if exit_order_type == 'limit' and self.active_pos.get('limit_order_id'):
                canceled = False
                for attempt in range(5):
                    try:
                        logger.info(f"Attempting to cancel Limit TP Order {self.active_pos['limit_order_id']} before explicit Futures exit (Attempt {attempt+1}/5)")
                        cancel_success = await self.engine.cancel_order(self.active_pos['limit_order_id'])
                        if cancel_success:
                            canceled = True
                            break
                        else:
                            try:
                                status = await self.engine.exchange.fetch_order(self.active_pos['limit_order_id'], self.symbol)
                                if status and status.get('status') in ['canceled', 'cancelled', 'closed']:
                                    logger.info("Order check: Order is already closed or cancelled.")
                                    canceled = True
                                    break
                            except Exception: pass
                    except Exception as e:
                        err_str = str(e).lower()
                        if "-2011" in err_str or "unknown order" in err_str or "ordernotfound" in err_str:
                            logger.info("Order check: Order is already closed or cancelled (Unknown Order).")
                            canceled = True
                            break
                        logger.warning(f"Failed to cancel Limit TP Order on attempt {attempt+1}: {e}")
                    await asyncio.sleep(0.5)

                if canceled:
                    try:
                        logger.info("Successfully cancelled Limit TP Order due to Stop Loss hit/Emergency Sell.")
                        await asyncio.sleep(0.5)
                        
                        if not self.is_paper_trading:
                            cancelled_status = await self.engine.exchange.fetch_order(self.active_pos['limit_order_id'], self.symbol)
                            filled = cancelled_status.get('filled', 0.0)
                            if filled > 0:
                                logger.info(f"🔄 Open Limit Order was partially filled ({filled}). Adjusting Exit sweep amount.")
                                filled_proper = float(self.engine.exchange.amount_to_precision(self.symbol, filled)) if hasattr(self.engine.exchange, 'amount_to_precision') else filled
                                sell_amount_raw = max(0.0, self.active_pos['amount'] - filled_proper)
                                
                                if sell_amount_raw <= 0:
                                    logger.info("✅ Partial fill actually completely closed out the remaining position. Exit sweep aborted.")
                                    await self._send_telegram(f"🏁 *{side.upper()} Closed* via Partial Fill Sweep\nPair: {self.symbol}")
                                    self._clear_state()
                                    self.active_pos = None
                                    return
                    except Exception as e:
                        logger.error(f"Error fetching filled status of cancelled limit order: {e}")
                else:
                    logger.error("🚨 CRITICAL: Could not cancel Limit TP order after 5 attempts! Order remains locked on exchange.")
                    logger.warning("Emergency Action: Aborting Futures Market exit sweep. Will retry in the next loop.")
                    return

            # Cancel open Native SL order if SL/TSL hits manually
            if self.active_pos.get('sl_order_id'):
                try:
                    await self.engine.cancel_order(self.active_pos['sl_order_id'])
                    logger.info("Successfully cancelled Native SL Order.")
                except Exception as e:
                    pass
            
            # ফিউচার ক্লোজের জন্য বিপরীত অর্ডার
            exit_side = "sell" if side == "long" else "buy"
            
            exit_order_type_actual = exit_order_type
            if exit_order_type_actual == "marketable_limit":
                exit_order_type_actual = "market"

            # TP/SL/TSL are always market-type execution unless explicit limit
            
            # --- NEW: Advanced SL Execution Routing ---
            res = None
            if reason == "Stop Loss":
                sl_exec_type = getattr(self, 'sl_order_type', 'market')
                
                if sl_exec_type == 'market':
                    res = await self.engine.execute_trade(exit_side, sell_amount_raw, current_price, order_type="market", params={'reduceOnly': True})
                elif sl_exec_type == 'limit':
                    try:
                        from app.services.market_depth_service import market_depth_service
                        limit_size = market_depth_service._normalize_order_book_limit(self.exchange_id, 5) if hasattr(market_depth_service, '_normalize_order_book_limit') else 5
                        ob = await self.public_exchange.fetch_order_book(self.symbol, limit=limit_size)
                        best_bid = ob['bids'][0][0] if ob['bids'] else current_price
                        best_ask = ob['asks'][0][0] if ob['asks'] else current_price
                    except Exception as e:
                        logger.warning(f"Could not fetch precise order book for Limit SL, falling back: {e}")
                        best_bid = current_price
                        best_ask = current_price
                        
                    target_maker_price = best_bid if exit_side == "buy" else best_ask
                    
                    logger.info(f"🛡️ Executing Futures SL with STRICT Limit (Maker) targeting exactly {target_maker_price}")
                    limit_sl_res = await self.engine.execute_trade(exit_side, sell_amount_raw, target_maker_price, order_type="limit", params={'reduceOnly': True, 'postOnly': True})
                    if limit_sl_res and limit_sl_res.get('id'):
                        self.active_pos['sl_limit_order_id'] = limit_sl_res.get('id')
                    else:
                        logger.warning("SL Limit Maker order rejected by exchange! Will auto-retry on next tick.")
                elif sl_exec_type == 'soft_limit':
                    logger.info(f"🛡️ Executing Futures SL with Soft Limit Maker at {current_price}")
                    limit_sl_res = await self.engine.execute_trade(exit_side, sell_amount_raw, current_price, order_type="limit", params={'reduceOnly': True, 'postOnly': True})
                    if limit_sl_res and limit_sl_res.get('id'):
                        logger.info(f"⏳ Waiting 3 seconds for Soft Limit SL {limit_sl_res['id']} to fill...")
                        for _ in range(8):
                            await asyncio.sleep(0.4)
                            try:
                                check = await self.engine.exchange.fetch_order(limit_sl_res['id'], self.symbol)
                                if check and check.get('status') != 'open': break
                            except Exception: pass
                        
                        final_check = await self.engine.exchange.fetch_order(limit_sl_res['id'], self.symbol)
                        if final_check and final_check.get('status') == 'open':
                            logger.warning("Futures Soft Limit SL did not fill in time! Fallback to Market.")
                            await self.engine.cancel_order(limit_sl_res['id'])
                            await asyncio.sleep(0.5)
                            
                            cancelled_check = await self.engine.exchange.fetch_order(limit_sl_res['id'], self.symbol)
                            rem_filled = cancelled_check.get('filled', 0.0)
                            rem_amount_raw = sell_amount_raw - rem_filled
                            if rem_amount_raw > 0:
                                sweep_amt = float(self.engine.exchange.amount_to_precision(self.symbol, rem_amount_raw)) if hasattr(self.engine.exchange, 'amount_to_precision') else rem_amount_raw
                                res = await self.engine.execute_trade(exit_side, sweep_amt, current_price, order_type="market", params={'reduceOnly': True})
                        else:
                            res = final_check
                    else:
                        logger.warning("Soft Limit placement failed. Fallback to Market.")
                        res = await self.engine.execute_trade(exit_side, sell_amount_raw, current_price, order_type="market", params={'reduceOnly': True})
                elif sl_exec_type == 'stop_limit':
                    slip_pct = 0.001
                    bounded_price = current_price * (1 - slip_pct) if exit_side == "sell" else current_price * (1 + slip_pct)
                    logger.info(f"🛡️ Executing Futures SL with Stop-Limit Slippage Bound constraint. Target: {bounded_price}")
                    res = await self.engine.execute_trade(exit_side, sell_amount_raw, bounded_price, order_type="limit", params={'reduceOnly': True})
                    if not res or not res.get('id'):
                        res = await self.engine.execute_trade(exit_side, sell_amount_raw, current_price, order_type="market", params={'reduceOnly': True})

                if sl_exec_type == 'limit' and not res:
                    if self.active_pos.get('sl_limit_order_id'):
                        logger.info("Futures Strict Limit SL order placed. Ending loop tick to wait.")
                    self._save_state()
                    return
            else:
                actual_type = exit_order_type_actual if exit_order_type_actual != "limit" else "market"
                res = await self.engine.execute_trade(exit_side, sell_amount_raw, current_price, order_type=actual_type, params={'reduceOnly': True})
            
            # --- NEW: Partial Fill Management for Active Exits ---
            if res and res.get('id') and not self.is_paper_trading:
                try:
                    order_status = None
                    for _ in range(5):
                        await asyncio.sleep(0.4)
                        try:
                            order_status = await self.engine.exchange.fetch_order(res['id'], self.symbol)
                            if order_status and order_status.get('status') != 'open': break
                        except Exception: pass
                        
                    if order_status and order_status.get('status') == 'open':
                        logger.warning(f"⚠️ Exit Futures order {res['id']} is hanging open! Cancelling remainder...")
                        await self.engine.cancel_order(res['id'])
                        await asyncio.sleep(0.5)
                        
                        final_status = await self.engine.exchange.fetch_order(res['id'], self.symbol)
                        filled = final_status.get('filled', 0.0)
                        
                        filled_proper = float(self.engine.exchange.amount_to_precision(self.symbol, filled)) if hasattr(self.engine.exchange, 'amount_to_precision') else filled
                        remaining_base = max(0.0, sell_amount_raw - filled_proper)
                        
                        if remaining_base > 0:
                            logger.info(f"🧹 Sweeping Futures remainder at Pure Market: {remaining_base} {self.symbol}")
                            sweep_amount = float(self.engine.exchange.amount_to_precision(self.symbol, remaining_base))
                            await self.engine.execute_trade(exit_side, sweep_amount, current_price, order_type="market", params={'reduceOnly': True})
                            logger.info("✅ Market sweep completed.")
                except Exception as e:
                    logger.error(f"Error checking Futures partial fill sweep: {e}")
            # ----------------------------------------------------
            
            if res:
                actual_exit_price = current_price
                if not self.is_paper_trading:
                    try:
                        if 'final_status' in locals() and final_status and final_status.get('average'):
                            actual_exit_price = float(final_status['average'])
                        elif res.get('average'):
                            actual_exit_price = float(res['average'])
                    except Exception: pass
                    
                pnl_val = (actual_exit_price - self.active_pos['entry']) * sell_amount_raw if side == "long" else (self.active_pos['entry'] - actual_exit_price) * sell_amount_raw
                self.total_realized_pnl += pnl_val
                self.total_executed_orders += 1
                if pnl_val > 0:
                    self.total_wins += 1
                else:
                    self.total_losses += 1
                
                logger.info(f"✅ {side.upper()} Position Closed: {reason}")
                await self._send_telegram(f"🏁 *{side.upper()} Closed* ({reason})\nPrice: {current_price}\nPair: {self.symbol}\n💰 Trade PnL: ${pnl_val:.2f}\n\n📊 Total PnL: ${self.total_realized_pnl:.2f}\n🏆 Wins: {self.total_wins} | 💔 Losses: {self.total_losses}")
                self._clear_state()
                self.active_pos = None

    async def execute_partial_close(self, current_price: float):
        """TP1 এ পজিশনের একাংশ ক্লোজ করা এবং SL ব্রেক-ইভেনে আনা"""
        side = self.active_pos['side']
        entry = self.active_pos['entry']
        amount = self.active_pos['amount']
        exit_order_type = self.sell_order_type if side == "long" else self.buy_order_type
        
        sell_amount_raw = amount * (self.partial_tp_pct / 100)
        
        # Determine precision and limits based on market config
        min_amount = 1.0
        min_cost = 0.0
        contract_size = 1.0
        if self.public_exchange and getattr(self.public_exchange, 'markets', None):
            market = self.public_exchange.markets.get(self.symbol, {})
            min_amount = market.get('limits', {}).get('amount', {}).get('min', 1.0)
            if min_amount is None: min_amount = 1.0
            min_cost = market.get('limits', {}).get('cost', {}).get('min', 0.0)
            contract_size = market.get('contractSize', 1.0)

        # --- Min Notional Check (Dust Position Preventer) ---
        remaining_raw = amount - sell_amount_raw
        if min_cost and min_cost > 0:
            remaining_value = remaining_raw * contract_size * current_price
            if remaining_value < min_cost:
                logger.warning(f"Dust Prevented: Remaining value ${remaining_value:.2f} < Min Notional ${min_cost:.2f}. Partial TP upgrading to 100% close.")
                sell_amount_raw = amount
        # ----------------------------------------------------

        if min_amount >= 1.0:
            sell_amount = float(int(sell_amount_raw))
        else:
            sell_amount = float(f"{sell_amount_raw:.6f}")
            
        if sell_amount < min_amount:
            logger.warning(f"Partial TP amount {sell_amount_raw} is less than minimum {min_amount}. Skipping Partial TP.")
            self.active_pos['tp1_hit'] = True
            return
            
        logger.info(f"🔓 [PARTIAL TP] Closing {sell_amount} contracts ({self.partial_tp_pct}% logic) of {side.upper()} at {current_price}")
        
        exit_side = "sell" if side == "long" else "buy"
        
        # Force Market Taker for Partial TP to prevent execution freezes
        res = await self.engine.execute_trade(exit_side, sell_amount, current_price, order_type="market", params={'reduceOnly': True})
        if res: logger.info(f"Executed MARKET Taker Order for guaranteed Partial TP at {current_price}")
            
        # Update Limit order to prevent over-selling
        if res and exit_order_type == 'limit' and self.active_pos.get('limit_order_id'):
            try:
                await self.engine.cancel_order(self.active_pos['limit_order_id'])
                remain_amount = self.active_pos['amount'] - sell_amount
                if remain_amount > 0.00000001:
                    limit_res = await self.engine.execute_trade(exit_side, remain_amount, self.active_pos['tp'], order_type="limit", params={'reduceOnly': True, 'postOnly': True})
                    if limit_res and 'id' in limit_res:
                        self.active_pos['limit_order_id'] = limit_res['id']
            except Exception as e:
                logger.error(f"Failed to update Limit order after TP1: {e}")

        # Update Native Stop-Loss order
        if res and self.active_pos.get('sl_order_id'):
            try:
                await self.engine.cancel_order(self.active_pos['sl_order_id'])
                remain_amount = self.active_pos['amount'] - sell_amount
                if remain_amount > 0.00000001:
                    sl_params = {'reduceOnly': True, 'stopPrice': self.active_pos['sl']}
                    sl_res = await self.engine.execute_trade(exit_side, remain_amount, self.active_pos['sl'], order_type="stop_market", params=sl_params)
                    if sl_res and 'id' in sl_res:
                        self.active_pos['sl_order_id'] = sl_res['id']
            except Exception as e:
                logger.error(f"Failed to update Native SL order after TP1: {e}")
        
        if res:
            pnl_val = (current_price - entry) * sell_amount if side == "long" else (entry - current_price) * sell_amount
            self.total_realized_pnl += pnl_val
            
            self.active_pos['amount'] -= sell_amount
            
            if self.active_pos['amount'] <= 0.00000001:
                self.total_executed_orders += 1
                if pnl_val > 0:
                    self.total_wins += 1
                else:
                    self.total_losses += 1
                    
                logger.info(f"✅ TP1 Full Output Completed. Dust position was prevented.")
                await self._send_telegram(f"🎯 *Full TP Hit at TP1!* (Dust Prevented)\n💰 Trade PnL: ${pnl_val:.2f}\n\n📊 Total PnL: ${self.total_realized_pnl:.2f}\n🏆 Wins: {self.total_wins} | 💔 Losses: {self.total_losses}")
                self._clear_state()
                self.active_pos = None
            else:
                self.active_pos['tp1_hit'] = True
                self._save_state()
                logger.info(f"✅ Partial TP Completed. Remaining: {self.active_pos['amount']}, SL: {self.active_pos['sl']}")
                await self._send_telegram(f"🔓 *Partial TP1 Hit!* ({self.partial_tp_pct}%)\nRemaining amount running.")
        else:
            logger.warning("❌ Partial TP execution failed. Marking tp1_hit as True to prevent infinite loop spam, position size unchanged.")
            self.active_pos['tp1_hit'] = True

    async def _execute_fallback_exit(self, current_price: float):
        """
        Executes a Maker-to-Taker fallback exit when Supertrend reversal triggers for Futures.
        It cancels any existing TP limit orders, places a Maker exit order at the current Best Bid/Ask,
        waits `supertrend_exit_timeout` seconds, and if unfilled, sweeps at Market.
        """
        if not self.active_pos or self.is_paper_trading: return
        
        try:
            side = self.active_pos['side']
            
            # 1. Cancel existing limit TP order if it exists
            limit_id = self.active_pos.get('limit_order_id')
            if limit_id:
                try:
                    await self.engine.cancel_order(limit_id)
                    logger.info(f"🗑️ Cancelled existing Limit TP {limit_id} for Dual-Exit.")
                except Exception as e:
                    logger.warning(f"⚠️ Could not cancel existing TP {limit_id} (may have just filled): {e}")
                    
            sl_id = self.active_pos.get('sl_order_id')
            if sl_id:
                try:
                    await self.engine.cancel_order(sl_id)
                except Exception: pass
            
            # 2. Fetch current best bid/ask to place a Maker order
            limit_size = market_depth_service._normalize_order_book_limit(self.exchange_id, 5) if hasattr(market_depth_service, '_normalize_order_book_limit') else 5
            ob = await self.public_exchange.fetch_order_book(self.symbol, limit=limit_size)
            best_bid = ob['bids'][0][0] if ob['bids'] else current_price
            best_ask = ob['asks'][0][0] if ob['asks'] else current_price
            
            close_side = "sell" if side == "long" else "buy"
            # For maker exit: Long exit = Sell = ask side. Short exit = Buy = bid side.
            maker_price = best_ask if close_side == "sell" else best_bid
            amount = self.active_pos['amount']
            
            logger.info(f"🛡️ Dual-Exit Step 1: Placing Futures Maker {close_side.upper()} order at {maker_price:.6f}")
            maker_res = await self.engine.execute_trade(close_side, amount, maker_price, order_type="limit", params={"postOnly": True, "reduceOnly": True})
            
            if not maker_res or not maker_res.get('id'):
                logger.error("❌ Failed to place Maker exit order. Aborting Fallback, reverting to next Risk tick.")
                self.active_pos['fallback_exit_in_progress'] = False
                self._save_state()
                return
                
            fallback_id = maker_res['id']
            timeout_sec = getattr(self, 'supertrend_exit_timeout', 5)
            
            # 3. Wait up to timeout amount
            logger.info(f"⏳ Waiting {timeout_sec}s for Maker Fallback Exit ({fallback_id}) to fill...")
            filled = False
            for step in range(timeout_sec * 2): # Check every 0.5 sec
                await asyncio.sleep(0.5)
                try:
                    status = await self.engine.exchange.fetch_order(fallback_id, self.symbol)
                    if status and status.get('status') in ['closed', 'filled']:
                        logger.info("✅ Maker Fallback Exit filled completely!")
                        filled = True
                        break
                except Exception: pass
            
            # 4. If not completely filled by timeout, cancel remainder and Sweep
            if not filled:
                try:
                    status = await self.engine.exchange.fetch_order(fallback_id, self.symbol)
                    if status and status.get('status') == 'open':
                        logger.warning(f"⚠️ Fallback Maker order {fallback_id} timed out. Cancelling and sweeping remainder...")
                        await self.engine.cancel_order(fallback_id)
                        await asyncio.sleep(0.5)
                        
                        final_status = await self.engine.exchange.fetch_order(fallback_id, self.symbol)
                        filled_amt = final_status.get('filled', 0.0)
                        
                        min_amount = 0.00000001
                        if hasattr(self.public_exchange, 'markets') and self.public_exchange.markets:
                            market = self.public_exchange.markets.get(self.symbol, {})
                            min_amount = market.get('limits', {}).get('amount', {}).get('min', 0.00000001)

                        filled_proper = float(self.engine.exchange.amount_to_precision(self.symbol, filled_amt)) if (hasattr(self.engine.exchange, 'amount_to_precision') and filled_amt >= min_amount) else filled_amt
                        remaining_base = max(0.0, amount - filled_proper)

                        if remaining_base >= min_amount:
                            logger.info(f"🧹 Sweeping remainder at TAKER (Market): {remaining_base} {self.symbol}")
                            sweep_amount = float(self.engine.exchange.amount_to_precision(self.symbol, remaining_base)) if hasattr(self.engine.exchange, 'amount_to_precision') else remaining_base
                            await self.engine.execute_trade(close_side, sweep_amount, maker_price, order_type="market", params={"reduceOnly": True})
                            logger.info("✅ Taker sweep completed.")
                        else:
                            logger.info(f"✨ Remaining balance {remaining_base} is below exchange minimum ({min_amount}). Considering position closed.")
                except Exception as e:
                    logger.error(f"Error during Maker-to-Taker fallback sweep: {e}")
                    
            # 5. Calculate final position PnL and cleanup
            await asyncio.sleep(1.0)
            
            if side == "short":
                pnl_val = (self.active_pos['entry'] - maker_price) * amount
            else:
                pnl_val = (maker_price - self.active_pos['entry']) * amount
                
            self.total_realized_pnl += pnl_val
            self.total_executed_orders += 1
            if pnl_val > 0:
                self.total_wins += 1
            else:
                self.total_losses += 1
                
            await self._send_telegram(f"⚡ Futures EXIT - Supertrend Fallback Hit!\nPair: {self.symbol}\nMode: {side.upper()}\n💰 Trade PnL: ${pnl_val:.2f}\n\n📊 Total PnL: ${self.total_realized_pnl:.2f}\n🏆 Wins: {self.total_wins} | 💔 Losses: {self.total_losses}")
            self._clear_state()
            self.active_pos = None
            
        except Exception as e:
            logger.error(f"Critical error in Fallback Exit loop: {e}")
            if self.active_pos:
                self.active_pos['fallback_exit_in_progress'] = False
                self._save_state()

    def _publish_status(self, current_price: float):
        try:
            pnl_val = 0.0
            pnl_pct = 0.0
            if self.active_pos:
                entry = self.active_pos['entry']
                side = self.active_pos['side']
                if side == "long":
                    pnl_val = (current_price - entry) * self.active_pos['amount']
                    pnl_pct = ((current_price - entry) / entry) * 100
                else:
                    pnl_val = (entry - current_price) * self.active_pos['amount']
                    pnl_pct = ((entry - current_price) / entry) * 100

            status_payload = {
                "id": self.bot_id,
                "status": "active" if self.running else "inactive",
                "pnl": round(pnl_val, 2),
                "pnl_percent": round(pnl_pct, 2),
                "total_pnl": float(f"{self.total_realized_pnl:.2f}"),
                "total_orders": self.total_executed_orders,
                "total_wins": self.total_wins,
                "total_losses": self.total_losses,
                "price": current_price,
                "position": self.active_pos is not None,
                "entry_price": self.active_pos['entry'] if self.active_pos else 0,
                "sl_price": self.active_pos['sl'] if self.active_pos and self.active_pos['sl'] != float('inf') else 0.0,
                "tp_price": self.active_pos['tp'] if self.active_pos else 0,
                "trading_mode": "futures",
                "side": self.active_pos['side'] if self.active_pos else None,
                "absorption_delta": float(f"{self.absorption_tracker.get_current_delta():.2f}"),
                "is_absorbing": self.absorption_tracker.is_absorption_detected('buy') or self.absorption_tracker.is_absorption_detected('sell')
            }
            self.redis.publish(f"bot_status:{self.bot_id}", json.dumps(status_payload))
        except Exception:
            pass

    async def stop(self):
        """বট স্টপ করার জন্য রিসোর্স ক্লিনআপ"""
        self.running = False
        logger.info(f"🛑 [FuturesHunter {self.bot_id}] Stopping...")
        
        # --- FIX: Task Memory Leak / CPU Spike Prevention ---
        for task_attr in ['_main_task', '_heartbeat_task', '_vpvr_task', '_atr_task', '_liq_task', '_trades_task', '_btc_task', '_wick_sr_task']:
            task = getattr(self, task_attr, None)
            if task and not task.done():
                try:
                    task.cancel()
                except Exception as e:
                    logger.error(f"Error cancelling task {task_attr}: {e}")
                    
        if hasattr(self, 'btc_correlation_tracker') and self.btc_correlation_tracker:
            try:
                await self.btc_correlation_tracker.stop()
            except: pass
            
        try:
            if self.public_exchange: await self.public_exchange.close()
            if self.private_exchange: await self.private_exchange.close()
        except: pass
        
        logger.info(f"🔴 [FuturesHunter {self.bot_id}] Stopped.")
        await self._send_telegram(f"🔴 Futures Bot [ID: {self.bot_id}] Stopped.")

    async def emergency_sell(self, sell_type: str):
        """Emergency liquidate the active position."""
        if not self.active_pos:
            logger.info(f"No active position to emergency sell for bot {self.bot_id}")
            return
            
        side = self.active_pos['side']
        amount = self.active_pos['amount']
        
        # Determine current market price
        try:
            limit = market_depth_service._normalize_order_book_limit(self.exchange_id, 5)
            ob = await self.public_exchange.fetch_order_book(self.symbol, limit=limit)
            best_bid = ob['bids'][0][0] if ob['bids'] else 0
            best_ask = ob['asks'][0][0] if ob['asks'] else 0
            current_price = (best_bid + best_ask) / 2 if best_bid and best_ask else best_bid or best_ask
        except Exception as e:
            logger.warning(f"Could not fetch precise price for emergency sell: {e}")
            self.logger.warning(f"Could not fetch precise price for emergency sell: {e}")
            current_price = self.active_pos['entry']

        # Cancel any open limit orders first
        if self.sell_order_type == 'limit' and self.active_pos.get('limit_order_id'):
            try:
                await self.engine.cancel_order(self.active_pos['limit_order_id'])
                self.logger.info(f"Cancelled open limit order {self.active_pos['limit_order_id']} for emergency sell.")
            except Exception as e:
                self.logger.warning(f"Failed to cancel open limit order during emergency sell: {e}")

        # Determine exit side
        exit_side = "sell" if side == "long" else "buy"
        
        self.logger.info(f"🚨 [EMERGENCY] Closing {side.upper()} position for bot {self.bot_id} via {sell_type.upper()}")
        
        actual_type = sell_type
        if actual_type == "marketable_limit":
            actual_type = "market"
            
        res = await self.engine.execute_trade(exit_side, amount, current_price, order_type=actual_type)
        if res:
            pnl_val = (current_price - self.active_pos['entry']) * amount if side == "long" else (self.active_pos['entry'] - current_price) * amount
            
            self.total_realized_pnl += pnl_val
            self.total_executed_orders += 1
            if pnl_val > 0:
                self.total_wins += 1
            else:
                self.total_losses += 1
                
            await self._send_telegram(f"🚨 *EMERGENCY EXIT* triggered!\nPair: {self.symbol}\nSide: {side.upper()}\nExit Price: {current_price}\n💰 Trade PnL: ${pnl_val:.2f}\n\n📊 Total PnL: ${self.total_realized_pnl:.2f}\n🏆 Wins: {self.total_wins} | 💔 Losses: {self.total_losses}")
            self.active_pos = None
            self.logger.info(f"✅ Emergency exit completed.")

    def update_config(self, new_config: dict):
        """Update strategy parameters dynamically."""
        self.logger.info(f"🔄 [FuturesHunter {self.bot_id}] Live config update: {new_config}")
        
        # --- Trading Session Live Update ---
        if "trading_sessions" in new_config and new_config["trading_sessions"] != self.trading_sessions:
            old_sessions = self.trading_sessions
            self.trading_sessions = new_config["trading_sessions"]
            self.logger.info(f"🕒 [Session] Trading sessions updated: {old_sessions} → {self.trading_sessions}")
            if getattr(self, 'session_tracker', None):
                asyncio.create_task(self.session_tracker.stop_monitor())
            from app.strategies.helpers.trading_session_filter import TradingSessionTracker as _TST
            self.session_tracker = _TST(
                bot_instance=self,
                session_names=self.trading_sessions,
                on_session_end=self._on_trading_session_end
            )
            asyncio.create_task(self.session_tracker.start_monitor())
        
        updates = []
        if "partial_tp_pct" in new_config and new_config["partial_tp_pct"] != getattr(self, "partial_tp_pct", 50.0):
            updates.append(f"Partial TP: {getattr(self, 'partial_tp_pct', 50.0)}% -> {new_config['partial_tp_pct']}%")
            self.partial_tp_pct = new_config.get("partial_tp_pct")
            
        if "partial_tp_trigger_pct" in new_config and new_config["partial_tp_trigger_pct"] != getattr(self, "partial_tp_trigger_pct", 0.0):
            old_trigger = getattr(self, "partial_tp_trigger_pct", 0.0)
            updates.append(f"Partial TP Trigger: {old_trigger}% -> {new_config['partial_tp_trigger_pct']}%")
            self.partial_tp_trigger_pct = new_config.get("partial_tp_trigger_pct")
            
        if "sl_breakeven_trigger_pct" in new_config and new_config["sl_breakeven_trigger_pct"] != getattr(self, "sl_breakeven_trigger_pct", 0.0):
            old_trigger = getattr(self, "sl_breakeven_trigger_pct", 0.0)
            updates.append(f"Breakeven Trigger: {old_trigger}% -> {new_config['sl_breakeven_trigger_pct']}%")
            self.sl_breakeven_trigger_pct = new_config.get("sl_breakeven_trigger_pct")
            
        if "sl_breakeven_target_pct" in new_config and new_config["sl_breakeven_target_pct"] != getattr(self, "sl_breakeven_target_pct", 0.0):
            old_target = getattr(self, "sl_breakeven_target_pct", 0.0)
            updates.append(f"Breakeven Target: {old_target}% -> {new_config['sl_breakeven_target_pct']}%")
            self.sl_breakeven_target_pct = new_config.get("sl_breakeven_target_pct")
            
        if "vol_threshold" in new_config:
            updates.append(f"Vol Threshold: {self.vol_threshold} -> {new_config['vol_threshold']}")
            self.vol_threshold = new_config["vol_threshold"]
        
        if "target_spread" in new_config:
            updates.append(f"Spread: {self.target_spread} -> {new_config['target_spread']}")
            self.target_spread = new_config["target_spread"]
            
        if "risk_pct" in new_config:
            updates.append(f"Risk: {self.initial_risk_pct}% -> {new_config['risk_pct']}%")
            self.initial_risk_pct = new_config["risk_pct"]
            
        if "trailing_stop" in new_config:
            updates.append(f"TSL: {self.tsl_pct}% -> {new_config['trailing_stop']}%")
            self.tsl_pct = new_config["trailing_stop"]

        if "tsl_activation_pct" in new_config and new_config["tsl_activation_pct"] != getattr(self, "tsl_activation_pct", 0.0):
            updates.append(f"TSL Activation: {getattr(self, 'tsl_activation_pct', 0.0)}% -> {new_config['tsl_activation_pct']}%")
            self.tsl_activation_pct = new_config.get("tsl_activation_pct")

        if "leverage" in new_config:
            updates.append(f"Leverage: {self.leverage}x -> {new_config['leverage']}x")
            self.leverage = new_config["leverage"]
            # Apply leverage to exchange live
            asyncio.create_task(self.private_exchange.set_leverage(self.leverage, self.symbol))

        if "amount_per_trade" in new_config:
            updates.append(f"Amount: {self.amount_per_trade} -> {new_config['amount_per_trade']}")
            self.amount_per_trade = new_config["amount_per_trade"]

        if "sell_order_type" in new_config:
            updates.append(f"Order Type: {self.sell_order_type} -> {new_config['sell_order_type']}")
            self.sell_order_type = new_config["sell_order_type"]

        if "sl_order_type" in new_config and new_config["sl_order_type"] != getattr(self, "sl_order_type", "market"):
            updates.append(f"SL Order Type: {getattr(self, 'sl_order_type', 'market')} -> {new_config['sl_order_type']}")
            self.sl_order_type = new_config.get("sl_order_type")

        if "ob_imbalance_ratio" in new_config:
            updates.append(f"OB Ratio: {self.ob_imbalance_ratio} -> {new_config['ob_imbalance_ratio']}")
            self.ob_imbalance_ratio = new_config["ob_imbalance_ratio"]

        if "liq_threshold" in new_config:
            updates.append(f"Liq Threshold: {self.liq_threshold} -> {new_config['liq_threshold']}")
            self.liq_threshold = new_config["liq_threshold"]

        if "btc_correlation_threshold" in new_config:
            updates.append(f"BTC Corr Threshold: {self.btc_correlation_threshold} -> {new_config['btc_correlation_threshold']}")
            self.btc_correlation_threshold = new_config.get("btc_correlation_threshold")
            if self.btc_correlation_tracker: self.btc_correlation_tracker.update_params(threshold=self.btc_correlation_threshold)

        if "btc_time_window" in new_config:
            updates.append(f"BTC Time Window: {self.btc_time_window}m -> {new_config['btc_time_window']}m")
            self.btc_time_window = new_config.get("btc_time_window")
            if self.btc_correlation_tracker: self.btc_correlation_tracker.update_params(window_minutes=self.btc_time_window)

        if "btc_min_move_pct" in new_config:
            updates.append(f"BTC Min Move %: {self.btc_min_move_pct}% -> {new_config['btc_min_move_pct']}%")
            self.btc_min_move_pct = new_config.get("btc_min_move_pct")
            if self.btc_correlation_tracker: self.btc_correlation_tracker.update_params(min_move_pct=self.btc_min_move_pct)
        
        if "enable_btc_correlation" in new_config:
            status = "ON" if new_config["enable_btc_correlation"] else "OFF"
            updates.append(f"BTC Correlation Filter: {status}")
            self.enable_btc_correlation = new_config.get("enable_btc_correlation")
            if self.enable_btc_correlation and self.btc_correlation_tracker:
                asyncio.create_task(self.btc_correlation_tracker.start())
            elif not self.enable_btc_correlation and self.btc_correlation_tracker:
                asyncio.create_task(self.btc_correlation_tracker.stop())

        # --- Smart Wick SR Live Updates ---
        if "enable_wick_sr" in new_config and new_config["enable_wick_sr"] != self.enable_wick_sr:
            status = "ON" if new_config["enable_wick_sr"] else "OFF"
            updates.append(f"Wick SR Trigger: {status}")
            self.enable_wick_sr = new_config.get("enable_wick_sr")
            if self.enable_wick_sr:
                if not getattr(self, "wick_sr_tracker", None):
                    self.wick_sr_tracker = WickSRTracker(
                        timeframe=self.wick_sr_timeframe,
                        sweep_threshold_candles=self.wick_sr_sweep_threshold,
                        min_touches=self.wick_sr_min_touches
                    )
                if hasattr(self, '_wick_sr_task') and not self._wick_sr_task:
                    self.wick_sr_listener.tracker = self.wick_sr_tracker
                    self._wick_sr_task = asyncio.create_task(self.wick_sr_listener.start())
            else:
                if hasattr(self, 'wick_sr_listener') and self.wick_sr_listener.running:
                    asyncio.create_task(self.wick_sr_listener.stop())

        if "wick_sr_timeframe" in new_config and new_config["wick_sr_timeframe"] != getattr(self, "wick_sr_timeframe", "1m"):
            updates.append(f"Wick SR Timeframe: {getattr(self, 'wick_sr_timeframe', '1m')} -> {new_config['wick_sr_timeframe']}")
            self.wick_sr_timeframe = new_config.get("wick_sr_timeframe")
            if getattr(self, "wick_sr_tracker", None):
                self.wick_sr_tracker.timeframe = self.wick_sr_timeframe

        if "wick_sr_modes" in new_config and new_config["wick_sr_modes"] != getattr(self, "wick_sr_modes", []):
            updates.append(f"Wick SR Modes Updated: {new_config['wick_sr_modes']}")
            self.wick_sr_modes = new_config.get("wick_sr_modes")

        if "wick_sr_sweep_threshold" in new_config and new_config["wick_sr_sweep_threshold"] != getattr(self, "wick_sr_sweep_threshold", 3):
            self.wick_sr_sweep_threshold = new_config.get("wick_sr_sweep_threshold")
            if getattr(self, "wick_sr_tracker", None):
                self.wick_sr_tracker.sweep_threshold_candles = self.wick_sr_sweep_threshold

        if "wick_sr_min_touches" in new_config and new_config["wick_sr_min_touches"] != getattr(self, "wick_sr_min_touches", 10):
            self.wick_sr_min_touches = new_config.get("wick_sr_min_touches")
            if getattr(self, "wick_sr_tracker", None):
                self.wick_sr_tracker.min_touches = self.wick_sr_min_touches

        if "enable_wick_sr_oib" in new_config and new_config["enable_wick_sr_oib"] != getattr(self, "enable_wick_sr_oib", False):
            self.enable_wick_sr_oib = new_config.get("enable_wick_sr_oib", False)
            updates.append(f"Wick SR OIB Confluence: {'ON' if self.enable_wick_sr_oib else 'OFF'}")
            
        if "enable_dynamic_wick_tp" in new_config and new_config["enable_dynamic_wick_tp"] != getattr(self, "enable_dynamic_wick_tp", False):
            self.enable_dynamic_wick_tp = new_config.get("enable_dynamic_wick_tp", False)
            updates.append(f"Dynamic Wick TP: {'ON' if self.enable_dynamic_wick_tp else 'OFF'}")
            
        if "dynamic_tp_frontrun_pct" in new_config and new_config["dynamic_tp_frontrun_pct"] != getattr(self, "dynamic_tp_frontrun_pct", 0.0):
            self.dynamic_tp_frontrun_pct = new_config.get("dynamic_tp_frontrun_pct", 0.0)
            updates.append(f"Dynamic TP Front-Run: {self.dynamic_tp_frontrun_pct}%")
            
        if "enable_auto_fibo_tp" in new_config and new_config["enable_auto_fibo_tp"] != getattr(self, "enable_auto_fibo_tp", False):
            self.enable_auto_fibo_tp = new_config.get("enable_auto_fibo_tp", False)
            updates.append(f"Auto-Fibo Max TP: {'ON' if self.enable_auto_fibo_tp else 'OFF'}")
            
        if "auto_fibo_target_level" in new_config and new_config["auto_fibo_target_level"] != getattr(self, "auto_fibo_target_level", 1.618):
            self.auto_fibo_target_level = new_config.get("auto_fibo_target_level", 1.618)
            updates.append(f"Auto-Fibo Target Level: {self.auto_fibo_target_level}")

        if "auto_fibo_timeframe" in new_config and new_config["auto_fibo_timeframe"] != getattr(self, "auto_fibo_timeframe", "5m"):
            self.auto_fibo_timeframe = new_config.get("auto_fibo_timeframe", "5m")
            updates.append(f"Auto-Fibo Timeframe: {self.auto_fibo_timeframe}")
            
        if "auto_fibo_lookback" in new_config and new_config["auto_fibo_lookback"] != getattr(self, "auto_fibo_lookback", 30):
            self.auto_fibo_lookback = new_config.get("auto_fibo_lookback", 30)
            updates.append(f"Auto-Fibo Lookback: {self.auto_fibo_lookback}")

        if updates:
            self.config.update(new_config)
            
            # --- Sync internal parameters ---
            if "partial_tp_pct" in new_config: self.partial_tp_pct = new_config["partial_tp_pct"]
            if "vpvr_enabled" in new_config:
                self.vpvr_enabled = new_config["vpvr_enabled"]
                # Manage task lifecycle on toggle
                if self.vpvr_enabled:
                    if getattr(self, '_vpvr_task', None) and not self._vpvr_task.done():
                        self._vpvr_task.cancel()
                    self._vpvr_task = asyncio.create_task(self._vpvr_updater_loop())
                    self.logger.info(f"📊 [VPVR] Live-enabled: VPVR updater task started.")
                else:
                    if getattr(self, '_vpvr_task', None) and not self._vpvr_task.done():
                        self._vpvr_task.cancel()
                    self.top_hvns = []
                    self.logger.info(f"📊 [VPVR] Live-disabled: VPVR task stopped, HVNs cleared.")

            if "vpvr_tolerance" in new_config: self.vpvr_tolerance = new_config["vpvr_tolerance"]
            if "atr_sl_enabled" in new_config:
                self.atr_sl_enabled = new_config["atr_sl_enabled"]
                any_atr_needed = self.atr_sl_enabled or getattr(self, 'enable_dynamic_atr_scalp', False)
                if any_atr_needed:
                    if getattr(self, '_atr_task', None) and not self._atr_task.done():
                        self._atr_task.cancel()
                    self._atr_task = asyncio.create_task(self._atr_updater_loop())
                    self.logger.info(f"📈 [ATR] Live-enabled: ATR updater task started.")
                else:
                    if getattr(self, '_atr_task', None) and not self._atr_task.done():
                        self._atr_task.cancel()
                    self.current_atr = 0.0
                    self.logger.info(f"📈 [ATR] Live-disabled: ATR task stopped, current_atr reset.")

            if "enable_wall_trigger" in new_config: self.enable_wall_trigger = new_config["enable_wall_trigger"]
            if "enable_liq_trigger" in new_config: self.enable_liq_trigger = new_config["enable_liq_trigger"]
            if "liq_threshold" in new_config: self.liq_threshold = new_config["liq_threshold"]
            if "liq_target_side" in new_config: self.liq_target_side = new_config["liq_target_side"].lower()
            if "enable_ob_imbalance" in new_config: self.enable_ob_imbalance = new_config["enable_ob_imbalance"]
            if "ob_imbalance_ratio" in new_config: self.ob_imbalance_ratio = new_config["ob_imbalance_ratio"]
            if "enable_liq_cascade" in new_config: self.enable_liq_cascade = new_config["enable_liq_cascade"]
            if "liq_cascade_window" in new_config: self.liq_cascade_window = new_config["liq_cascade_window"]
            if "enable_dynamic_liq" in new_config: self.enable_dynamic_liq = new_config["enable_dynamic_liq"]
            if "dynamic_liq_multiplier" in new_config: self.dynamic_liq_multiplier = new_config["dynamic_liq_multiplier"]
            if "micro_scalp_min_wall" in new_config: self.micro_scalp_min_wall = new_config["micro_scalp_min_wall"]
            if "enable_micro_scalp" in new_config: self.enable_micro_scalp = new_config["enable_micro_scalp"]
            if "micro_scalp_profit_ticks" in new_config: self.micro_scalp_profit_ticks = new_config["micro_scalp_profit_ticks"]
            if "enable_dynamic_atr_scalp" in new_config: self.enable_dynamic_atr_scalp = new_config["enable_dynamic_atr_scalp"]
            if "micro_scalp_atr_multiplier" in new_config: self.micro_scalp_atr_multiplier = new_config["micro_scalp_atr_multiplier"]
            if "enable_btc_correlation" in new_config: self.enable_btc_correlation = new_config["enable_btc_correlation"]
            if "btc_correlation_threshold" in new_config: self.btc_correlation_threshold = new_config["btc_correlation_threshold"]
            if "btc_time_window" in new_config: self.btc_time_window = new_config["btc_time_window"]
            if "btc_min_move_pct" in new_config: self.btc_min_move_pct = new_config["btc_min_move_pct"]
            if "dynamic_liq_multiplier" in new_config: self.dynamic_liq_multiplier = new_config["dynamic_liq_multiplier"]
            if "follow_btc_liq" in new_config: self.follow_btc_liq = new_config["follow_btc_liq"]
            if "btc_liq_threshold" in new_config: self.btc_liq_threshold = new_config["btc_liq_threshold"]
            
            # CVD Absorption Sync
            if "enable_absorption" in new_config: self.enable_absorption = new_config["enable_absorption"]
            if "absorption_threshold" in new_config: 
                self.absorption_threshold = new_config["absorption_threshold"]
                self.absorption_tracker.update_params(threshold=self.absorption_threshold)
            if "absorption_window" in new_config:
                self.absorption_window = new_config["absorption_window"]
                self.absorption_tracker.update_params(window_seconds=self.absorption_window)
            
            if "enable_iceberg_trigger" in new_config: self.enable_iceberg_trigger = new_config["enable_iceberg_trigger"]
            if "iceberg_time_window_secs" in new_config: 
                self.iceberg_time_window_secs = new_config["iceberg_time_window_secs"]
                self.iceberg_tracker.update_params(window_seconds=self.iceberg_time_window_secs)
            if "iceberg_min_absorbed_vol" in new_config:
                self.iceberg_min_absorbed_vol = new_config["iceberg_min_absorbed_vol"]
                self.iceberg_tracker.update_params(min_absorbed_vol=self.iceberg_min_absorbed_vol)

            # --- Adaptive Trend Filter Live Sync ---
            if "enable_trend_filter" in new_config:
                self.enable_trend_filter = new_config["enable_trend_filter"]
                updates.append(f"Adaptive Trend Filter: {'ON' if self.enable_trend_filter else 'OFF'}")
                if self.enable_trend_filter and not self.trend_finder:
                    # Lazy-init if toggled ON without a restart
                    self.trend_finder = AdaptiveTrendFinder(
                        lookback=self.trend_filter_lookback,
                        threshold=self.trend_filter_threshold
                    )
                elif not self.enable_trend_filter:
                    self.trend_finder = None

            if "trend_filter_lookback" in new_config:
                self.trend_filter_lookback = new_config["trend_filter_lookback"]
                updates.append(f"Trend Lookback: {self.trend_filter_lookback}")
                if self.trend_finder:
                    self.trend_finder.update_params(lookback=self.trend_filter_lookback)

            if "trend_filter_threshold" in new_config:
                self.trend_filter_threshold = new_config["trend_filter_threshold"]
                updates.append(f"Trend Min Confidence: {self.trend_filter_threshold}")
                if self.trend_finder:
                    self.trend_finder.update_params(threshold=self.trend_filter_threshold)

            # --- UT Bot Alerts Live Sync ---
            if "enable_ut_trend_filter" in new_config:
                self.enable_ut_trend_filter = new_config["enable_ut_trend_filter"]
                updates.append(f"UT Trend Filter: {'ON' if self.enable_ut_trend_filter else 'OFF'}")
            if "enable_ut_entry_trigger" in new_config:
                self.enable_ut_entry_trigger = new_config["enable_ut_entry_trigger"]
                updates.append(f"UT Entry Trigger: {'ON' if self.enable_ut_entry_trigger else 'OFF'}")
            if "enable_ut_trailing_sl" in new_config:
                self.enable_ut_trailing_sl = new_config["enable_ut_trailing_sl"]
                updates.append(f"UT Trailing SL: {'ON' if self.enable_ut_trailing_sl else 'OFF'}")
            if "enable_ut_trend_unlock_mode" in new_config:
                self.ut_trend_unlock_mode = new_config["enable_ut_trend_unlock_mode"]

            ut_params = {}
            if "ut_bot_sensitivity" in new_config and new_config["ut_bot_sensitivity"] != self.ut_bot_sensitivity:
                updates.append(f"UT Key Value: {self.ut_bot_sensitivity} → {new_config['ut_bot_sensitivity']}")
                self.ut_bot_sensitivity = new_config["ut_bot_sensitivity"]
                ut_params['sensitivity'] = self.ut_bot_sensitivity
            if "ut_bot_atr_period" in new_config and new_config["ut_bot_atr_period"] != self.ut_bot_atr_period:
                updates.append(f"UT ATR Period: {self.ut_bot_atr_period} → {new_config['ut_bot_atr_period']}")
                self.ut_bot_atr_period = new_config["ut_bot_atr_period"]
                ut_params['atr_period'] = self.ut_bot_atr_period
            if "ut_bot_timeframe" in new_config and new_config["ut_bot_timeframe"] != self.ut_bot_timeframe:
                updates.append(f"UT Timeframe: {self.ut_bot_timeframe} → {new_config['ut_bot_timeframe']}")
                self.ut_bot_timeframe = new_config["ut_bot_timeframe"]
                ut_params['timeframe'] = self.ut_bot_timeframe
            if "ut_bot_use_heikin_ashi" in new_config and new_config["ut_bot_use_heikin_ashi"] != self.ut_bot_use_heikin_ashi:
                self.ut_bot_use_heikin_ashi = new_config["ut_bot_use_heikin_ashi"]
                ut_params['use_heikin_ashi'] = self.ut_bot_use_heikin_ashi
            if "ut_bot_candle_close" in new_config:
                self.ut_bot_candle_close = new_config["ut_bot_candle_close"]
            if "ut_bot_validation_secs" in new_config:
                self.ut_bot_validation_secs = new_config["ut_bot_validation_secs"]
            if "ut_bot_retest_snipe" in new_config:
                self.ut_bot_retest_snipe = new_config["ut_bot_retest_snipe"]

            any_ut_enabled = self.enable_ut_trend_filter or self.enable_ut_entry_trigger or self.enable_ut_trailing_sl
            if any_ut_enabled:
                if not getattr(self, 'ut_bot_tracker', None):
                    from app.strategies.helpers.ut_bot_tracker import UTBotTracker
                    self.ut_bot_tracker = UTBotTracker(
                        exchange_id=self.exchange_id, symbol=self.symbol,
                        sensitivity=self.ut_bot_sensitivity, atr_period=self.ut_bot_atr_period,
                        use_heikin_ashi=self.ut_bot_use_heikin_ashi, timeframe=self.ut_bot_timeframe)
                    if hasattr(self, '_utbot_task'):
                        self._utbot_task = asyncio.create_task(self.ut_bot_tracker.start())
                elif ut_params:
                    self.ut_bot_tracker.update_params(**ut_params)
            else:
                if getattr(self, 'ut_bot_tracker', None):
                    asyncio.create_task(self.ut_bot_tracker.stop())
                    self.ut_bot_tracker = None

            # --- Supertrend Alerts Live Sync ---
            if "enable_supertrend_trend_filter" in new_config:
                self.enable_supertrend_trend_filter = new_config["enable_supertrend_trend_filter"]
                updates.append(f"ST Trend Filter: {'ON' if self.enable_supertrend_trend_filter else 'OFF'}")
            if "enable_supertrend_entry_trigger" in new_config:
                self.enable_supertrend_entry_trigger = new_config["enable_supertrend_entry_trigger"]
                updates.append(f"ST Entry Trigger: {'ON' if self.enable_supertrend_entry_trigger else 'OFF'}")
            if "enable_supertrend_trailing_sl" in new_config:
                self.enable_supertrend_trailing_sl = new_config["enable_supertrend_trailing_sl"]
                updates.append(f"ST Trailing SL: {'ON' if self.enable_supertrend_trailing_sl else 'OFF'}")
            if "enable_supertrend_exit" in new_config:
                self.enable_supertrend_exit = new_config["enable_supertrend_exit"]
                updates.append(f"ST Exit Signal: {'ON' if self.enable_supertrend_exit else 'OFF'}")
            if "enable_supertrend_trend_unlock_mode" in new_config:
                self.supertrend_trend_unlock_mode = new_config["enable_supertrend_trend_unlock_mode"]
            if "supertrend_exit_timeout" in new_config:
                self.supertrend_exit_timeout = new_config["supertrend_exit_timeout"]
            if "supertrend_candle_close" in new_config:
                self.supertrend_candle_close = new_config["supertrend_candle_close"]

            st_params = {}
            if "supertrend_period" in new_config and new_config["supertrend_period"] != self.supertrend_period:
                updates.append(f"ST ATR Period: {self.supertrend_period} → {new_config['supertrend_period']}")
                self.supertrend_period = new_config["supertrend_period"]
                st_params['atr_period'] = self.supertrend_period
            if "supertrend_multiplier" in new_config and new_config["supertrend_multiplier"] != self.supertrend_multiplier:
                updates.append(f"ST Multiplier: {self.supertrend_multiplier} → {new_config['supertrend_multiplier']}")
                self.supertrend_multiplier = new_config["supertrend_multiplier"]
                st_params['multiplier'] = self.supertrend_multiplier
            if "supertrend_timeframe" in new_config and new_config["supertrend_timeframe"] != self.supertrend_timeframe:
                updates.append(f"ST Timeframe: {self.supertrend_timeframe} → {new_config['supertrend_timeframe']}")
                self.supertrend_timeframe = new_config["supertrend_timeframe"]
                st_params['timeframe'] = self.supertrend_timeframe

            any_st_enabled = self.enable_supertrend_trend_filter or self.enable_supertrend_entry_trigger or self.enable_supertrend_trailing_sl or self.enable_supertrend_exit
            if any_st_enabled:
                if not getattr(self, 'supertrend_tracker', None):
                    from app.strategies.helpers.supertrend_tracker import SupertrendTracker
                    self.supertrend_tracker = SupertrendTracker(
                        exchange_id=self.exchange_id, symbol=self.symbol,
                        atr_period=self.supertrend_period, multiplier=self.supertrend_multiplier,
                        timeframe=self.supertrend_timeframe)
                    if hasattr(self, '_supertrend_task'):
                        self._supertrend_task = asyncio.create_task(self.supertrend_tracker.start())
                elif st_params:
                    self.supertrend_tracker.update_params(**st_params)
            else:
                if getattr(self, 'supertrend_tracker', None):
                    asyncio.create_task(self.supertrend_tracker.stop())
                    self.supertrend_tracker = None

            asyncio.create_task(self._send_telegram(f"⚙️ *Live Config Update*\n{self.symbol} Futures Bot\n\n" + "\n".join([f"• {u}" for u in updates])))

    async def _vpvr_updater_loop(self):
        """VPVR High Volume Nodes আপডেট করবে (প্রতি ৫ মিনিটে)"""
        while self.running:
            if not self.vpvr_enabled:
                await asyncio.sleep(60)
                continue
            try:
                ohlcv = await self.public_exchange.fetch_ohlcv(self.symbol, timeframe='5m', limit=100)
                if ohlcv:
                    low_prices  = [c[3] for c in ohlcv]
                    high_prices = [c[2] for c in ohlcv]
                    vols        = [c[5] for c in ohlcv]

                    min_p, max_p = min(low_prices), max(high_prices)

                    if max_p == min_p:          # flat market guard
                        await asyncio.sleep(300)
                        continue

                    bins = 50
                    step = (max_p - min_p) / bins
                    profile = [0.0] * bins

                    for i, c in enumerate(ohlcv):
                        c_low, c_high, c_vol = c[3], c[2], c[5]
                        c_mid = (c_low + c_high) / 2   # use midpoint, not close
                        idx = int((c_mid - min_p) / step)
                        if idx >= bins: idx = bins - 1
                        profile[idx] += c_vol

                    top_indices = sorted(range(bins), key=lambda i: profile[i], reverse=True)[:3]
                    self.top_hvns = [min_p + (i * step) + (step / 2) for i in top_indices]
                    self.logger.info(f"📊 [FuturesHunter {self.bot_id}] VPVR HVNs: {[f'{h:.4f}' for h in self.top_hvns]}")
            except Exception as e:
                self.logger.error(f"VPVR Error: {e}")
            await asyncio.sleep(300)


    async def _trades_listener(self):
        """Background task to watch trades and feed the AbsorptionTracker."""
        self.logger.info(f"📣 [FuturesHunter {self.bot_id}] Starting Trades Listener for CVD Absorption...")
        while self.running:
            try:
                # We use public exchange for trades
                trades = await self.public_exchange.watch_trades(self.symbol)
                if not trades:
                    continue
                    
                for trade in trades:
                    p = float(trade['price'])
                    a = float(trade['amount'])
                    s = trade['side'] # 'buy' (hits ask) or 'sell' (hits bid)
                    if getattr(self, 'enable_absorption', False):
                        self.absorption_tracker.add_trade(p, a, s)
                    if getattr(self, 'enable_iceberg_trigger', False):
                        self.iceberg_tracker.add_trade(p, a, s)
                    
            except Exception as e:
                if self.running:
                    self.logger.warning(f"Trade Listener Error: {e}")
                await asyncio.sleep(1)

    async def _atr_updater_loop(self):
        """ATR ভ্যালু আপডেট করবে (প্রতি মিনিটে)"""
        while self.running:
            if not self.atr_sl_enabled and not getattr(self, 'enable_dynamic_atr_scalp', False):
                await asyncio.sleep(60)
                continue
            try:
                ohlcv = await self.public_exchange.fetch_ohlcv(self.symbol, timeframe='1m', limit=self.atr_period + 1)
                if len(ohlcv) > self.atr_period:
                    tr_list = []
                    for i in range(1, len(ohlcv)):
                        h, l, pc = ohlcv[i][2], ohlcv[i][3], ohlcv[i-1][4]
                        tr = max(h - l, abs(h - pc), abs(l - pc))
                        tr_list.append(tr)
                    self.current_atr = sum(tr_list[-self.atr_period:]) / self.atr_period
                    self.logger.info(f"📈 [FuturesHunter {self.bot_id}] ATR: {self.current_atr}")
            except Exception as e: self.logger.error(f"ATR Error: {e}")
            await asyncio.sleep(60)

    async def _liquidation_listener(self):
        """লিকুইডেশন ইভেন্ট লিসেনার (রেডিস সাবস্ক্রিপশন)"""
        pubsub = self.redis.pubsub()
        current_ch = None
        while self.running:
            try:
                if not self.enable_liq_trigger:
                    if current_ch:
                        pubsub.unsubscribe(current_ch)
                        current_ch = None
                    await asyncio.sleep(5)
                    continue
                
                target_ch = f"stream:liquidations:BTC/USDT" if self.follow_btc_liq else f"stream:liquidations:{self.symbol}"
                if current_ch != target_ch:
                    if current_ch: pubsub.unsubscribe(current_ch)
                    pubsub.subscribe(target_ch)
                    current_ch = target_ch
                    self.logger.info(f"🎧 [FuturesHunter {self.bot_id}] Monitoring Liquidations: {current_ch}")

                msg = pubsub.get_message(ignore_subscribe_messages=True)
                if msg and msg['type'] == 'message':
                    data = json.loads(msg['data'].decode('utf-8'))
                    liq_amount = float(data.get('amount', 0))
                    liq_side = data.get('side', '').lower() # 'buy' means Longs liquidated, 'sell' means Shorts liquidated
                    now = time.time()
                    
                    # 1. Cascade Logic
                    if self.enable_liq_cascade:
                        self.liq_history.append((now, liq_amount))
                        while self.liq_history and now - self.liq_history[0][0] > self.liq_cascade_window:
                            self.liq_history.popleft()
                        active_amount = sum(a for t, a in self.liq_history)
                    else:
                        active_amount = liq_amount

                    # 2. Dynamic Threshold Logic
                    base_threshold = self.btc_liq_threshold if self.follow_btc_liq else self.liq_threshold
                    active_threshold = base_threshold
                    
                    if self.enable_dynamic_liq and self.current_atr > 0 and not self.follow_btc_liq:
                        # Convert ATR to a percentage of current price
                        try:
                            ob_limit = market_depth_service._normalize_order_book_limit(self.exchange_id, 5)
                            ob = await self.public_exchange.fetch_order_book(self.symbol, limit=ob_limit)
                            current_mid = (ob['bids'][0][0] + ob['asks'][0][0]) / 2 if ob['bids'] and ob['asks'] else 0
                            if current_mid > 0:
                                atr_pct = self.current_atr / current_mid
                                active_threshold = base_threshold * (1 + (atr_pct * 10 * self.dynamic_liq_multiplier))
                        except Exception as e:
                            self.logger.warning(f"Could not calculate active liq threshold, fallback to base: {e}")

                    # 3. Trigger Decision
                    if active_amount >= active_threshold:
                        if not self.active_pos:
                            side = "buy" if liq_side == "sell" else "sell"
                            if self.enable_liq_cascade: self.liq_history.clear()
                            
                            reason = f"Liquidation Trigger ({liq_side.upper()} ${active_amount:,.0f} [Thresh: ${active_threshold:,.0f}])"
                            self.logger.info(f"🔥 [LIQ TRIGGER] {reason} on {target_ch}")
                            await self._handle_liquidation_trigger(side, reason=reason)
            except Exception as e: 
                self.logger.error(f"Liq Listener Error: {e}")
                await asyncio.sleep(2)
            await asyncio.sleep(0.1)

    async def _handle_liquidation_trigger(self, side: str, reason: str):
        if self.active_pos: return
        try:
            # 1. Fetch current price and orderbook for filters
            ob = await self.public_exchange.fetch_order_book(self.symbol, limit=20)
            if not ob['bids'] or not ob['asks']: return
            
            best_bid = ob['bids'][0][0]
            best_ask = ob['asks'][0][0]
            mid = (best_bid + best_ask) / 2
            
            # 2. Imbalance Filter (Confluence)
            if self.enable_ob_imbalance:
                bid_vol = sum(v for p, v in ob['bids'])
                ask_vol = sum(v for p, v in ob['asks'])
                if side == "buy":
                    ratio = bid_vol / ask_vol if ask_vol > 0 else 999
                else:
                    ratio = ask_vol / bid_vol if bid_vol > 0 else 999
                
                if ratio < self.ob_imbalance_ratio:
                    self.logger.info(f"⏭️ [LIQ] Rejected: OB Imbalance Ratio {ratio:.2f} < {self.ob_imbalance_ratio}")
                    return
                self.logger.info(f"✅ [LIQ] OB Imbalance Confirmed: {ratio:.2f}x")

            # BTC Correlation Anti-Fakeout Check (same as Wall Trigger path)
            if self.enable_btc_correlation and self.btc_correlation_tracker:
                if not self.btc_correlation_tracker.is_aligned(side):
                    metrics = self.btc_correlation_tracker.get_metrics_string()
                    self.logger.info(f"🚫 [LIQ][BTC Divergence] Liq entry rejected! {metrics}")
                    return

            # Adaptive Trend Filter Check (same as Wall Trigger path)
            if self.enable_trend_filter and self.trend_finder:
                try:
                    from app.services.market_depth_service import market_depth_service
                    klines = await market_depth_service.fetch_ohlcv(self.symbol, self.exchange_id, '1m', 1200)
                    if klines:
                        close_prices = [float(k['close']) for k in klines]
                        trend_analysis = self.trend_finder.analyze_trend(close_prices)
                        is_acceptable, tf_reason = self.trend_finder.is_trend_acceptable(trend_analysis, side)
                        if not is_acceptable:
                            self.logger.info(f"🚫 [LIQ][Trend Filter] Liq entry rejected! {tf_reason}")
                            return
                        else:
                            self.logger.info(f"📈 [LIQ][Trend Filter] {tf_reason}")
                except Exception as e:
                    self.logger.warning(f"⚠️ [LIQ][Trend Filter] OHLCV fetch failed: {e}. Allowing trade (pass-through).")

            # 3. Wall Confirmation Filter
            if self.enable_wall_trigger:
                strong_wall = False
                target_levels = ob['bids'] if side == "buy" else ob['asks']
                # Check for any wall meeting the threshold
                for level in target_levels:
                    price, v = level[0], level[1]
                    if v >= self.micro_scalp_min_wall:
                        strong_wall = True
                        self.logger.info(f"🔥 [LIQ] Wall Confluence: Found {v:,.0f} wall at {price}")
                        break
                
                if not strong_wall:
                    self.logger.info(f"⏭️ [LIQ] Rejected: No supporting wall >= {self.micro_scalp_min_wall}")
                    return

            await self.execute_snipe(mid, side, mid, best_bid, best_ask, reason=reason)
        except Exception as e: self.logger.error(f"Liq Handler Error: {e}")

    async def _send_telegram(self, msg: str):
        if not self.owner_id: return
        from app.services.notification import NotificationService
        from app.db.session import SessionLocal
        try:
            db = SessionLocal()
            await NotificationService.send_message(db, self.owner_id, msg)
            db.close()
        except Exception as e:
            self.logger.error(f"Liquidation Snipe Error: {e}")
