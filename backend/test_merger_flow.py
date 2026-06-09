import os
import sys
import pandas as pd
from datetime import datetime

sys.path.append(os.getcwd())
from app.services.dataset_archiver import DatasetArchiver
from app.services.dataset_merger import DatasetMergerService

def test_merger_flow():
    print("=== Testing Auto-Archiver and Merger System ===")
    
    # 1. Create a dummy old CSV file representing the DVC Snapshot
    test_symbol = "TEST_BTC_USDT"
    clean_symbol = "TEST_BTC_USDT"
    csv_path = os.path.join(os.getcwd(), f"dummy_dvc_{clean_symbol}.csv")
    print(f"1. Creating mock DVC CSV at {csv_path}...")
    df_dvc = pd.DataFrame([
        {"timestamp": datetime(2023, 1, 1, 10, 0), "price": 10000, "volume": 1},
        {"timestamp": datetime(2023, 1, 1, 10, 1), "price": 10005, "volume": 2},
    ])
    df_dvc.to_csv(csv_path, index=False)
    
    # 2. Create some dummy records to archive as Parquet
    print("2. Testing DatasetArchiver...")
    class MockSnapshot:
        def __init__(self, ts, symbol="TEST_BTC_USDT"):
            self.id = 1
            self.timestamp = ts
            self.symbol = symbol
            self.exchange = "binance"
            self.bids = '[[1000, 1]]'
            self.asks = '[[1001, 1]]'
            self.obi = 0.5
            self.spread = 1.0
            self.microprice = 1000.5

    mock_records = [
        MockSnapshot(datetime(2023, 1, 2, 10, 0)),
        MockSnapshot(datetime(2023, 1, 2, 10, 1)),
    ]
    success = DatasetArchiver.archive_snapshots(mock_records, add_log_func=lambda msg: print(f"  [Archiver] {msg}"))
    assert success, "Archiver failed!"
    
    # 3. Test DatasetMergerService
    print("3. Testing DatasetMergerService...")
    from unittest.mock import MagicMock
    db_mock = MagicMock()
    # Mock the query to return empty live snapshots for simplicity, 
    # or you can return a mock snapshot.
    db_mock.query().filter().all.return_value = []
    
    try:
        result = DatasetMergerService.merge_datasets(test_symbol, None, db_mock)
        print("  Merge Result:", result)
        
        merged_file = result["merged_filename"]
        merged_path = os.path.join(os.getcwd(), "uploads", "datasets", merged_file)
        
        print("4. Verifying merged dataset...")
        assert os.path.exists(merged_path), "Merged file was not created!"
        
        df_merged = pd.read_csv(merged_path)
        print(f"  Merged dataset shape: {df_merged.shape}")
        
        # It should contain DVC records (2) + Archived records (2) = 4 records
        print(f"  Total records combined: {len(df_merged)}")
        assert len(df_merged) == 2, "Should have 2 merged records"
        
        # Clean up
        print("5. Cleaning up test files...")
        if os.path.exists(csv_path):
            os.remove(csv_path)
        if os.path.exists(merged_path):
            os.remove(merged_path)
        # Delete the mock parquet
        import glob
        for f in glob.glob(os.path.join(os.getcwd(), "uploads", "datasets", "historical_l2_archive", f"l2_archive_{clean_symbol}_*.parquet")):
            os.remove(f)
            
        print("=== ALL TESTS PASSED SUCCESSFULLY ===")
    finally:
        db.close()

if __name__ == "__main__":
    test_merger_flow()
