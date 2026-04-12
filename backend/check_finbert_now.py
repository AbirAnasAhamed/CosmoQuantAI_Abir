
import asyncio
import sys
import os

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.services.news_service import get_pipeline

print("--- CHECKING FINBERT ---")
try:
    model = get_pipeline()
    if model:
        print("✅ FinBERT Model is LOADED and Ready.")
        # Test inference
        print("Running test inference...")
        result = model(["Bitcoin is flying to the moon!"])
        print(f"Test Result: {result}")
    else:
        print("⚠️ FinBERT Model returned None (Disabled or Failed). Check ENABLE_FINBERT setting.")
except Exception as e:
    print(f"❌ Error during FinBERT check: {e}")
