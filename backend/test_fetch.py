import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.services.ml_training_engine import fetch_data

if __name__ == "__main__":
    print("Testing fetch_data pagination for 5 days of 1h data...")
    try:
        df = fetch_data("BTC/USDT", "1h", start_date="2024-01-01", end_date="2024-01-05", exchange_name="binance")
        print(f"Success! Fetched {len(df)} rows.")
        print(f"First timestamp: {df.index.min()}")
        print(f"Last timestamp: {df.index.max()}")
    except Exception as e:
        print(f"Error: {e}")
