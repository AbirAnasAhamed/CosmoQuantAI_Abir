import sys
import os
sys.path.append("/app")

import pandas as pd
import numpy as np
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Setup logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def run_debug():
    from app.services.hybrid_pipeline import build_hybrid_dataset
    
    # Mock Job
    class MockJob:
        symbol = "BTC/USDT"
        timeframe = "1m"
    job = MockJob()
    
    # Config
    config = {
        "is_deep_training": True,
        "target_rows": 1000,
        "ohlcv_start_date": "2024-01-01",
        "ohlcv_end_date": "2024-01-05",
        "exchange": "binance",
        "prediction_target": "classification",
        "plp_features": ["abs_long_liq_pool"],
        "l2_features": ["obi", "spread", "microprice"],
        "resample_l2": False,
        # Put the indicators that were requested
        "indicators": [
            "SMA Multi", "ADX Multi", "Parabolic SAR Multi", "Supertrend Multi",
            "BBANDS Multi", "ATR Multi", "Keltner Channel Multi", "Donchian Channel Multi",
            "VWAP_SD", "SMC FVG"
        ]
    }
    
    def dummy_log(msg):
        print(f"LOG: {msg}")
        
    try:
        from app.services.ml_training_engine import fetch_data
        print("Fetching OHLCV data...")
        df_ohlcv = fetch_data(job.symbol, job.timeframe, start_date=config.get("ohlcv_start_date"), end_date=config.get("ohlcv_end_date"), exchange_name=config.get("exchange"))
        print(f"OHLCV shape after fetch: {df_ohlcv.shape}")
        
        from app.services.hybrid_pipeline import apply_technical_indicators
        successful = apply_technical_indicators(df_ohlcv, config["indicators"], dummy_log)
        print(f"Successful indicators: {successful}")
        print(f"OHLCV shape after indicators: {df_ohlcv.shape}")
        
        df_ohlcv.dropna(inplace=True)
        print(f"OHLCV shape after dropna: {df_ohlcv.shape}")
        
        # If OHLCV is empty, this is the culprit!
        if len(df_ohlcv) == 0:
            print("CULPRIT FOUND: OHLCV dropna resulted in 0 rows!")
            # Let's find which column caused it
            df_ohlcv = fetch_data(job.symbol, job.timeframe, start_date=config.get("ohlcv_start_date"), end_date=config.get("ohlcv_end_date"), exchange_name=config.get("exchange"))
            apply_technical_indicators(df_ohlcv, config["indicators"], dummy_log)
            null_counts = df_ohlcv.isnull().sum()
            print("Null counts per column:")
            for col, count in null_counts.items():
                if count > 0:
                    print(f"  {col}: {count} nulls")
                    
        else:
            print("OHLCV is not empty. Moving to mock L2.")
            # Mock L2
            target_rows = 1000
            df_l2 = pd.DataFrame({
                'Close': np.random.randn(target_rows).cumsum() + 100,
                'obi': np.random.rand(target_rows),
                'spread': np.random.rand(target_rows),
                'microprice': np.random.randn(target_rows).cumsum() + 100
            }, index=pd.date_range(end=pd.Timestamp.utcnow(), periods=target_rows, freq='1s'))
            df_l2.index.name = 'timestamp'
            
            # Merge
            df_ohlcv.index = pd.to_datetime(df_ohlcv.index).tz_localize(None).astype('datetime64[ns]')
            df_l2.index = pd.to_datetime(df_l2.index).tz_localize(None).astype('datetime64[ns]')
            
            df = pd.merge_asof(
                df_l2.reset_index(), 
                df_ohlcv.reset_index(), 
                on='timestamp', 
                direction='backward'
            )
            df.set_index('timestamp', inplace=True)
            print(f"Merged df shape: {df.shape}")
            null_counts_merge = df.isnull().sum()
            print("Null counts per column after merge:")
            for col, count in null_counts_merge.items():
                if count > 0:
                    print(f"  {col}: {count} nulls")
                    
            if null_counts_merge.sum() > 0:
                print("CULPRIT FOUND: merge_asof introduced NaNs!")
                print(f"Earliest OHLCV timestamp: {df_ohlcv.index.min()}")
                print(f"Latest OHLCV timestamp: {df_ohlcv.index.max()}")
                print(f"Earliest L2 timestamp: {df_l2.index.min()}")
                print(f"Latest L2 timestamp: {df_l2.index.max()}")
                
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    run_debug()
