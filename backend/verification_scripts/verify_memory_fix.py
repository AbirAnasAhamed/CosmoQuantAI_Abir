import asyncio
import time
import os

from app.services.news_service import news_service
from app.core.config import settings

# Force enable FinBERT for testing
settings.ENABLE_FINBERT = True

async def verify_fix():
    print("🚀 Starting Verification Protocol...")
    
    test_text = "Bitcoin is skyrocketing to the moon! This is amazing news for crypto."
    
    # 1. Warm-up (First Load)
    print("\n1️⃣  First Call (Should load model)...")
    start_time = time.perf_counter()
    score1 = await news_service.analyze_sentiment(test_text)
    end_time = time.perf_counter()
    duration1 = end_time - start_time
    print(f"   ⏱️  Time: {duration1:.4f}s | Score: {score1}")
    
    # 2. Second Call (Cached)
    print("\n2️⃣  Second Call (Should be instant)...")
    start_time = time.perf_counter()
    score2 = await news_service.analyze_sentiment(test_text)
    end_time = time.perf_counter()
    duration2 = end_time - start_time
    print(f"   ⏱️  Time: {duration2:.4f}s | Score: {score2}")
    
    # 3. Third Call (Cached)
    print("\n3️⃣  Third Call (Confirmation)...")
    start_time = time.perf_counter()
    score3 = await news_service.analyze_sentiment(test_text)
    end_time = time.perf_counter()
    duration3 = end_time - start_time
    print(f"   ⏱️  Time: {duration3:.4f}s | Score: {score3}")
    
    # Validation Logic
    print("\n📊 Verification Results:")
    # Slightly relaxed threshold for docker overhead
    if duration2 < 0.5 and duration3 < 0.5:
        print("✅ SUCCESS: Subsequent calls completed in < 500ms.")
        # If model loading is very fast (or already loaded by pre-start), this might fail, but let's check.
        if duration1 > 0.5: 
             print("✅ SUCCESS: First call took longer (Model Loading Verified).")
        else:
             print("ℹ️  NOTE: First call was fast. Model might have been already loaded.")
             
        if score1 == score2 == score3:
            print("✅ SUCCESS: Scores match across calls.")
        else:
             print("❌ FAIL: Scores do not match!")
    else:
        print(f"❌ FAIL: Subsequent calls took too long ({duration2:.4f}s, {duration3:.4f}s). Singleton might be broken.")

if __name__ == "__main__":
    asyncio.run(verify_fix())
