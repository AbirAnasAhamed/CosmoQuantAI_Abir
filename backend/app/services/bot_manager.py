
import asyncio
from typing import Dict, Optional
from sqlalchemy.orm import Session
from app import models
from app.db.session import SessionLocal
from app.services.async_bot_instance import AsyncBotInstance
from app.services.shared_stream import SharedMarketStream
import logging

logger = logging.getLogger(__name__)

class BotManager:
    """
    Singleton Manager for all running bots.
    Replaces Celery for bot execution.
    """
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(BotManager, cls).__new__(cls)
            cls._instance.active_bots = {} # {bot_id: AsyncBotInstance}
            cls._instance.streams = {}     # {stream_key: SharedMarketStream}
            cls._instance.is_running = False
        return cls._instance

    def start_service(self):
        """Called on app startup"""
        self.is_running = True
        logger.info("✅ BotManager Service Started")

    async def stop_service(self):
        """Called on app shutdown"""
        self.is_running = False
        logger.info("🛑 Stopping All Bots...")
        
        # Stop all bots
        for bot_id in list(self.active_bots.keys()):
            await self.stop_bot(bot_id)
            
        # Stop all streams
        for stream in self.streams.values():
            await stream.stop()
            
        self.active_bots.clear()
        self.streams.clear()

    async def start_bot(self, bot_id: int, db: Session = None):
        """Start a specific bot."""
        if bot_id in self.active_bots:
            return {"status": "error", "message": "Bot already running"}

        logger.info(f"🔄 Starting Bot {bot_id}...")
        self.active_bots[bot_id] = "STARTING" # ✅ STARTING Lock to prevent race conditions
        
        # Create new DB session if not provided
        local_db = db or SessionLocal()
        
        try:
            bot = local_db.query(models.Bot).filter(models.Bot.id == bot_id).first()
            if not bot:
                if bot_id in self.active_bots and self.active_bots[bot_id] == "STARTING":
                    del self.active_bots[bot_id]
                return {"status": "error", "message": "Bot not found"}

            if bot.strategy == "wall_hunter":
                from app.strategies.wall_hunter_bot import WallHunterBot
                from app.strategies.wall_hunter_futures import WallHunterFuturesStrategy
                from app.services.ccxt_service import ccxt_service
                from app.models import ApiKey
                
                config = {
                    "exchange": bot.exchange or "binance",
                    "symbol": bot.market,
                    "is_paper_trading": bot.is_paper_trading,
                    "timeframe": bot.timeframe,
                }
                if bot.config:
                    config.update(bot.config)
                    
                trading_mode = config.get('trading_mode', 'spot')
                
                if trading_mode == 'futures':
                    # সম্পূর্ণ নতুন এবং আলাদা ফিউচার লজিক রান হবে
                    bot_instance = WallHunterFuturesStrategy(bot, ccxt_service)
                    logger.info(f"Starting Wall Hunter in FUTURES mode for {bot.market}")
                else:
                    # এক্সিস্টিং স্পট বট রান হবে
                    bot_instance = WallHunterBot(bot.id, config, local_db, owner_id=bot.owner_id)
                    logger.info(f"Starting Wall Hunter in SPOT mode for {bot.market}")

                bot_instance.bot = bot # keep reference
                
                api_key_record = None
                if not bot.is_paper_trading and bot.api_key_id:
                    api_key_record = local_db.query(ApiKey).filter_by(id=bot.api_key_id).first()
                    
                # স্ট্র্যাটেজি স্টার্ট করা
                if hasattr(bot_instance, 'start') and callable(getattr(bot_instance, 'start')):
                    await bot_instance.start(api_key_record)
                
                # ✅ RACE CONDITION SAFETY CHECK: Verify lock is still present
                if bot_id not in self.active_bots or self.active_bots[bot_id] != "STARTING":
                    logger.warning(f"⚠️ Aborting startup for Bot {bot_id}: Lock removed (user likely stopped/deleted during init).")
                    if hasattr(bot_instance, 'stop') and callable(getattr(bot_instance, 'stop')):
                        await bot_instance.stop()
                    return {"status": "error", "message": "Bot was stopped before startup could complete."}
                    
                self.active_bots[bot_id] = bot_instance
            else:
                # 1. Create Instance
                bot_instance = AsyncBotInstance(bot, local_db)
                
                # 2. Get/Create Shared Stream
                stream_key = f"{bot.exchange}_{bot.market}_{bot.timeframe}"
                if stream_key not in self.streams:
                    self.streams[stream_key] = SharedMarketStream(
                        bot.exchange or 'binance', 
                        bot.market, 
                        bot.timeframe
                    )
                
                stream = self.streams[stream_key]
                
                # 3. Link Bot to Stream
                await stream.subscribe(bot_instance)
                
                # 4. Start Bot Internal Tasks (User Stream, etc.)
                await bot_instance.start()
                
                # ✅ RACE CONDITION SAFETY CHECK: Verify lock is still present
                if bot_id not in self.active_bots or self.active_bots[bot_id] != "STARTING":
                    logger.warning(f"⚠️ Aborting startup for AsyncBot {bot_id}: Lock removed (user likely stopped/deleted during init).")
                    await stream.unsubscribe(bot_instance)
                    await bot_instance.stop()
                    # Clean unused stream
                    if not stream.subscribers:
                        await stream.stop()
                        del self.streams[stream_key]
                    return {"status": "error", "message": "Bot was stopped before startup could complete."}
                
                self.active_bots[bot_id] = bot_instance
            
            # Update DB Status
            bot.status = "active"
            local_db.commit()
            
            trading_mode = config.get('trading_mode', 'spot').upper()
            strategy_mode = config.get('strategy_mode', 'long').lower()
            mode_display = f"{trading_mode}"
            if trading_mode == 'SPOT':
                mode_display += " (Accumulation Base/Short)" if strategy_mode == "short" else " (Accumulation Quote/Long)"
            
            logger.info("="*50)
            logger.info(f"🚀 BOT ACTIVATED: ID {bot_id} | {bot.market} on {bot.exchange}")
            
            from app.services.notification import NotificationService
            msg_lines = [
                f"🚀 *BOT ACTIVATED: ID {bot_id}*",
                f"💎 Pair: {bot.market} | {bot.exchange}"
            ]
            
            if bot.strategy == "wall_hunter":
                dynamic_logs = []
                dynamic_logs.append(f"🛠️ Trading Mode: {mode_display}")
                
                trading_sessions = config.get('trading_sessions', [config.get('trading_session', 'None')])
                valid_sessions = [s for s in trading_sessions if s and s != 'None']
                if valid_sessions:
                    dynamic_logs.append(f"🕒 Trading Sessions: {', '.join(valid_sessions)}")
                
                # Determine precise Strategy Name
                has_ut = config.get('enable_ut_trend_filter') or config.get('enable_ut_entry_trigger') or config.get('enable_ut_trailing_sl')
                has_st = config.get('enable_supertrend_trend_filter') or config.get('enable_supertrend_entry_trigger') or config.get('enable_supertrend_trailing_sl')
                has_wall = config.get('enable_wall_trigger')
                has_liq = config.get('enable_liq_trigger')
                
                flags = []
                if has_wall: flags.append("orderbook wall")
                if has_liq: flags.append("liquidation")
                if config.get('enable_ut_entry_trigger'): flags.append("ut bot entry")
                if config.get('enable_ut_trend_filter'): flags.append("ut bot trend")
                if config.get('enable_supertrend_entry_trigger'): flags.append("supertrend entry")
                if config.get('enable_supertrend_trend_filter'): flags.append("supertrend trend")
                
                if has_ut and has_st:
                    strat_display = f"UT Bot + Supertrend Confluence ({' + '.join(flags)})"
                elif has_ut:
                    strat_display = f"UT Bot Confluence ({' + '.join(flags)})"
                elif has_st:
                    strat_display = f"Supertrend Confluence ({' + '.join(flags)})"
                elif flags:
                    strat_display = f"WallHunter Level 2 Sniper ({' + '.join(flags)})"
                else:
                    strat_display = "WallHunter Level 2 Sniper"
                
                dynamic_logs.append(f"📈 Strategy: {strat_display}")

                # Futures Specific Info
                if trading_mode == 'FUTURES':
                    leverage = config.get('leverage', 10)
                    margin = config.get('margin_mode', 'cross').upper()
                    direction = config.get('position_direction', 'auto').upper()
                    dynamic_logs.append(f"⚙️ Futures: {leverage}x | {margin} Margin | {direction} Dir")
                    
                target_spread = config.get('target_spread', 0)
                dynamic_logs.append(f"🎯 Target Spread: {target_spread}")
                
                # Main Entry Trigger
                triggers = []
                if config.get('enable_wall_trigger', True):
                    triggers.append("Wall")
                
                if config.get('enable_ut_entry_trigger'):
                    ut_info = "UT Bot"
                    extra = []
                    if config.get('ut_bot_candle_close'): extra.append("CandleClose")
                    if config.get('ut_bot_retest_snipe'): extra.append("Retest")
                    if config.get('ut_bot_validation_secs', 0) > 0: extra.append(f"Sus:{config.get('ut_bot_validation_secs')}s")
                    if extra:
                        ut_info += f" [{'+'.join(extra)}]"
                    triggers.append(ut_info)
                    
                if config.get('enable_supertrend_entry_trigger'):
                    st_info = "Supertrend"
                    if config.get('supertrend_candle_close'): 
                        st_info += " [CandleClose]"
                    triggers.append(st_info)
                
                if config.get('enable_liq_trigger'):
                    liq_info = "Liq"
                    l_extra = []
                    if config.get('enable_liq_cascade'):
                        l_extra.append(f"Cascade:{config.get('liq_cascade_window', 5)}s")
                    if config.get('enable_dynamic_liq'):
                        l_extra.append(f"Dyn:{config.get('dynamic_liq_multiplier', 1.0)}x")
                    if config.get('enable_ob_imbalance'):
                        l_extra.append(f"Imb:{config.get('ob_imbalance_ratio', 1.5)}x")
                    
                    if l_extra:
                        liq_info += f" [{'+'.join(l_extra)}]"
                    triggers.append(liq_info)
                    
                if config.get('enable_iceberg_trigger'):
                    ice_vol = config.get('iceberg_min_absorbed_vol', 100000.0)
                    ice_win = config.get('iceberg_time_window_secs', 10)
                    triggers.append(f"Iceberg [${ice_vol:,.0f}/{ice_win}s] ⚡PRIORITY")
                    
                if config.get('enable_dual_engine'):
                    if not config.get('enable_wall_trigger') and not config.get('enable_liq_trigger'):
                        triggers.append(f"Dual Engine Standalone ({config.get('dual_engine_mode', 'Classic')})")

                trigger_str = " + ".join(triggers) if triggers else "None"
                dynamic_logs.append(f"🔔 Main Entry Trigger: {trigger_str}")
                
                # Active Confluence Filters
                c_filters = []
                if config.get('enable_supertrend_trend_filter'):
                    c_filters.append("Supertrend Trend")
                if config.get('enable_ut_trend_filter'):
                    c_filters.append("UT Bot Trend")
                
                # Only list Dual engine as a Confluence filter if it's not the Standalone main trigger
                if config.get('enable_dual_engine') and (config.get('enable_wall_trigger') or config.get('enable_liq_trigger') or config.get('enable_supertrend_entry_trigger') or config.get('enable_ut_entry_trigger')):
                    c_filters.append("Dual Engine")
                    
                if c_filters:
                    filters_str = " + ".join(c_filters)
                    dynamic_logs.append(f"🛡️ Confluence Filters: {filters_str}")
                
                # CVD Absorption Info
                if config.get('enable_absorption'):
                    abs_thresh = config.get('absorption_threshold', 50000.0)
                    abs_win = config.get('absorption_window', 10.0)
                    dynamic_logs.append(f"🧬 CVD Absorption: ON (${abs_thresh:,.0f} / {abs_win}s)")

                # OIB Filter Info
                if config.get('enable_oib_filter'):
                    oib_thresh = config.get('min_oib_threshold', 0.65)
                    dynamic_logs.append(f"⚖️ OIB Filter: ON (Min Bid Dominance: {oib_thresh*100:.0f}%)")
                else:
                    dynamic_logs.append(f"⚖️ OIB Filter: OFF")

                # Iceberg / Hidden Wall Trigger Info
                if config.get('enable_iceberg_trigger'):
                    ice_vol = config.get('iceberg_min_absorbed_vol', 100000.0)
                    ice_win = config.get('iceberg_time_window_secs', 10)
                    dynamic_logs.append(f"💎 Iceberg Trigger: ON | Min Absorbed: ${ice_vol:,.0f} | Window: {ice_win}s | Priority: HIGHEST (Vol Bypass)")
                else:
                    dynamic_logs.append(f"💎 Iceberg Trigger: OFF")

                # BTC Correlation Filter Info
                if config.get('enable_btc_correlation'):
                    dynamic_logs.append(f"📉 BTC Correlation Anti-Fakeout: ON (Thresh: {config.get('btc_correlation_threshold', 0.7)})")
                    
                # Adaptive Trend Filter (Stand-alone info, not UT Bot)
                # If they enabled it locally (independent of UT bot)
                if config.get('enable_trend_filter') and not config.get('enable_ut_bot'):
                    dynamic_logs.append(f"🌊 Adaptive Trend: {config.get('trend_filter_threshold', 'Strong')} ({config.get('trend_filter_lookback', 200)}p)")

                # Dual Engine Command Center Info
                if config.get('enable_dual_engine'):
                    de_mode = config.get('dual_engine_mode', 'Classic').upper()
                    de_tf = config.get('dual_engine_timeframe', '1m')
                    if de_mode == 'CLASSIC':
                        filters = []
                        if config.get('dual_engine_ema_filter'): filters.append(f"EMA({config.get('dual_engine_ema_length', 100)})")
                        if config.get('dual_engine_triple_ema_filter'): 
                            f, m, s = config.get('dual_engine_ema_fast', 10), config.get('dual_engine_ema_med', 15), config.get('dual_engine_ema_slow', 27)
                            filters.append(f"3xEMA({f}/{m}/{s})")
                        if config.get('dual_engine_rsi_filter'): 
                            filters.append(f"RSI({config.get('dual_engine_rsi_length', 14)})")
                        if config.get('dual_engine_macd_filter'): 
                            f, s, sig = config.get('dual_engine_macd_fast', 12), config.get('dual_engine_macd_slow', 26), config.get('dual_engine_macd_signal', 9)
                            filters.append(f"MACD({f}/{s}/{sig})")
                        if config.get('dual_engine_squeeze_filter'): filters.append(f"SQZ")
                        if config.get('dual_engine_candle_filter'): filters.append(f"Candles")
                        if config.get('dual_engine_adx_filter'): filters.append(f"ADX({config.get('dual_engine_adx_length', 14)}, Th:{config.get('dual_engine_adx_threshold', 25)})")
                        if config.get('dual_engine_vol_filter'): filters.append(f"Vol({config.get('dual_engine_vol_length', 20)})")
                        filters_str = " + ".join(filters) if filters else "None"
                        dynamic_logs.append(f"🧠 Dual Engine [{de_tf}] ({de_mode}): {filters_str}")
                    elif de_mode == 'CONFLUENCE':
                        dynamic_logs.append(f"🧠 Dual Engine [{de_tf}] ({de_mode}): Min Score {config.get('dual_engine_min_confluence', 3)}")
                    else:
                        dynamic_logs.append(f"🧠 Dual Engine [{de_tf}] ({de_mode}): Overall Insight Score Strategy")

                # UT Bot Sub-Settings (Logical details - only Dynamic TSL remains separate if any)
                if has_ut and config.get('enable_ut_trailing_sl'):
                    dynamic_logs.append(f"🧠 UT Logic: Dynamic TSL")
                    
                if has_st and config.get('enable_supertrend_trailing_sl'):
                    dynamic_logs.append(f"🌊 Supertrend Logic: Dynamic TSL")
                
                # Advanced Settings
                adv = []
                if config.get('partial_tp_pct', 0) > 0:
                    trigger_pct = config.get('partial_tp_trigger_pct', 0.0)
                    adv.append(f"Scale-Out ({config.get('partial_tp_pct')}% at {trigger_pct}%)")
                        
                if config.get('sl_breakeven_trigger_pct', 0) > 0:
                    trigger = config.get('sl_breakeven_trigger_pct', 0)
                    target = config.get('sl_breakeven_target_pct', 0)
                    adv.append(f"Risk-Free ({trigger}% -> {target}%)")
                    
                if config.get('vpvr_enabled'):
                    adv.append(f"VPVR ({config.get('vpvr_tolerance', 0.2)}%)")
                if config.get('atr_sl_enabled'):
                    adv.append(f"ATR (P:{config.get('atr_period', 14)})")
                if config.get('enable_micro_scalp'):
                    adv.append(f"Micro-Scalp")
                if config.get('enable_supertrend_exit'):
                    adv.append(f"ST Dual-Exit ({config.get('supertrend_exit_timeout', 5)}s Maker->Taker)")

                if adv:
                    adv_str = " | ".join(adv)
                    dynamic_logs.append(f"\u26a1 Advanced: {adv_str}")

                # Smart Wick S/R (Wick SR)
                if config.get('enable_wick_sr', False):
                    active_modes = config.get('wick_sr_modes', ['bounce'])
                    mode_labels = {
                        'bounce': 'Bounce', 'breakout': 'Breakout',
                        'sweep': 'Liq Sweep', 'retest': 'Retest'
                    }
                    modes_display = ", ".join([mode_labels.get(m, m.title()) for m in active_modes])
                    oib_str = "ON" if config.get('enable_wick_sr_oib', False) else "OFF"
                    tf = config.get('wick_sr_timeframe', '1m')
                    touches = config.get('wick_sr_min_touches', 10)
                    dynamic_logs.append(
                        f"\U0001f525 Smart S/R: {modes_display} | TF:{tf} | Touch:{touches} | OIB:{oib_str}"
                    )
                
                # Risk Pct | TSL
                risk_tsl = f"{config.get('risk_pct', 0)}% | TSL: {config.get('trailing_stop', 0)}%"
                dynamic_logs.append(f"⚖️ Risk Pct: {risk_tsl}")

                # Trade Amount
                asset_label = "Quote Asset"
                if bot.market and '/' in bot.market:
                    if strategy_mode == 'short':
                        asset_label = f"Base Asset: {bot.market.split('/')[0]}"
                    else:
                        asset_label = f"Quote Asset: {bot.market.split('/')[1]}"
                amount_str = f"{config.get('amount_per_trade', 0)} ({asset_label})"
                dynamic_logs.append(f"💰 Trade Amount: {amount_str}")
                
                # Sell Order
                sell_order = f"{config.get('sell_order_type', 'market').upper()}"
                dynamic_logs.append(f"📋 Sell Order: {sell_order}")
                
                # Buy Order
                buy_type = config.get('buy_order_type', 'market').upper()
                buffer = config.get('limit_buffer', 0.5)
                buy_log = f"{buy_type}"
                if buy_type == "MARKETABLE_LIMIT":
                    buy_log += f" (Buffer: {buffer}%)"
                dynamic_logs.append(f"🛒 Buy Order: {buy_log}")

                # Safely enumerate everything and format
                for idx, log_item in enumerate(dynamic_logs, 1):
                    logger.info(f"{idx}. {log_item}")
                    msg_lines.append(f"{idx}. {log_item}")
                from app.models.notification import NotificationSettings
                owner_notification_settings = local_db.query(NotificationSettings).filter(NotificationSettings.user_id == bot.owner_id).first() if bot.owner_id else None
                dump_active_config = owner_notification_settings.alert_active_config_dump if owner_notification_settings else True

                if dump_active_config:
                    # ⚙️ ACTIVE CONFIG (Compact Dump - No Falsy/Zeros + Parent-Child Filter)
                    logger.info("⚙️ ACTIVE CONFIG:")
                    msg_lines.append("\n⚙️ *Active Config:*")
                    skip_keys = ['symbol', 'exchange', 'is_paper_trading', 'name', 'description', 'timeframe']
                    
                    # Evaluate Parent-Child Relationships to hide inactive module configs
                    disabled_prefixes = []
                    
                    # 1. Trading Mode / Futures specific settings
                    if config.get('trading_mode') == 'spot':
                        disabled_prefixes.extend(['margin_mode', 'leverage', 'position_direction', 'reduce_only'])
                    
                    # 2. TSL logic
                    if not config.get('trailing_stop') or config.get('trailing_stop') == 0.0:
                        disabled_prefixes.append('tsl_activation_pct')
                    
                    # 2.5 Limit Buffer logic
                    buy_type_str = config.get('buy_order_type', '').lower()
                    sell_type_str = config.get('sell_order_type', '').lower()
                    if buy_type_str != 'marketable_limit' and sell_type_str != 'marketable_limit':
                        disabled_prefixes.append('limit_buffer')
                        
                    # 2.6 SL Order Type logic
                    if not config.get('stop_loss') or config.get('stop_loss') == 0.0:
                        disabled_prefixes.append('sl_order_type')
                    
                    # 3. Dual Engine logic
                    # Dual Engine is comprehensively summarized in a single smart line in the main logs.
                    # We can safely hide the raw variables from the Active Config dump to reduce clutter.
                    disabled_prefixes.append('dual_engine_')
                    
                    if not config.get('enable_supertrend_bot'): disabled_prefixes.append('supertrend_')
                    if not config.get('enable_ut_bot'): disabled_prefixes.append('ut_bot_')
                    if not config.get('enable_wick_sr'): disabled_prefixes.append('wick_sr_')
                    if not config.get('enable_iceberg_trigger'): disabled_prefixes.append('iceberg_')
                    if not config.get('enable_absorption'): disabled_prefixes.append('absorption_')
                    if not config.get('enable_btc_correlation'): disabled_prefixes.append('btc_')
                    if not config.get('enable_auto_fibo_tp'): disabled_prefixes.extend(['auto_fibo_', 'enable_auto_fibo_tp'])
                    if not config.get('enable_trend_filter'): disabled_prefixes.append('trend_filter_')
                    if not config.get('enable_wall_trigger'):
                        disabled_prefixes.extend(['max_wall_distance_pct', 'min_wall_lifetime'])
                    if not config.get('enable_micro_scalp'):
                        disabled_prefixes.extend(['micro_scalp_'])
                    if not config.get('enable_liq_trigger'): 
                        disabled_prefixes.extend(['liq_threshold', 'liq_target_side', 'liquidation_safety_pct'])
                    if not config.get('enable_proxy_wall'): disabled_prefixes.extend(['proxy_exchange', 'proxy_symbol'])
                    if not config.get('enable_dynamic_liq'): disabled_prefixes.append('dynamic_liq_multiplier')
                    if not config.get('enable_liq_cascade'): disabled_prefixes.append('liq_cascade_window')
                    if not config.get('enable_vol_filter'): disabled_prefixes.append('vol_threshold')
                    if not config.get('vpvr_enabled'): disabled_prefixes.append('vpvr_tolerance')
                    if not config.get('enable_oib_filter'): disabled_prefixes.extend(['min_oib_threshold', 'ob_imbalance_ratio'])
                    if not config.get('atr_sl_enabled'): disabled_prefixes.extend(['atr_period', 'atr_multiplier'])
                    
                    for k, v in sorted(config.items()):
                        if k in skip_keys: continue
                        
                        # Parent-Child check
                        if any(k.startswith(prefix) for prefix in disabled_prefixes):
                            continue
                        
                        # Skip disabled, 0, None, empty, or False values
                        if not v or v == [] or v == ['None'] or v == 0.0: continue
                        if str(v).lower() in ['none', 'false', '', '0', '0.0']: continue
                            
                        # Smart Emoji Mapping
                        kl = k.lower()
                        if 'dual_engine' in kl: emoji = "🧠"
                        elif 'supertrend' in kl: emoji = "🌊"
                        elif 'ut_bot' in kl: emoji = "🎯"
                        elif 'vol' in kl or 'amount' in kl: emoji = "📊"
                        elif 'liq' in kl: emoji = "💥"
                        elif 'risk' in kl or 'sl' in kl or 'stop' in kl: emoji = "🛡️"
                        elif 'tp' in kl or 'profit' in kl: emoji = "💰"
                        elif 'atr' in kl: emoji = "📏"
                        elif 'wall' in kl: emoji = "🧱"
                        elif 'iceberg' in kl: emoji = "🧊"
                        elif 'spread' in kl: emoji = "🎯"
                        elif 'timeframe' in kl or 'time' in kl or 'period' in kl: emoji = "⏱️"
                        elif 'btc' in kl: emoji = "📉"
                        elif 'wick' in kl: emoji = "🔥"
                        elif 'buy' in kl or 'sell' in kl: emoji = "🛒"
                        elif 'mode' in kl: emoji = "⚙️"
                        else: emoji = "🔸"
                            
                        pretty_key = k.replace('_', ' ').title()
                        logger.info(f"  {emoji} {pretty_key}: {v}")
                        msg_lines.append(f"  {emoji} {pretty_key}: {v}")

            else:
                logger.info(f"📈 Strategy: {bot.strategy} | Timeframe: {bot.timeframe}")
                msg_lines.append(f"📈 Strategy: {bot.strategy} | Timeframe: {bot.timeframe}")
                
                logger.info(f"💰 Trade Value: {bot.trade_value}")
                msg_lines.append(f"💰 Trade Value: {bot.trade_value}")
                
            logger.info("="*50)
            
            # Send Telegram Notification explicitly for bot startup
            if bot.owner_id:
                asyncio.create_task(NotificationService.send_message(local_db, bot.owner_id, "\n".join(msg_lines)))
            
            return {"status": "success", "message": f"Bot {bot_id} started"}

        except Exception as e:
            logger.error(f"Failed to start bot {bot_id}: {e}")
            if bot_id in self.active_bots and self.active_bots[bot_id] == "STARTING":
                del self.active_bots[bot_id]
            return {"status": "error", "message": str(e)}
        finally:
            if not db: local_db.close() # Close if we created it

    async def stop_bot(self, bot_id: int, db: Session = None):
        """Stop a specific bot."""
        # 1. Prepare DB Session
        local_db = db or SessionLocal()
        
        try:
            # 2. Stop In-Memory Instance if exists
            if bot_id in self.active_bots:
                logger.info(f"🛑 Stopping Bot {bot_id}...")
                bot_instance = self.active_bots[bot_id]
                
                if bot_instance == "STARTING":
                    logger.warning(f"⚠️ Bot {bot_id} is currently STARTING. Removing lock to abort future launch phases.")
                    del self.active_bots[bot_id]
                else:
                    if isinstance(bot_instance, AsyncBotInstance):
                        # Unsubscribe from Stream
                        stream_key = f"{bot_instance.bot.exchange}_{bot_instance.symbol}_{bot_instance.timeframe}"
                        if stream_key in self.streams:
                            stream = self.streams[stream_key]
                            await stream.unsubscribe(bot_instance)
                            
                            # Cleanup unused streams
                            if not stream.subscribers:
                                await stream.stop()
                                del self.streams[stream_key]

                    # Stop Bot Internals
                    if bot_instance != "STARTING":
                        try:
                            await bot_instance.stop()
                        except Exception as stop_e:
                            logger.error(f"Error inside bot_instance.stop() for bot {bot_id}: {stop_e}")
                        finally:
                            if bot_id in self.active_bots:
                                del self.active_bots[bot_id]
            else:
                logger.warning(f"⚠️ Bot {bot_id} not found in memory. Checking DB for zombie state...")

            # 3. Update DB Status (Always, to ensure consistency)
            bot = local_db.query(models.Bot).filter(models.Bot.id == bot_id).first()
            if bot:
                if bot.status == "active":
                    logger.info(f"🧹 Cleaning up zombie bot {bot_id} (active in DB -> inactive)")
                bot.status = "inactive"
                local_db.commit()

            return {"status": "success", "message": f"Bot {bot_id} stopped (or was already stopped)"}

        except Exception as e:
            logger.error(f"Error stopping bot {bot_id}: {e}")
            return {"status": "error", "message": str(e)}
        finally:
            if not db: local_db.close()

    async def update_live_bot(self, bot_id: int, new_config: dict):
        """Update a running bot's configuration without stopping it."""
        if bot_id not in self.active_bots:
            return {"status": "error", "message": "Bot is not currently active in memory"}
            
        bot_instance = self.active_bots[bot_id]
        
        if bot_instance == "STARTING":
            return {"status": "error", "message": "Bot is currently starting up, please try again in a few seconds"}
        
        # Check if the active bot supports dynamic config updates (e.g. WallHunterBot)
        if hasattr(bot_instance, "update_config") and callable(bot_instance.update_config):
            try:
                bot_instance.update_config(new_config)
                return {"status": "success", "message": f"Successfully updated live configuration for bot {bot_id}"}
            except Exception as e:
                logger.error(f"Error updating live bot {bot_id}: {e}")
                return {"status": "error", "message": f"Failed to apply live update: {str(e)}"}
        else:
            return {"status": "error", "message": f"Bot strategy does not support live updates"}
            
    async def emergency_sell_bot(self, bot_id: int, sell_type: str):
        """Emergency sell for a running bot's active position."""
        if bot_id not in self.active_bots:
            return {"status": "error", "message": "Bot is not currently active in memory"}
            
        bot_instance = self.active_bots[bot_id]
        
        if bot_instance == "STARTING":
            return {"status": "error", "message": "Bot is currently starting up, cannot execute emergency sell"}
        
        if hasattr(bot_instance, "emergency_sell") and callable(bot_instance.emergency_sell):
            try:
                await bot_instance.emergency_sell(sell_type)
                return {"status": "success", "message": f"Emergency {sell_type} sell triggered for bot {bot_id}"}
            except Exception as e:
                logger.error(f"Error triggering emergency sell for bot {bot_id}: {e}")
                return {"status": "error", "message": f"Failed to execute emergency sell: {str(e)}"}
        else:
            return {"status": "error", "message": f"Bot strategy does not support emergency sell"}
