import asyncio
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from sqlalchemy import select, and_
from app.db.session import SessionLocal
from app.models.orderbook_snapshot import OrderBookSnapshot
from app.services.market_depth_service import market_depth_service
from app.services.websocket_manager import manager  # To know which symbols are active

logger = logging.getLogger(__name__)

class OrderbookSnapshotService:
    def __init__(self):
        self.running = False
        self.interval_seconds = 60 # Take snapshot every 60 seconds

    async def start_recording_loop(self):
        self.running = True
        logger.info("🚀 Starting Historcial Orderbook Snapshot recording loop...")
        while self.running:
            try:
                await self.record_snapshots()
            except asyncio.CancelledError:
                logger.info("Orderbook Snapshot loop cancelled.")
                break
            except Exception as e:
                logger.error(f"Error in Orderbook Snapshot loop: {e}")
            
            await asyncio.sleep(self.interval_seconds)

    async def stop_recording_loop(self):
        self.running = False

    async def record_snapshots(self):
        # We only take snapshots for symbols that have active websocket connections
        # OR you can hardcore top 5/10. For now, tracking active ones is most efficient.
        active_symbols = list(manager.active_connections.keys())
        
        # Filter out general/logs/backtest channels and internal pub-sub channels
        NON_MARKET_CHANNELS = {
            "general", "backtest", "block_trades", "dashboard",
            "options_live", "correlation_feed", "system_alerts", "container_logs",
        }
        symbols_to_record = set()
        for s in active_symbols:
            if (
                s not in NON_MARKET_CHANNELS
                and not s.startswith("logs_")
                and not s.startswith("status_")
                and not s.startswith("godmode_")
            ):
                symbols_to_record.add(s)

        if not symbols_to_record:
            return

        db = SessionLocal()
        try:
            for symbol in symbols_to_record:
                # 1. Fetch current orderbook snapshot. 
                # We use the existing heatmap service which is optimized and cached.
                # exchange is always 'binance' by default in the system based on other workers
                try:
                    data = await market_depth_service.fetch_order_book_heatmap(
                        symbol=symbol,
                        exchange_id='binance',
                        depth=100,
                        bucket_size=50.0 # Same default as frontend
                    )
                    
                    if not data or not data.get("bids") or not data.get("asks"):
                        continue
                        
                    # 2. Save to database
                    snapshot = OrderBookSnapshot(
                        exchange='binance',
                        symbol=symbol,
                        timestamp=datetime.utcnow(),
                        bids=data["bids"],
                        asks=data["asks"]
                    )
                    db.add(snapshot)
                
                except Exception as e:
                    logger.error(f"Failed to record orderbook snapshot for {symbol}: {e}")
            
            # Commit all chunks at once
            db.commit()
            
        finally:
            db.close()

    async def get_historical_snapshots(
        self, 
        symbol: str, 
        exchange: str, 
        start_time: datetime, 
        end_time: datetime,
        interval: str = "1m"
    ) -> List[Dict[str, Any]]:
        """
        Fetches historical snapshots.
        If interval is high, we might want to sample. For now, we return all records 
        within the range since we record exactly every interval_seconds.
        """
        db = SessionLocal()
        try:
            query = select(OrderBookSnapshot).where(
                and_(
                    OrderBookSnapshot.symbol == symbol,
                    OrderBookSnapshot.exchange == exchange,
                    OrderBookSnapshot.timestamp >= start_time,
                    OrderBookSnapshot.timestamp <= end_time
                )
            ).order_by(OrderBookSnapshot.timestamp.asc())
            
            result = db.execute(query).scalars().all()
            
            formatted_data = []
            for record in result:
                formatted_data.append({
                    "timestamp": record.timestamp.isoformat(),
                    "bids": record.bids,
                    "asks": record.asks
                })
                
            return formatted_data
        finally:
            db.close()


orderbook_snapshot_service = OrderbookSnapshotService()
