import sys
import os
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

# Add the backend directory to sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

try:
    from app.services.quant_engine import calculate_rolling_correlation
except ImportError:
    # Try adding the parent directory if running from backend root
    sys.path.append(os.getcwd())
    from app.services.quant_engine import calculate_rolling_correlation

def test_rolling_correlation():
    print("Generating dummy data...")
    dates = pd.date_range(start="2023-01-01", periods=100, freq='D')
    
    # Create two series that are correlated initially, then diverge
    np.random.seed(42)
    series_a = pd.Series(np.random.randn(100), index=dates).cumsum()
    # First 50 days: series_b follows series_a with some noise (correlated)
    series_b_part1 = series_a.iloc[:50] + np.random.normal(0, 0.5, 50)
    # Next 50 days: series_b goes opposite (negative correlation)
    series_b_part2 = series_a.iloc[50:] * -1 + np.random.normal(0, 0.5, 50)
    
    series_b = pd.concat([series_b_part1, series_b_part2])
    
    print("Calculating rolling correlation (window=30)...")
    result = calculate_rolling_correlation(series_a, series_b, window=30)
    
    print(f"Result length: {len(result)}")
    print("First 3 results:")
    for r in result[:3]:
        print(r)
        
    print("Last 3 results:")
    for r in result[-3:]:
        print(r)

    # Check validation
    assert len(result) > 0, "Result should not be empty"
    print("\nVerification Passed!")

if __name__ == "__main__":
    test_rolling_correlation()
