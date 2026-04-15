from app.services.quant_engine import detect_lead_lag
import pandas as pd
import numpy as np

def verify():
    print("Verifying Lead-Lag Detection...")
    
    # Generate Base Series
    np.random.seed(42)
    periods = 100
    base = np.cumsum(np.random.randn(periods))
    series_a = pd.Series(base)
    
    # Case 1: B follows A by 2 steps (A leads B)
    # series_b[t] = series_a[t-2]
    # series_b is shifted forward in time (delayed)
    series_b = series_a.shift(2).fillna(0)
    
    result = detect_lead_lag(series_a, series_b, max_lag=10)
    print(f"Case 1 (A leads B by 2): Result={result}")
    
    # If A leads B by 2, lag should be -2.
    if result['lag'] == -2:
        print("PASS: Correctly identified lag -2")
    else:
        print(f"FAIL: Expected -2, got {result['lag']}")

    # Case 2: A follows B by 3 steps (B leads A)
    # series_a[t] = series_b[t-3] => series_b is earlier.
    # or series_b = series_a.shift(-3) (series_b is future of a)
    
    # Let's construct B leads A.
    # series_b happens first.
    series_b_lead = pd.Series(base)
    series_a_follow = series_b_lead.shift(3).fillna(0) # A is delayed by 3
    
    result2 = detect_lead_lag(series_a_follow, series_b_lead, max_lag=10)
    print(f"Case 2 (B leads A by 3): Result={result2}")
    
    # If B leads A by 3.
    # detect_lead_lag(A, B).
    # Shift B by lag to match A.
    # A is delayed. A[t] = B[t-3].
    # B.shift(lag). We want B[t-lag] ~ A[t] = B[t-3].
    # t-lag = t-3 => lag = 3.
    # So lag should be +3.
    if result2['lag'] == 3:
        print("PASS: Correctly identified lag +3")
    else:
         print(f"FAIL: Expected 3, got {result2['lag']}")

if __name__ == "__main__":
    verify()
