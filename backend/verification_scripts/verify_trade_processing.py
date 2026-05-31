import os
import sys
import pandas as pd
from datetime import datetime, timedelta

# Add backend directory to sys.path to import app modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.services.trade_data_processor import process_historical_trades

def create_dummy_trades():
    # Create a small dummy CSV file
    os.makedirs("app/data_feeds", exist_ok=True)
    file_path = "app/data_feeds/test_dummy_trades.csv"
    
    # Let's generate 50 trades
    base_time = datetime(2023, 1, 1, 12, 0, 0)
    data = []
    price = 50000.0
    for i in range(100):
        # 1 trade per second
        ts = base_time + timedelta(seconds=i)
        # Alternate side
        side = 'buy' if i % 3 != 0 else 'sell'
        if side == 'buy':
            price += 10.0
        else:
            price -= 5.0
            
        amount = 0.5 + (i % 5) * 0.1 # Varies between 0.5 and 0.9
        
        data.append({
            'id': i,
            'timestamp': int(ts.timestamp() * 1000),
            'datetime': ts.strftime('%Y-%m-%d %H:%M:%S'),
            'symbol': 'BTC/USDT',
            'side': side,
            'price': price,
            'amount': amount,
            'cost': price * amount
        })
        
    df = pd.DataFrame(data)
    df.to_csv(file_path, index=False)
    return file_path

def run_tests():
    file_path = create_dummy_trades()
    print("✅ Created dummy trades file.")
    
    print("\n--- Testing Time Bars (1m) ---")
    try:
        df_time = process_historical_trades(file_path, bar_type="time", bar_size="1m", apply_indicators=[])
        print(f"Generated {len(df_time)} Time Bars.")
        print(df_time[['Open', 'High', 'Low', 'Close', 'Volume', 'cvd']].head())
        print("✅ Time Bars Test Passed.")
    except Exception as e:
        print(f"❌ Time Bars Test Failed: {e}")
        
    print("\n--- Testing Volume Bars (10.0 Units) ---")
    try:
        df_vol = process_historical_trades(file_path, bar_type="volume", volume_threshold=10.0, apply_indicators=[])
        print(f"Generated {len(df_vol)} Volume Bars.")
        print(df_vol[['Open', 'High', 'Low', 'Close', 'Volume', 'cvd']].head())
        print("✅ Volume Bars Test Passed.")
    except Exception as e:
        print(f"❌ Volume Bars Test Failed: {e}")
        
    # Cleanup
    if os.path.exists(file_path):
        os.remove(file_path)
    print("\n🎉 Verification Complete!")

if __name__ == "__main__":
    run_tests()
