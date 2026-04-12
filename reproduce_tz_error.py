
import pandas as pd
from datetime import datetime, timezone
import random

def reproduce():
    # Simulate df from market_service.py
    # pd.to_datetime(..., unit='ms') creates naive UTC
    ohlcv = [[1672531200000, 1, 2, 3, 4, 5]] # 2023-01-01
    df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
    df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms', utc=True)
    df.set_index('timestamp', inplace=True)
    print("DF Index TZ:", df.index.tz)

    # Simulate sentiment_df from news_service.py
    days = 1
    dates = pd.date_range(end=datetime.now(timezone.utc), periods=days*24, freq='h')
    data = [random.uniform(-0.5, 0.5) for _ in range(len(dates))]
    sentiment_df = pd.DataFrame(data, index=dates, columns=['score'])
    print("Sentiment DF Index TZ:", sentiment_df.index.tz)

    try:
        merged_df = df.join(sentiment_df, how='left')
        print("Join successful")
    except Exception as e:
        print(f"Join failed: {e}")

if __name__ == "__main__":
    reproduce()
