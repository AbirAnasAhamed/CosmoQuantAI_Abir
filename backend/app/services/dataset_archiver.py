import os
import glob
import pandas as pd
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.orderbook_snapshot import OrderBookSnapshot
from app.services.notification import NotificationService
from app.db.session import SessionLocal

# Define the archive directory
ARCHIVE_DIR = os.path.join(os.getcwd(), "uploads", "datasets", "historical_l2_archive")
MAX_ARCHIVE_SIZE_BYTES = 9.5 * 1024 * 1024 * 1024  # 9.5 GB (leaves 500MB buffer for safety)

class DatasetArchiver:
    """
    Enterprise-grade module for archiving L2 OrderBook snapshots before they are pruned from the database.
    Ensures long-term data retention without database bloat, while strictly enforcing a 10GB disk limit.
    """

    @classmethod
    def _ensure_dir(cls):
        os.makedirs(ARCHIVE_DIR, exist_ok=True)

    @classmethod
    def enforce_size_limit(cls, add_log_func=None):
        """
        Scans the archive directory. If total size exceeds MAX_ARCHIVE_SIZE_BYTES,
        deletes the oldest files until the size is under the limit.
        """
        cls._ensure_dir()
        
        # Get all parquet files with their sizes and modification times
        files = glob.glob(os.path.join(ARCHIVE_DIR, "*.parquet"))
        if not files:
            return

        file_stats = []
        total_size = 0
        for f in files:
            try:
                stat = os.stat(f)
                size = stat.st_size
                mtime = stat.st_mtime
                file_stats.append({'path': f, 'size': size, 'mtime': mtime})
                total_size += size
            except OSError:
                continue

        if total_size <= MAX_ARCHIVE_SIZE_BYTES:
            if total_size > 9 * 1024 * 1024 * 1024:  # Warning at 9GB
                db = SessionLocal()
                NotificationService.broadcast_admin_alert_sync(
                    db,
                    f"⚠️ *Storage Warning*\nAuto-Archiver storage is approaching limits!\nCurrent Size: {total_size / (1024**3):.2f} GB / 10 GB.",
                    parse_mode="Markdown"
                )
                db.close()
            return

        # Sort files from oldest to newest based on modification time
        file_stats.sort(key=lambda x: x['mtime'])

        bytes_freed = 0
        files_deleted = 0

        for f_stat in file_stats:
            if total_size <= MAX_ARCHIVE_SIZE_BYTES:
                break
            
            try:
                os.remove(f_stat['path'])
                total_size -= f_stat['size']
                bytes_freed += f_stat['size']
                files_deleted += 1
                if add_log_func:
                    add_log_func(f"[Archiver] Deleted old archive to free space: {os.path.basename(f_stat['path'])}")
            except Exception as e:
                if add_log_func:
                    add_log_func(f"[Archiver] Error deleting {f_stat['path']}: {e}")

        if add_log_func and files_deleted > 0:
            msg = f"🗑️ *Auto-Archiver Cleaned Up Space*\nEnforced 10GB limit: Deleted {files_deleted} old files, freed {bytes_freed / (1024**2):.2f} MB."
            add_log_func(f"[Archiver] {msg}")
            db = SessionLocal()
            NotificationService.broadcast_admin_alert_sync(db, msg, parse_mode="Markdown")
            db.close()

    @classmethod
    def archive_snapshots(cls, snapshots: list[OrderBookSnapshot], add_log_func=None) -> bool:
        """
        Converts SQLAlchemy models to a highly compressed Parquet file.
        Groups by symbol to avoid massive mixed files.
        """
        if not snapshots:
            return False

        cls._ensure_dir()

        # Enforce size limit BEFORE adding new files
        cls.enforce_size_limit(add_log_func)

        try:
            # Convert to dictionary format
            data = []
            for s in snapshots:
                import json
                bids_val = json.dumps(s.bids) if not isinstance(s.bids, str) else s.bids
                asks_val = json.dumps(s.asks) if not isinstance(s.asks, str) else s.asks
                
                data.append({
                    "id": s.id,
                    "exchange": s.exchange,
                    "symbol": s.symbol,
                    "timestamp": s.timestamp,
                    "bids": bids_val,
                    "asks": asks_val,
                    "obi": s.obi,
                    "spread": s.spread,
                    "microprice": s.microprice
                })

            df = pd.DataFrame(data)
            df["bids"] = df["bids"].astype(str)
            df["asks"] = df["asks"].astype(str)
            
            # Group by symbol and save separately
            for symbol, group_df in df.groupby("symbol"):
                # Clean symbol for filename
                clean_symbol = "".join(c if c.isalnum() else "_" for c in symbol)
                date_str = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
                
                filename = f"l2_archive_{clean_symbol}_{date_str}.parquet"
                filepath = os.path.join(ARCHIVE_DIR, filename)
                
                # Use pyarrow compression for maximum space efficiency
                group_df.to_parquet(filepath, engine='pyarrow', compression='snappy', index=False)
                
                if add_log_func:
                    add_log_func(f"[Archiver] Archived {len(group_df)} rows for {symbol} to {filename}")
                
            db = SessionLocal()
            NotificationService.broadcast_admin_alert_sync(
                db,
                f"✅ *24H Backup Success*\nSuccessfully archived {len(snapshots)} L2 rows to compressed Parquet format.",
                parse_mode="Markdown"
            )
            db.close()
            return True

        except Exception as e:
            if add_log_func:
                add_log_func(f"[Archiver] Failed to archive snapshots: {e}")
            db = SessionLocal()
            NotificationService.broadcast_admin_alert_sync(
                db,
                f"❌ *Auto-Archiver Failed*\nError: {e}",
                parse_mode="Markdown"
            )
            db.close()
            return False
