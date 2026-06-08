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
        import ccxt.async_support as ccxt_async
        # Use binanceusdm for futures if symbol contains ':', else binance spot
        if self.is_futures:
            exchange = ccxt_async.binanceusdm({'enableRateLimit': True})
        else:
            exchange = ccxt_async.binance({'enableRateLimit': True})
            
        from app.services.hybrid_deep_pipeline import calculate_trade_tick_features

        while self.is_running:
            try:
                # 1. Fetch recent trades (limit 1000 is usually enough for rolling features)
                trades = await exchange.fetch_trades(self.symbol, limit=1000)
                if not trades:
                    await asyncio.sleep(2)
                    continue
                    
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
                last_row = df.iloc[-1].to_dict()
                
                async with self._lock:
                    self.latest_features_cache = last_row
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"BackgroundFeatureEngine error for {self.symbol}: {e}")
                # Fallback for ccxt symbol mapping issues
                if "does not have market" in str(e) or "BadSymbol" in str(e):
                    if ":" in self.symbol:
                        new_sym = self.symbol.split(":")[0]
                        logger.warning(f"BackgroundFeatureEngine: Retrying fetch_trades with fallback symbol {new_sym}")
                        try:
                            _ = await exchange.fetch_trades(new_sym, limit=10)
                            self.symbol = new_sym # If successful, keep using it
                        except Exception:
                            pass
                
            # Sleep 2 seconds before next poll to avoid rate limits
            await asyncio.sleep(2.0)
            
        await exchange.close()
