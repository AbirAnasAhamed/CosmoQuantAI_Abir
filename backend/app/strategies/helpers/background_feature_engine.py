import asyncio
import time
import pandas as pd
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

class BackgroundFeatureEngine:
    """
    Background Feature Engine for HFT Bots.
    Maintains a rolling cache of slow-to-calculate features (Trade, PLP) so that 
    the real-time L2 predictor can access them instantly without latency.
    """
    def __init__(self, symbol: str, required_features: list, is_futures: bool = False):
        self.symbol = symbol
        self.required_features = required_features
        self.latest_features_cache: Dict[str, float] = {}
        self.is_running = False
        self.is_futures = is_futures or ":" in symbol
        self._task = None
        self._lock = asyncio.Lock()

        # Identify which categories of features we need to calculate
        from app.services.hybrid_deep_pipeline import _KNOWN_TRADE_FEATURES
        self.needs_trade_features = any(f in _KNOWN_TRADE_FEATURES for f in required_features)
        
        # Assume any feature not in L2 or Trade lists might be PLP
        _KNOWN_L2_FEATURES = {
            'obi', 'spread', 'microprice', 'ofi_acceleration', 'imbalance_momentum', 
            'depth_ratio', 'cvd_proxy', 'multi_level_imb_top5', 'Close'
        }
        self.needs_plp_features = any(
            f not in _KNOWN_TRADE_FEATURES and f not in _KNOWN_L2_FEATURES 
            for f in required_features
        )

    async def start(self):
        """Starts the background polling task."""
        if self.is_running:
            return
            
        if not self.needs_trade_features and not self.needs_plp_features:
            logger.info(f"BackgroundFeatureEngine: No complex features required for {self.symbol}. Skipping.")
            return
            
        self.is_running = True
        self._task = asyncio.create_task(self._cache_loop())
        logger.info(f"BackgroundFeatureEngine started for {self.symbol}.")

    async def stop(self):
        """Stops the background task."""
        self.is_running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info(f"BackgroundFeatureEngine stopped for {self.symbol}.")

    def get_latest_features(self) -> Dict[str, float]:
        """Returns the instantly available cached features."""
        # Fast non-blocking read since it's just a dict reference update in Python
        return self.latest_features_cache

    async def _cache_loop(self):
        import ccxt.pro as ccxt_pro
        # Use binanceusdm for futures if symbol contains ':', else binance spot
        if self.is_futures:
            exchange = ccxt_pro.binanceusdm({'enableRateLimit': True})
        else:
            exchange = ccxt_pro.binance({'enableRateLimit': True})
            
        from app.services.hybrid_deep_pipeline import calculate_trade_tick_features

        trades_cache = []
        try:
            # Prefill cache via REST so features are instantly available
            initial = await exchange.fetch_trades(self.symbol, limit=1000)
            if initial:
                trades_cache.extend(initial)
        except Exception as e:
            logger.warning(f"BackgroundFeatureEngine: fetch_trades prefill failed: {e}")

        last_calc_time = 0.0

        while self.is_running:
            try:
                # 1. Watch trades via websocket (blocks until new trades)
                new_trades = await exchange.watch_trades(self.symbol)
                if not new_trades:
                    await asyncio.sleep(0.1)
                    continue
                    
                trades_cache.extend(new_trades)
                
                # Keep last 1000, deduplicating by ID
                if len(trades_cache) > 1000:
                    trades_by_id = {}
                    no_id = []
                    for t in trades_cache:
                        if t.get('id'):
                            trades_by_id[t['id']] = t
                        else:
                            no_id.append(t)
                    
                    merged = no_id + list(trades_by_id.values())
                    merged.sort(key=lambda x: x['timestamp'] if x.get('timestamp') else 0)
                    trades_cache = merged[-1000:]
                    
                trades = trades_cache
                
                if not trades:
                    continue
                    
                # THROTTLE: Only calculate heavy Pandas features at most once per second
                # This prevents CPU/Memory overload from high-frequency websocket ticks
                current_time = time.time()
                if current_time - last_calc_time < 1.0:
                    continue
                last_calc_time = current_time
                    
                # Run the heavy Pandas feature calculation in a background thread to prevent blocking
                last_row = await asyncio.to_thread(self._calculate_features_sync, trades)
                
                if last_row is None:
                    continue
                
                async with self._lock:
                    self.latest_features_cache = last_row
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                err_msg = str(e)
                if any(x in err_msg for x in ["1006", "1008", "1011", "1012", "closed by remote server", "Connection closed", "timeout", "timed out"]):
                    logger.warning(f"BackgroundFeatureEngine websocket disconnected for {self.symbol}: {e}. Reconnecting...")
                else:
                    logger.error(f"BackgroundFeatureEngine error for {self.symbol}: {e}")
                
                # Fallback for ccxt symbol mapping issues
                if "does not have market" in err_msg or "BadSymbol" in err_msg:
                    if ":" in self.symbol:
                        new_sym = self.symbol.split(":")[0]
                        logger.warning(f"BackgroundFeatureEngine: Retrying watch_trades with fallback symbol {new_sym}")
                        try:
                            _ = await exchange.watch_trades(new_sym)
                            self.symbol = new_sym # If successful, keep using it
                        except Exception:
                            pass
                else:
                    # Sleep 5 seconds on general error before next poll to avoid rate limits / spamming
                    await asyncio.sleep(5.0)
            
        await exchange.close()

    def _calculate_features_sync(self, trades: list) -> dict:
        """
        Synchronous method to calculate heavy Pandas features. 
        Runs in a background thread.
        """
        try:
            from app.services.hybrid_deep_pipeline import calculate_trade_tick_features
            
            t_data = []
            for t in trades:
                t_data.append({
                    'timestamp': pd.to_datetime(t['timestamp'], unit='ms'),
                    'price': float(t['price']),
                    'qty': float(t['amount']),
                    'is_buyer_maker': t['side'] == 'sell'
                })
                
            df = pd.DataFrame(t_data)
            df.set_index('timestamp', inplace=True)
            
            # Provide a Close proxy for PLP calculations
            df['Close'] = df['price']

            # 2. Calculate Trade features
            if self.needs_trade_features:
                df = calculate_trade_tick_features(df, self.required_features)
                
            # 3. Calculate PLP features
            if self.needs_plp_features:
                try:
                    from app.services.predatory_liquidity_pipeline import calculate_plp_features
                    plp_df = calculate_plp_features(df, self.required_features)
                    for col in plp_df.columns:
                        df[col] = plp_df[col]
                except Exception as e:
                    logger.warning(f"BackgroundFeatureEngine: PLP calculation error: {e}")

            # 4. Extract the last row and update atomic cache
            return df.iloc[-1].to_dict()
        except Exception as e:
            logger.error(f"BackgroundFeatureEngine: Sync feature calc error: {e}")
            return None
