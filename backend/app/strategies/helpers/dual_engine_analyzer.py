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
        self.use_triple_ema_filter = config.get("dual_engine_triple_ema_filter", False)
        self.use_rsi_filter = config.get("dual_engine_rsi_filter", False)
        self.use_candle_filter = config.get("dual_engine_candle_filter", False)
        self.use_macd_filter = config.get("dual_engine_macd_filter", False)
        self.use_squeeze_filter = config.get("dual_engine_squeeze_filter", False)
        self.use_adx_filter = config.get("dual_engine_adx_filter", False)
        self.use_vol_filter = config.get("dual_engine_vol_filter", False)
        self.use_confluence_mode = config.get("dual_engine_confluence_mode", False)
        self.min_confluence = config.get("dual_engine_min_confluence", 3)
        
        # Params
        self.ema_length = config.get("dual_engine_ema_length", 100)
        self.ema_fast = config.get("dual_engine_ema_fast", 10)
        self.ema_med = config.get("dual_engine_ema_med", 15)
        self.ema_slow = config.get("dual_engine_ema_slow", 27)
        self.rsi_length = config.get("dual_engine_rsi_length", 14)
        self.rsi_ob = config.get("dual_engine_rsi_ob", 70)
        self.rsi_os = config.get("dual_engine_rsi_os", 30)
        self.macd_fast = config.get("dual_engine_macd_fast", 12)
        self.macd_slow = config.get("dual_engine_macd_slow", 26)
        self.macd_signal = config.get("dual_engine_macd_signal", 9)
        self.squeeze_length = config.get("dual_engine_squeeze_length", 20)
        self.squeeze_bb_mult = config.get("dual_engine_squeeze_bb_mult", 2.0)
        self.squeeze_kc_mult = config.get("dual_engine_squeeze_kc_mult", 1.5)
        self.adx_length = config.get("dual_engine_adx_length", 14)
        self.adx_threshold = config.get("dual_engine_adx_threshold", 25)
        self.vol_length = config.get("dual_engine_vol_length", 20)
        self.vol_multiplier = config.get("dual_engine_vol_multiplier", 1.5)
        
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
        mapping = {
            "enable_dual_engine": "is_enabled",
            "dual_engine_mode": "mode",
            "dual_engine_ema_filter": "use_ema_filter",
            "dual_engine_triple_ema_filter": "use_triple_ema_filter",
            "dual_engine_rsi_filter": "use_rsi_filter",
            "dual_engine_candle_filter": "use_candle_filter",
            "dual_engine_macd_filter": "use_macd_filter",
            "dual_engine_squeeze_filter": "use_squeeze_filter",
            "dual_engine_adx_filter": "use_adx_filter",
            "dual_engine_vol_filter": "use_vol_filter",
            "dual_engine_confluence_mode": "use_confluence_mode",
            "dual_engine_min_confluence": "min_confluence",
            "dual_engine_ema_length": "ema_length",
            "dual_engine_ema_fast": "ema_fast",
            "dual_engine_ema_med": "ema_med",
            "dual_engine_ema_slow": "ema_slow",
            "dual_engine_rsi_length": "rsi_length",
            "dual_engine_rsi_ob": "rsi_ob",
            "dual_engine_rsi_os": "rsi_os",
            "dual_engine_macd_fast": "macd_fast",
            "dual_engine_macd_slow": "macd_slow",
            "dual_engine_macd_signal": "macd_signal",
            "dual_engine_squeeze_length": "squeeze_length",
            "dual_engine_squeeze_bb_mult": "squeeze_bb_mult",
            "dual_engine_squeeze_kc_mult": "squeeze_kc_mult",
            "dual_engine_adx_length": "adx_length",
            "dual_engine_adx_threshold": "adx_threshold",
            "dual_engine_vol_length": "vol_length",
            "dual_engine_vol_multiplier": "vol_multiplier",
        }
        
        updated_keys = []
        for k, v in kwargs.items():
            if k in mapping:
                setattr(self, mapping[k], v)
                updated_keys.append(k)
            elif hasattr(self, k):
                # Fallback for exact attribute matches
                setattr(self, k, v)
                updated_keys.append(k)
                
        if updated_keys:
            logger.info(f"⚡ [Dual Engine Tracker] Params live-updated cleanly: {updated_keys}")

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
                
            if self.use_triple_ema_filter:
                df['fast_ema'] = ta.ema(df['close'], length=int(self.ema_fast))
                df['med_ema'] = ta.ema(df['close'], length=int(self.ema_med))
                df['slow_ema'] = ta.ema(df['close'], length=int(self.ema_slow))
                
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
                
            if self.use_adx_filter:
                adx_df = ta.adx(df['high'], df['low'], df['close'], length=int(self.adx_length))
                if adx_df is not None and not adx_df.empty:
                    df['adx_str'] = adx_df.iloc[:, 0]
                else:
                    df['adx_str'] = 0.0

            if self.use_vol_filter:
                df['vol_ma'] = ta.sma(df['volume'], length=int(self.vol_length))
                
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
                
                cond_triple_ema_long = (last_row['fast_ema'] > last_row['med_ema'] and last_row['med_ema'] > last_row['slow_ema']) if self.use_triple_ema_filter else True
                cond_triple_ema_short = (last_row['fast_ema'] < last_row['med_ema'] and last_row['med_ema'] < last_row['slow_ema']) if self.use_triple_ema_filter else True
                
                cond_rsi_long = (last_row['rsi'] <= rsi_os) if self.use_rsi_filter else True
                cond_rsi_short = (last_row['rsi'] >= rsi_ob) if self.use_rsi_filter else True

                cond_macd_long = (last_row['macd_line'] > last_row['macd_signal']) if self.use_macd_filter else True
                cond_macd_short = (last_row['macd_line'] < last_row['macd_signal']) if self.use_macd_filter else True

                cond_adx = (last_row['adx_str'] > float(self.adx_threshold)) if self.use_adx_filter else True

                if self.use_vol_filter:
                    high_vol = last_row['volume'] > (last_row['vol_ma'] * float(self.vol_multiplier))
                    cond_vol_long = high_vol and last_row['close'] > last_row['open']
                    cond_vol_short = high_vol and last_row['close'] < last_row['open']
                else:
                    cond_vol_long = True
                    cond_vol_short = True

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

                if self.use_confluence_mode:
                    long_conditions = []
                    short_conditions = []
                    
                    if self.use_ema_filter:
                        long_conditions.append(cond_ema_long)
                        short_conditions.append(cond_ema_short)
                    if self.use_triple_ema_filter:
                        long_conditions.append(cond_triple_ema_long)
                        short_conditions.append(cond_triple_ema_short)
                    if self.use_rsi_filter:
                        long_conditions.append(cond_rsi_long)
                        short_conditions.append(cond_rsi_short)
                    if self.use_macd_filter:
                        long_conditions.append(cond_macd_long)
                        short_conditions.append(cond_macd_short)
                    if self.use_squeeze_filter:
                        long_conditions.append(cond_squeeze_long)
                        short_conditions.append(cond_squeeze_short)
                    if self.use_candle_filter:
                        long_conditions.append(cond_candle_long)
                        short_conditions.append(cond_candle_short)
                    if self.use_vol_filter:
                        long_conditions.append(cond_vol_long)
                        short_conditions.append(cond_vol_short)
                        
                    long_count = sum(1 for c in long_conditions if c)
                    short_count = sum(1 for c in short_conditions if c)
                    
                    buy_signal = (long_count >= int(self.min_confluence)) and cond_adx
                    sell_signal = (short_count >= int(self.min_confluence)) and cond_adx
                else:
                    buy_signal = cond_ema_long and cond_triple_ema_long and cond_rsi_long and cond_macd_long and cond_squeeze_long and cond_candle_long and cond_vol_long and cond_adx
                    sell_signal = cond_ema_short and cond_triple_ema_short and cond_rsi_short and cond_macd_short and cond_squeeze_short and cond_candle_short and cond_vol_short and cond_adx
                
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
