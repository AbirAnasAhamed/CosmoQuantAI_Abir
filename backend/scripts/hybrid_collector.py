import asyncio
import websockets
import json
import pandas as pd
import os
from datetime import datetime
import argparse
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(SCRIPT_DIR)
if BACKEND_DIR not in sys.path:
    sys.path.append(BACKEND_DIR)

from app.db.session import SessionLocal
from app.models.model_training import ModelTrainingJob, TrainingStatus

SYMBOL = "btcusdt"
DEPTH_LEVELS = 20
UPDATE_SPEED = "100ms"
CHUNK_SIZE = 20000
DATA_DIR = os.path.join(BACKEND_DIR, "data", "raw", "hybrid_snapshots")

# Shared state for trades
latest_trade = {
    "trade_price": None,
    "trade_volume": 0.0,
    "trade_count": 0,
    "buy_volume": 0.0,
    "sell_volume": 0.0
}
trade_lock = asyncio.Lock()

def add_job_log(db, job_id, msg):
    print(f"[{datetime.now()}] {msg}")
    if not job_id: return
    try:
        job = db.query(ModelTrainingJob).filter(ModelTrainingJob.id == job_id).first()
        if job:
            logs = list(job.logs) if job.logs else []
            logs.append(f"[{datetime.utcnow().strftime('%H:%M:%S')}] {msg}")
            job.logs = logs
            db.commit()
    except Exception as e:
        print(f"Failed to update log: {e}")

async def trade_listener(symbol_ws: str, stop_event: asyncio.Event):
    url = f"wss://stream.binance.com:9443/ws/{symbol_ws}@trade"
    while not stop_event.is_set():
        try:
            async with websockets.connect(url) as websocket:
                while not stop_event.is_set():
                    try:
                        msg = await asyncio.wait_for(websocket.recv(), timeout=2.0)
                        data = json.loads(msg)
                        price = float(data['p'])
                        qty = float(data['q'])
                        is_buyer_maker = data['m']  # If true, it means it's a SELL trade. If false, it's a BUY trade.
                        
                        async with trade_lock:
                            latest_trade["trade_price"] = price
                            latest_trade["trade_volume"] += qty
                            latest_trade["trade_count"] += 1
                            if is_buyer_maker:
                                latest_trade["sell_volume"] += qty
                            else:
                                latest_trade["buy_volume"] += qty
                                
                    except asyncio.TimeoutError:
                        continue
        except Exception:
            await asyncio.sleep(2)  # Reconnect delay

async def l2_listener(target_rows: int, symbol_ws: str, symbol_orig: str, session_id: str, job_id: str, stop_event: asyncio.Event):
    url = f"wss://stream.binance.com:9443/ws/{symbol_ws}@depth{DEPTH_LEVELS}@{UPDATE_SPEED}"
    buffer = []
    total_collected = 0
    chunk_index = 0
    chunk_files = []
    last_logged_percent = -1
    
    db = SessionLocal()
    add_job_log(db, job_id, f"Starting Hybrid Collector for {symbol_orig.upper()}")
    add_job_log(db, job_id, f"Target: {target_rows:,} rows. Syncing L2 + Trades...")

    try:
        async with websockets.connect(url) as websocket:
            while total_collected < target_rows and not stop_event.is_set():
                if total_collected % 100 == 0 and job_id:
                    db.expire_all()
                    job = db.query(ModelTrainingJob).filter(ModelTrainingJob.id == job_id).first()
                    if job and (job.status == TrainingStatus.FAILED or job.status == TrainingStatus.PAUSED or (job.error_message and "cancel" in job.error_message.lower())):
                        add_job_log(db, job_id, "🛑 Hybrid Collector was cancelled by user.")
                        stop_event.set()
                        break

                try:
                    msg = await asyncio.wait_for(websocket.recv(), timeout=5)
                except asyncio.TimeoutError:
                    continue

                data = json.loads(msg)
                row = {"timestamp": pd.Timestamp.now()}
                
                # Attach Trades
                async with trade_lock:
                    row["trade_price"] = latest_trade["trade_price"]
                    row["trade_volume"] = latest_trade["trade_volume"]
                    row["trade_count"] = latest_trade["trade_count"]
                    row["buy_volume"] = latest_trade["buy_volume"]
                    row["sell_volume"] = latest_trade["sell_volume"]
                    
                    # Reset accumulators for next 100ms L2 frame
                    latest_trade["trade_volume"] = 0.0
                    latest_trade["trade_count"] = 0
                    latest_trade["buy_volume"] = 0.0
                    latest_trade["sell_volume"] = 0.0

                bids = data.get("bids", [])
                asks = data.get("asks", [])
                
                for i in range(DEPTH_LEVELS):
                    if i < len(bids):
                        row[f"bid_price_{i+1}"] = float(bids[i][0])
                        row[f"bid_volume_{i+1}"] = float(bids[i][1])
                    else:
                        row[f"bid_price_{i+1}"] = None
                        row[f"bid_volume_{i+1}"] = None
                        
                    if i < len(asks):
                        row[f"ask_price_{i+1}"] = float(asks[i][0])
                        row[f"ask_volume_{i+1}"] = float(asks[i][1])
                    else:
                        row[f"ask_price_{i+1}"] = None
                        row[f"ask_volume_{i+1}"] = None

                buffer.append(row)
                total_collected += 1

                current_percent = int((total_collected / target_rows) * 100)
                if current_percent > last_logged_percent and job_id:
                    last_logged_percent = current_percent
                    job = db.query(ModelTrainingJob).filter(ModelTrainingJob.id == job_id).first()
                    if job:
                        job.progress = float(current_percent)
                        db.commit()
                    add_job_log(db, job_id, f"⬇️ Hybrid Download: {current_percent}% ({total_collected:,} / {target_rows:,} rows)")

                if len(buffer) >= CHUNK_SIZE or total_collected >= target_rows:
                    chunk_index += 1
                    df = pd.DataFrame(buffer)
                    symbol_safe = symbol_orig.replace("/", "_").upper()
                    chunk_filename = os.path.join(DATA_DIR, f"{symbol_safe}_temp_chunk_{session_id}_{chunk_index}.parquet")
                    df.to_parquet(chunk_filename, index=False)
                    chunk_files.append(chunk_filename)
                    buffer.clear()
                    
    except asyncio.CancelledError:
        add_job_log(db, job_id, "Collection task was cancelled.")
    except Exception as e:
        add_job_log(db, job_id, f"Error during WebSocket collection: {e}")
        if job_id:
            job = db.query(ModelTrainingJob).filter(ModelTrainingJob.id == job_id).first()
            if job and job.status == TrainingStatus.RUNNING:
                job.status = TrainingStatus.FAILED
                job.error_message = str(e)
                db.commit()

    # Finish and merge
    stop_event.set()
    return chunk_files, db

