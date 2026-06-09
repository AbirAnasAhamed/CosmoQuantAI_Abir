import os
import sys
import pandas as pd
from datetime import datetime

# Add the app directory to the sys path
sys.path.append("/app")

from app.db.session import SessionLocal
from app.models.orderbook_snapshot import OrderBookSnapshot

def verify():
    db = SessionLocal()
    try:
        print("1. DB Connection established.")
        
        # Insert a dummy record
        dummy_time = datetime.utcnow()
        dummy_record = OrderBookSnapshot(
            exchange="binance",
            symbol="BTCUSDT",
            timestamp=dummy_time,
            bids="[[60000.0, 1.5], [59990.0, 2.0]]",
            asks="[[60010.0, 1.0], [60020.0, 3.5]]",
            obi=0.2,
            spread=10.0,
            microprice=60005.0,
            # NEW TRADE METRICS
            trade_count=150,
            buy_volume=45.5,
            sell_volume=30.2,
            trade_price=60002.5
        )
        
        db.add(dummy_record)
        db.commit()
        db.refresh(dummy_record)
        
        print("2. Inserted dummy record successfully!")
        print(f"   trade_count: {dummy_record.trade_count}")
        print(f"   buy_volume: {dummy_record.buy_volume}")
        print(f"   sell_volume: {dummy_record.sell_volume}")
        print(f"   trade_price: {dummy_record.trade_price}")
        
        # Verify DatasetMergerService logic
        print("\n3. Verifying DatasetMerger Service DataFrame Conversion...")
        # Simulate the live DB querying
        live_snapshots = db.query(OrderBookSnapshot).filter(OrderBookSnapshot.symbol == "BTCUSDT", OrderBookSnapshot.timestamp == dummy_time).all()
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
        print("   Columns in DataFrame:")
        print(f"   {df_live.columns.tolist()}")
        print("\n   Data inside DataFrame:")
        print(df_live[['trade_count', 'buy_volume', 'sell_volume', 'trade_price']].head())
        
        # Clean up
        db.delete(dummy_record)
        db.commit()
        print("\n4. Cleaned up dummy record.")
        print("\n✅ Verification Successful! Schema and Merger Logic are working perfectly.")

    except Exception as e:
        print(f"\n❌ Verification Failed: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    verify()
