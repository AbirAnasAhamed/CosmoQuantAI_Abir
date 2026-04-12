import asyncio
import logging
import time
import pandas as pd
import pandas_ta as ta

logger = logging.getLogger(__name__)

class DualEngineTracker:
    def __init__(self, exchange_id: str, symbol: str, config: dict):
        self.exchange_id = exchange_id
        self.symbol = symbol
        
        # Unpack config
        self.is_enabled = config.get("enable_dual_engine", False)
        self.mode = config.get("dual_engine_mode", "Classic") # 'Classic' or 'Advanced'
        
        # Filters (Mapping from Pine Script)
        self.use_ema_filter = config.get("dual_engine_ema_filter", False)
        self.use_rsi_filter = config.get("dual_engine_rsi_filter", False)
        self.use_candle_filter = config.get("dual_engine_candle_filter", False)
        self.use_macd_filter = config.get("dual_engine_macd_filter", False)
        self.use_squeeze_filter = config.get("dual_engine_squeeze_filter", False)
        
        # Params
        self.ema_length = config.get("dual_engine_ema_length", 100)
        self.rsi_length = config.get("dual_engine_rsi_length", 14)
        self.rsi_ob = config.get("dual_engine_rsi_ob", 70)
        self.rsi_os = config.get("dual_engine_rsi_os", 30)
        self.macd_fast = config.get("dual_engine_macd_fast", 12)
        self.macd_slow = config.get("dual_engine_macd_slow", 26)
        self.macd_signal = config.get("dual_engine_macd_signal", 9)
        self.squeeze_length = config.get("dual_engine_squeeze_length", 20)
        self.squeeze_bb_mult = config.get("dual_engine_squeeze_bb_mult", 2.0)
        self.squeeze_kc_mult = config.get("dual_engine_squeeze_kc_mult", 1.5)
        
        # State
        self.current_state = {
            "signal": "NEUTRAL",  # BUY, SELL, NEUTRAL
            "trend": "NEUTRAL",
            "rsi": 50,
            "last_updated": 0
        }
        
        self.running = False
        self.update_interval = 2 # Seconds
        self.last_candle_time = 0
        
    def update_params(self, **kwargs):
        for k, v in kwargs.items():
            if hasattr(self, k):
                setattr(self, k, v)
        logger.info(f"⚡ [Dual Engine Tracker] Params updated: {kwargs}")

    async def start(self):
        self.running = True
        logger.info(f"⚡ [Dual Engine Tracker] Started for {self.symbol} (Enabled: {self.is_enabled})")
        from app.services.market_depth_service import market_depth_service
        
        while self.running:
            try:
                if self.is_enabled:
                    # Fetching 1m candles for fast scalping calculation
                    klines = await market_depth_service.fetch_ohlcv(self.symbol, self.exchange_id, '1m', 150)
                    if klines and len(klines) > 50:
                        # Only recalculate if new candle closed or enough time passed
                        current_candle_time = int(klines[-1].get('time', klines[-1].get('timestamp', 0)))
                        if current_candle_time > self.last_candle_time:
                            await self._calculate_context(klines)
                            self.last_candle_time = current_candle_time
            except Exception as e:
                logger.error(f"Error in Dual Engine Tracker: {e}")
                
            await asyncio.sleep(self.update_interval)

    async def stop(self):
        self.running = False
        logger.info(f"🛑 [Dual Engine Tracker] Stopped for {self.symbol}")

    def is_aligned(self, side: str) -> bool:
        """WallHunter bot calls this instantly with zero latency."""
        if not self.is_enabled:
            return True # If disabled, don't block
            
        if side.lower() == 'buy':
            return self.current_state["signal"] == "BUY"
        elif side.lower() == 'sell':
            return self.current_state["signal"] == "SELL"
        return False
        
    def get_metrics_string(self) -> str:
        s = self.current_state
        return f"Signal: {s['signal']} | Trend: {s['trend']} | RSI: {s['rsi']}"

    async def _calculate_context(self, klines: list):
        try:
            df = pd.DataFrame(klines)
            if 'time' in df.columns:
                df.rename(columns={'time': 'timestamp'}, inplace=True)
            for col in ['open', 'high', 'low', 'close', 'volume']:
                df[col] = df[col].astype(float)
                
            # Pine Script Parameters
            len_slow_ema = int(self.ema_length)
            len_rsi = int(self.rsi_length)
            rsi_ob = int(self.rsi_ob)
            rsi_os = int(self.rsi_os)
            
            if self.use_ema_filter:
                df['ema_slow'] = ta.ema(df['close'], length=len_slow_ema)
                
            if self.use_rsi_filter:
                df['rsi'] = ta.rsi(df['close'], length=len_rsi)

            if self.use_macd_filter:
                macd = ta.macd(df['close'], fast=int(self.macd_fast), slow=int(self.macd_slow), signal=int(self.macd_signal))
                if macd is not None and not macd.empty:
                    df['macd_line'] = macd.iloc[:, 0]
                    df['macd_signal'] = macd.iloc[:, 2]
                else:
                    df['macd_line'] = 0.0
                    df['macd_signal'] = 0.0

            if self.use_squeeze_filter:
                sma = ta.sma(df['close'], length=int(self.squeeze_length))
                std = ta.stdev(df['close'], length=int(self.squeeze_length))
                bb_upper = sma + (float(self.squeeze_bb_mult) * std)
                bb_lower = sma - (float(self.squeeze_bb_mult) * std)
                
                tr = ta.true_range(df['high'], df['low'], df['close'])
                atr = ta.sma(tr, length=int(self.squeeze_length))
                kc_upper = sma + (float(self.squeeze_kc_mult) * atr)
                kc_lower = sma - (float(self.squeeze_kc_mult) * atr)
                
                df['squeeze_on'] = (bb_upper < kc_upper) & (bb_lower > kc_lower)
                
            # Full Pine Script Legacy Metrics for "Hybrid" and "Legacy" Modes
            if self.mode in ['Hybrid', 'Legacy']:
                # HTF Proxy (200 EMA)
                df['ema_200'] = ta.ema(df['close'], length=200)
                
                # OBV
                df['obv'] = ta.obv(df['close'], df['volume'])
                if df['obv'] is not None and not df['obv'].empty:
                    df['obv_ema'] = ta.ema(df['obv'], length=20)
                else:
                    df['obv_ema'] = 0.0

                # Mom Speed Emas
                df['ema_9'] = ta.ema(df['close'], length=9)
                df['ema_21'] = ta.ema(df['close'], length=21)
                
                # Structure (Pivots) - Rolling max/min
                df['max_10'] = df['high'].rolling(10).max()
                df['min_10'] = df['low'].rolling(10).min()
                
            last_row = df.iloc[-1]
            prev_row = df.iloc[-2]
            
            final_signal = "NEUTRAL"
            trend = "NEUTRAL"
            rsi_val = round(last_row.get('rsi', 50), 2)
            overall_score = 0
            
            if self.mode in ['Hybrid', 'Legacy']:
                # Calculate Overall Insight Score exactly matching frontend
                
                # HTF
                if pd.notna(last_row.get('ema_200')):
                    if last_row['close'] > last_row['ema_200']:
                        overall_score += 2
                    else:
                        overall_score -= 2
                        
                # LTF
                if pd.notna(last_row.get('ema_slow')):
                    if last_row['close'] > last_row['ema_slow']:
                        overall_score += 1
                        trend = "UP"
                    else:
                        overall_score -= 1
                        trend = "DOWN"
                        
                # Structure
                # simple struct check based on highs/lows shift
                try:
                    max_h_prev = df['high'].iloc[-20:-10].max()
                    max_h_recent = df['high'].iloc[-10:].max()
                    min_l_prev = df['low'].iloc[-20:-10].min()
                    min_l_recent = df['low'].iloc[-10:].min()
                    
                    if max_h_recent > max_h_prev and min_l_recent > min_l_prev:
                        overall_score += 1
                    elif max_h_recent < max_h_prev and min_l_recent < min_l_prev:
                        overall_score -= 1
                except:
                    pass
                    
                # MACD
                if pd.notna(last_row.get('macd_line')) and pd.notna(last_row.get('macd_signal')):
                    if last_row['macd_line'] > last_row['macd_signal']:
                        overall_score += 1
                    else:
                        overall_score -= 1
                        
                # OBV
                if pd.notna(last_row.get('obv')) and pd.notna(last_row.get('obv_ema')):
                    if last_row['obv'] > last_row['obv_ema']:
                        overall_score += 1
                    else:
                        overall_score -= 1
                        
                # Mom Speed
                if pd.notna(last_row.get('ema_9')) and pd.notna(last_row.get('ema_21')):
                    fast0 = last_row['ema_9']
                    slow0 = last_row['ema_21']
                    fast1 = prev_row['ema_9']
                    slow1 = prev_row['ema_21']
                    
                    is_bull_mom = fast0 > slow0
                    is_strengthening = abs(fast0 - slow0) > abs(fast1 - slow1)
                    
                    if is_bull_mom and is_strengthening:
                        overall_score += 1
                    elif not is_bull_mom and is_strengthening:
                        overall_score -= 1
                        
                # Insight Trigger
                if overall_score >= 4:
                    final_signal = "BUY"
                elif overall_score <= -4:
                    final_signal = "SELL"
                    
            else:
                # --- Emulate "Classic" Pine Script Logic ---
                cond_ema_long = (last_row['close'] > last_row['ema_slow']) if self.use_ema_filter else True
                cond_ema_short = (last_row['close'] < last_row['ema_slow']) if self.use_ema_filter else True
                
                cond_rsi_long = (last_row['rsi'] <= rsi_os) if self.use_rsi_filter else True
                cond_rsi_short = (last_row['rsi'] >= rsi_ob) if self.use_rsi_filter else True

                cond_macd_long = (last_row['macd_line'] > last_row['macd_signal']) if self.use_macd_filter else True
                cond_macd_short = (last_row['macd_line'] < last_row['macd_signal']) if self.use_macd_filter else True

                if self.use_squeeze_filter:
                    was_squeezed = df['squeeze_on'].iloc[-6:-1].any()
                    is_squeezed = df['squeeze_on'].iloc[-1]
                    fired = was_squeezed and not is_squeezed
                    mom = last_row['close'] > df['close'].iloc[-int(self.squeeze_length):].mean()
                    cond_squeeze_long = fired and mom
                    cond_squeeze_short = fired and not mom
                else:
                    cond_squeeze_long = True
                    cond_squeeze_short = True

                is_bull_engulf = (last_row['close'] > last_row['open'] and 
                                  prev_row['close'] < prev_row['open'] and 
                                  last_row['close'] > prev_row['open'] and 
                                  last_row['open'] < prev_row['close'])
                                  
                is_bear_engulf = (last_row['close'] < last_row['open'] and 
                                  prev_row['close'] > prev_row['open'] and 
                                  last_row['close'] < prev_row['open'] and 
                                  last_row['open'] > prev_row['close'])
                                  
                cond_candle_long = is_bull_engulf if self.use_candle_filter else True
                cond_candle_short = is_bear_engulf if self.use_candle_filter else True

                buy_signal = cond_ema_long and cond_rsi_long and cond_macd_long and cond_squeeze_long and cond_candle_long
                sell_signal = cond_ema_short and cond_rsi_short and cond_macd_short and cond_squeeze_short and cond_candle_short
                
                if buy_signal and not sell_signal:
                    final_signal = "BUY"
                elif sell_signal and not buy_signal:
                    final_signal = "SELL"
                    
                if self.use_ema_filter:
                    if last_row['close'] > last_row['ema_slow']:
                        trend = "UP"
                    else:
                        trend = "DOWN"
                    
            self.current_state = {
                "signal": final_signal,
                "trend": trend,
                "rsi": rsi_val,
                "insight_score": overall_score if self.mode in ['Hybrid', 'Legacy'] else None,
                "last_updated": time.time()
            }
            
        except Exception as e:
            logger.error(f"[DualEngineTracker] Calculation error: {e}")
