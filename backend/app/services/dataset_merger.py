import os
import glob
import pandas as pd
from datetime import datetime
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.orderbook_snapshot import OrderBookSnapshot

ARCHIVE_DIR = os.path.join(os.getcwd(), "uploads", "datasets", "historical_l2_archive")
MERGED_DIR = os.path.join(os.getcwd(), "uploads", "datasets")

class DatasetMergerService:
    """
    Enterprise-grade module to merge DVC (CSV), Parquet Archives, and Live Database
    into a single gap-free continuous dataset.
    """

    @classmethod
    def merge_datasets(cls, symbol: str, uploaded_csv_path: str = None, db: Session = None, user_id: int = None) -> dict:
        """
        Merges three data sources for a given symbol:
        1. The uploaded CSV (Historical DVC Snapshot) - OPTIONAL
        2. Local Parquet archives (Auto-Archived data)
        3. The current live Postgres database
        
        Returns a dict with the new filename and total rows.
        """
        dataframes = []

        # 1. Load the Uploaded CSV (DVC Snapshot) - Optional
        try:
            if uploaded_csv_path and os.path.exists(uploaded_csv_path):
                print(f"[DatasetMerger] Loading uploaded CSV: {uploaded_csv_path}")
                df_csv = pd.read_csv(uploaded_csv_path)
                
                # Ensure timestamp is datetime
                if 'timestamp' in df_csv.columns:
                    df_csv['timestamp'] = pd.to_datetime(df_csv['timestamp'])
                dataframes.append(df_csv)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read uploaded CSV: {str(e)}")

        # 2. Load Local Parquet Archives
        clean_symbol = "".join(c if c.isalnum() else "_" for c in symbol)
        archive_files = glob.glob(os.path.join(ARCHIVE_DIR, f"l2_archive_{clean_symbol}_*.parquet"))
        
        for p_file in archive_files:
            try:
                print(f"[DatasetMerger] Loading Parquet Archive: {p_file}")
                df_parquet = pd.read_parquet(p_file)
                if 'timestamp' in df_parquet.columns:
                    df_parquet['timestamp'] = pd.to_datetime(df_parquet['timestamp'])
                dataframes.append(df_parquet)
            except Exception as e:
                print(f"[DatasetMerger] Warning: Failed to read parquet {p_file}: {e}")

        # 3. Load Live Database Data
        try:
            print(f"[DatasetMerger] Fetching live database snapshots for {symbol}...")
            live_snapshots = db.query(OrderBookSnapshot).filter(OrderBookSnapshot.symbol == symbol).all()
            if live_snapshots:
                live_data = []
                for s in live_snapshots:
                    live_data.append({
                        "exchange": s.exchange,
                        "symbol": s.symbol,
                        "timestamp": s.timestamp,
                        "bids": s.bids,
                        "asks": s.asks,
                        "obi": s.obi,
                        "spread": s.spread,
                        "microprice": s.microprice,
                        "trade_count": s.trade_count,
                        "buy_volume": s.buy_volume,
                        "sell_volume": s.sell_volume,
                        "trade_price": s.trade_price
                    })
                df_live = pd.DataFrame(live_data)
                df_live['timestamp'] = pd.to_datetime(df_live['timestamp'])
                dataframes.append(df_live)
        except Exception as e:
            print(f"[DatasetMerger] Warning: Failed to fetch live DB data: {e}")

        if not dataframes:
            raise HTTPException(status_code=400, detail="No data sources found to merge.")

        # 4. Concatenate, Deduplicate, and Sort
        print("[DatasetMerger] Concatenating datasets...")
        merged_df = pd.concat(dataframes, ignore_index=True)
        
        print("[DatasetMerger] Deduplicating and Sorting...")
        merged_df = merged_df.drop_duplicates(subset=['timestamp'], keep='last')
        merged_df = merged_df.sort_values(by='timestamp')

        # 5. Save the Merged Dataset
        date_str = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        merged_filename = f"dataset_merged_{clean_symbol}_{date_str}.csv"
        merged_filepath = os.path.join(MERGED_DIR, merged_filename)

        print(f"[DatasetMerger] Saving merged mega-dataset to {merged_filepath}...")
        merged_df.to_csv(merged_filepath, index=False)
        
        total_rows = len(merged_df)
        print(f"[DatasetMerger] Merge Complete! Total Rows: {total_rows}")

        # Clean up the uploaded temp file
        try:
            if uploaded_csv_path and os.path.exists(uploaded_csv_path):
                os.remove(uploaded_csv_path)
        except:
            pass

        if user_id and db:
            from app.services.notification import NotificationService
            import asyncio
            msg = f"✅ *Dataset Merge Complete!*\nSymbol: {symbol}\nTotal Rows: {total_rows:,}\nFile: `{merged_filename}`"
            
            # Since merge_datasets is synchronous, run the async notification synchronously
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    asyncio.create_task(NotificationService.send_message(db, user_id, msg, parse_mode="Markdown"))
                else:
                    loop.run_until_complete(NotificationService.send_message(db, user_id, msg, parse_mode="Markdown"))
            except RuntimeError:
                asyncio.run(NotificationService.send_message(db, user_id, msg, parse_mode="Markdown"))

        return {
            "status": "success",
            "merged_filename": merged_filename,
            "total_rows": total_rows,
            "sources": {
                "uploaded_csv": True,
                "parquet_archives": len(archive_files),
                "live_db": True if live_snapshots else False
            }
        }
