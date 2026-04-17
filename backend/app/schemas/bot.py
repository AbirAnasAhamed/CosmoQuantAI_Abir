from typing import Optional, Any, Dict, List
from pydantic import BaseModel, validator
from datetime import datetime

# Shared properties
class StrategyConfig(BaseModel):
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    trailing_stop: Optional[float] = None
    tsl_activation_pct: Optional[float] = 0.0
    target_spread: Optional[float] = None
    leverage: Optional[int] = 1
    timeframe: str = "1h"
    amount_per_trade: float
    vol_threshold: Optional[float] = None
    risk_pct: Optional[float] = None
    sell_order_type: Optional[str] = "market"
    sl_order_type: Optional[str] = "market"
    min_wall_lifetime: Optional[float] = 3.0
    partial_tp_pct: Optional[float] = 50.0
    partial_tp_trigger_pct: Optional[float] = 0.0
    sl_breakeven_trigger_pct: Optional[float] = 0.0
    sl_breakeven_target_pct: Optional[float] = 0.0
    vpvr_enabled: Optional[bool] = False
    vpvr_tolerance: Optional[float] = 0.2
    
    # --- ATR Dynamic Stop-Loss ---
    atr_sl_enabled: Optional[bool] = False
    atr_period: Optional[int] = 14
    atr_multiplier: Optional[float] = 2.0

    # --- NEW: Futures Config ---
    trading_mode: Optional[str] = "spot"
    strategy_mode: Optional[str] = "long"
    margin_mode: Optional[str] = "cross"
    position_direction: Optional[str] = "auto"
    reduce_only: Optional[bool] = True
    liquidation_safety_pct: Optional[float] = 5.0

    # --- Liquidation & Micro-Scalp Config ---
    enable_wall_trigger: Optional[bool] = True
    max_wall_distance_pct: Optional[float] = 1.0
    enable_liq_trigger: Optional[bool] = False
    liq_threshold: Optional[float] = 50000.0
    liq_target_side: Optional[str] = "auto"
    enable_micro_scalp: Optional[bool] = False
    micro_scalp_profit_ticks: Optional[int] = 2
    micro_scalp_min_wall: Optional[float] = 100000.0
    
    # --- Proxy Orderbook Routing (Lead-Lag) ---
    enable_proxy_wall: Optional[bool] = False
    proxy_exchange: Optional[str] = None
    proxy_symbol: Optional[str] = None
    
    # --- WallHunter Smart Logic ---
    enable_oib_filter: Optional[bool] = False
    min_oib_threshold: Optional[float] = 0.4
    enable_dynamic_atr_scalp: Optional[bool] = False
    micro_scalp_atr_multiplier: Optional[float] = 0.5
    trading_session: Optional[str] = "None"

    # --- Advanced Liquidation (Smart HFT) ---
    enable_liq_cascade: Optional[bool] = False
    liq_cascade_window: Optional[int] = 5
    enable_dynamic_liq: Optional[bool] = False
    dynamic_liq_multiplier: Optional[float] = 1.0
    enable_ob_imbalance: Optional[bool] = False
    ob_imbalance_ratio: Optional[float] = 1.5
    
    # --- BTC Liquidation Follower ---
    follow_btc_liq: Optional[bool] = False
    btc_liq_threshold: Optional[float] = 500000.0

    # --- CVD Absorption Confirmation ---
    enable_absorption: Optional[bool] = False
    absorption_threshold: Optional[float] = 50000.0
    absorption_window: Optional[float] = 10.0

    # --- BTC Correlation Filter ---
    enable_btc_correlation: Optional[bool] = False
    btc_correlation_threshold: Optional[float] = 0.7
    btc_time_window: Optional[int] = 15
    btc_min_move_pct: Optional[float] = 0.1

    # --- Iceberg & Hidden Wall Trigger ---
    enable_iceberg_trigger: Optional[bool] = False
    iceberg_time_window_secs: Optional[int] = 5
    iceberg_min_absorbed_vol: Optional[float] = 100000.0

    # --- Buy Order Type Logic ---
    buy_order_type: Optional[str] = "market"
    limit_buffer: Optional[float] = 1.0

    # --- Adaptive Trend Filter ---
    enable_trend_filter: Optional[bool] = False
    trend_filter_lookback: Optional[int] = 200
    trend_filter_threshold: Optional[str] = "Strong"

    # --- Dual Engine Command Center ---
    enable_dual_engine: Optional[bool] = False
    dual_engine_mode: Optional[str] = "Classic"
    dual_engine_ema_filter: Optional[bool] = False
    dual_engine_rsi_filter: Optional[bool] = False
    dual_engine_candle_filter: Optional[bool] = False
    dual_engine_macd_filter: Optional[bool] = False
    dual_engine_squeeze_filter: Optional[bool] = False
    dual_engine_ema_length: Optional[int] = 100
    dual_engine_rsi_length: Optional[int] = 14
    dual_engine_rsi_ob: Optional[int] = 70
    dual_engine_rsi_os: Optional[int] = 30
    dual_engine_macd_fast: Optional[int] = 12
    dual_engine_macd_slow: Optional[int] = 26
    dual_engine_macd_signal: Optional[int] = 9
    dual_engine_squeeze_length: Optional[int] = 20
    dual_engine_squeeze_bb_mult: Optional[float] = 2.0
    dual_engine_squeeze_kc_mult: Optional[float] = 1.5

    # --- UT Bot Alerts ---
    enable_ut_trend_filter: Optional[bool] = False
    enable_ut_entry_trigger: Optional[bool] = False
    enable_ut_trend_unlock_mode: Optional[bool] = False
    enable_ut_trailing_sl: Optional[bool] = False
    ut_bot_sensitivity: Optional[float] = 1.0
    ut_bot_atr_period: Optional[int] = 10
    ut_bot_use_heikin_ashi: Optional[bool] = False
    ut_bot_timeframe: Optional[str] = "5m"
    ut_bot_candle_close: Optional[bool] = False
    ut_bot_validation_secs: Optional[int] = 0
    ut_bot_retest_snipe: Optional[bool] = False

    # --- NEW: Modular Supertrend ---
    enable_supertrend_trend_filter: Optional[bool] = False
    enable_supertrend_entry_trigger: Optional[bool] = False
    enable_supertrend_trend_unlock_mode: Optional[bool] = False
    enable_supertrend_trailing_sl: Optional[bool] = False
    enable_supertrend_exit: Optional[bool] = False
    supertrend_exit_timeout: Optional[int] = 5
    supertrend_period: Optional[int] = 10
    supertrend_multiplier: Optional[float] = 3.0
    supertrend_timeframe: Optional[str] = "5m"
    supertrend_candle_close: Optional[bool] = False

    # --- Smart Support & Resistance (Wick SR) ---
    enable_wick_sr: Optional[bool] = False
    wick_sr_modes: Optional[List[str]] = ["bounce"]
    wick_sr_timeframe: Optional[str] = "1m"
    wick_sr_sweep_threshold: Optional[int] = 3
    wick_sr_min_touches: Optional[int] = 10
    enable_wick_sr_oib: Optional[bool] = False

    @validator('stop_loss')
    def validate_stop_loss(cls, v):
        if v is not None and (v < 0 or v > 100):
            raise ValueError('stop_loss must be between 0 and 100')
        return v

    @validator('take_profit')
    def validate_take_profit(cls, v):
        if v is not None and v <= 0:
            raise ValueError('take_profit must be greater than 0')
        return v
    
    @validator('leverage')
    def validate_leverage(cls, v):
        if v is not None and (v < 1 or v > 125):
             raise ValueError('leverage must be between 1 and 125')
        return v

    @validator('amount_per_trade')
    def validate_amount_per_trade(cls, v):
        if v <= 0:
            raise ValueError('amount_per_trade must be greater than 0')
        return v

class BotBase(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    exchange: Optional[str] = "binance"
    market: Optional[str] = "BTC/USDT"
    strategy: Optional[str] = None
    timeframe: Optional[str] = "1h"
    status: Optional[str] = "inactive"
    config: Optional[StrategyConfig] = None
    
    trade_value: Optional[float] = 100.0
    trade_unit: Optional[str] = "QUOTE"
    api_key_id: Optional[str] = None
    is_paper_trading: Optional[bool] = True 

class BotCreate(BotBase):
    name: str
    exchange: str
    market: str
    config: StrategyConfig 

class BotUpdate(BotBase):
    pass

class BotInDBBase(BotBase):
    id: int
    owner_id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    config: Optional[Dict[str, Any]] = None 
    
    class Config:
        from_attributes = True

class Bot(BotInDBBase):
    pnl: Optional[float] = 0.0
    pnl_percent: Optional[float] = 0.0
    win_rate: Optional[float] = 0.0
    equity_history: List[float] = []
