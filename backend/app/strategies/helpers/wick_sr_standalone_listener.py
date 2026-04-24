import asyncio
import logging
from app.services.market_depth_service import market_depth_service

logger = logging.getLogger(__name__)

class WickSRStandaloneListener:
    def __init__(self, bot_instance):
        self.bot = bot_instance
        self.tracker = bot_instance.wick_sr_tracker
        self.exchange_id = bot_instance.exchange_id
        self.symbol = bot_instance.symbol
        self.running = False
        self.last_candle_time = 0

    async def start(self):
        self.running = True
        logger.info(f"[WickSR] Standalone Listener started for {self.symbol} on {self.tracker.timeframe}.")

        while self.running:
            try:
                klines = await market_depth_service.fetch_ohlcv(
                    symbol=self.symbol,
                    exchange_id=self.exchange_id,
                    timeframe=self.tracker.timeframe,
                    limit=getattr(self.bot, 'wick_sr_lookback', 300)
                )

                if klines and len(klines) > 0:
                    # fetch_ohlcv returns dicts with key 'time' (Unix seconds),
                    # but WickSRTracker expects 'high', 'low', 'close' keys — which are present.
                    # 'timestamp' was incorrectly referenced; use 'time' instead.
                    latest_time = klines[-1].get('time', klines[-1].get('timestamp', 0))

                    self.tracker.update_levels(klines)
                    self.last_candle_time = latest_time

                    level_count = len(self.tracker.levels)
                    if level_count > 0:
                        logger.debug(
                            f"[WickSR] {self.symbol} | {self.tracker.timeframe} | "
                            f"Tracking {level_count} levels."
                        )

                await asyncio.sleep(2.5)

            except asyncio.CancelledError:
                self.running = False
                break
            except Exception as e:
                logger.warning(
                    f"[WickSR] Listener error for {self.symbol}: {e}. Retrying in 5s..."
                )
                await asyncio.sleep(5)

    async def stop(self):
        self.running = False
        logger.info(f"[WickSR] Standalone Listener stopped for {self.symbol}.")