async def collect_hybrid_data(target_rows: int, symbol: str = SYMBOL, job_id: str = None):
    symbol_ws = symbol.replace("/", "").lower()
    os.makedirs(DATA_DIR, exist_ok=True)
    session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    stop_event = asyncio.Event()

    task1 = asyncio.create_task(trade_listener(symbol_ws, stop_event))
    task2 = asyncio.create_task(l2_listener(target_rows, symbol_ws, symbol, session_id, job_id, stop_event))

    chunk_files, db = await task2
    await task1

    # Merge Process
    if chunk_files:
        add_job_log(db, job_id, f"Target reached or stopped. Merging {len(chunk_files)} hybrid chunks...")
        try:
            dfs = [pd.read_parquet(f) for f in chunk_files]
            final_df = pd.concat(dfs, ignore_index=True)
            symbol_safe = symbol.replace("/", "_").upper()
            
            final_filename = os.path.join(DATA_DIR, f"{symbol_safe}_HYBRID_{target_rows}_{session_id}.parquet")
            final_df.to_parquet(final_filename, index=False)
            add_job_log(db, job_id, f"✅ Final Hybrid Snapshot saved successfully: {final_filename}")
            
            # Cleanup
            for f in chunk_files:
                try:
                    os.remove(f)
                except Exception:
                    pass
            
            if job_id:
                job = db.query(ModelTrainingJob).filter(ModelTrainingJob.id == job_id).first()
                if job and job.status == TrainingStatus.RUNNING:
                    job.progress = 100.0
                    job.status = TrainingStatus.COMPLETED
                    db.commit()
                    
        except Exception as e:
            add_job_log(db, job_id, f"Error during merge process: {e}")
            if job_id:
                job = db.query(ModelTrainingJob).filter(ModelTrainingJob.id == job_id).first()
                if job:
                    job.status = TrainingStatus.FAILED
                    job.error_message = str(e)
                    db.commit()
    else:
        msg = "No hybrid data collected to merge."
        add_job_log(db, job_id, msg)
        if job_id:
            job = db.query(ModelTrainingJob).filter(ModelTrainingJob.id == job_id).first()
            if job and job.status == TrainingStatus.RUNNING:
                job.status = TrainingStatus.FAILED
                job.error_message = msg
                db.commit()
        
    if db:
        db.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Hybrid L2+Trades Data Collector")
    parser.add_argument("--target", type=int, default=200000, help="Total number of rows to collect")
    parser.add_argument("--symbol", type=str, default="btcusdt", help="Trading pair symbol")
    parser.add_argument("--job_id", type=str, default=None, help="Database Job ID to track progress")
    
    args = parser.parse_args()
    
    try:
        asyncio.run(collect_hybrid_data(args.target, args.symbol, args.job_id))
    except KeyboardInterrupt:
        print("\nHybrid Collector stopped manually.")
