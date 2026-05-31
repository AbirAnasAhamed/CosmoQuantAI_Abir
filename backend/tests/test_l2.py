import os, sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.db.session import SessionLocal
from app.services.ml_training_engine import fetch_l2_data

db = SessionLocal()
try:
    df = fetch_l2_data("BTC/USDT", db, 6, "5m")
    print(f"Dataframe length after fetch_l2_data: {len(df)}")
    if len(df) > 0:
        print(df.head())
except Exception as e:
    print(f"Error: {e}")
db.close()
