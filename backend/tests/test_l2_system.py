import asyncio
from app.db.session import SessionLocal
from app.models.orderbook_snapshot import OrderBookSnapshot
from app.tasks import prune_l2_data
from datetime import datetime, timedelta

def test_l2_data():
    db = SessionLocal()
    try:
        # 1. Check Total Rows
        total_rows = db.query(OrderBookSnapshot).count()
        print(f"📊 Total L2 Snapshots in DB: {total_rows}")
        
        if total_rows > 0:
            # 2. Check the latest row
            latest = db.query(OrderBookSnapshot).order_by(OrderBookSnapshot.timestamp.desc()).first()
            oldest = db.query(OrderBookSnapshot).order_by(OrderBookSnapshot.timestamp.asc()).first()
            
            print(f"🕒 Oldest Snapshot: {oldest.timestamp} (Symbol: {oldest.symbol})")
            print(f"🕒 Latest Snapshot: {latest.timestamp} (Symbol: {latest.symbol})")
            print(f"💧 Microprice: {latest.microprice}, Spread: {latest.spread}, OBI: {latest.obi}")
            
            # 3. Time difference
            diff = latest.timestamp - oldest.timestamp
            print(f"⏳ Data covers a period of: {diff}")
        else:
            print("⚠️ No data found in orderbook_snapshots table.")

        # 4. Test Pruning Logic manually (Dry Run)
        threshold = datetime.utcnow() - timedelta(hours=24)
        old_count = db.query(OrderBookSnapshot).filter(OrderBookSnapshot.timestamp < threshold).count()
        print(f"🧹 Rows older than 24h (Ready for auto-pruning): {old_count}")

        # Actually call the celery task function just to see if it throws an error
        print("\n🚀 Testing Celery Prune Task Execution...")
        result = prune_l2_data()
        print(f"✅ Prune task output: {result}")

    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    print("--- L2 Data Collector & Pruning Verification ---")
    test_l2_data()
    print("----------------------------------------------")
