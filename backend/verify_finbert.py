
import asyncio
import sys
import os

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.services.news_service import news_service

async def verify_enterprise_upgrade():
    print("🚀 Verifying Enterprise Upgrade...")
    
    # 1. Test FinBERT Loading
    print("\n[1] Check FinBERT Model Status")
    if news_service.finbert:
        print("✅ FinBERT pipeline loaded successfully.")
    else:
        print("⚠️ FinBERT pipeline NOT loaded (Check logs for memory/network issues).")

    # 2. Test Sentiment Analysis (FinBERT vs VADER)
    print("\n[2] Testing Sentiment Analysis")
    test_phrases = [
        "Bitcoin hits all-time high as institutional demand surges.",
        "Crypto market crashes due to regulatory crackdown.",
        "Market is trading sideways with low volume."
    ]
    
    for text in test_phrases:
        score = news_service.analyze_sentiment(text)
        print(f"   Text: '{text}' -> Score: {score}")

    # 3. Test Translation (if internet available)
    print("\n[3] Testing Translation & Global Sentiment")
    try:
        # Mocking the fetch to specific regions to test translation logic internally if possible,
        # but here we'll just test the method itself if it runs without error.
        # Note: This requires internet access for GNews and GoogleTranslator
        print("   Fetching Global Sentiment (US, CN, KR)...")
        global_news = await news_service.fetch_global_sentiment()
        
        print(f"   Fetched {len(global_news)} global news items.")
        if global_news:
            sample = global_news[0]
            print(f"   Sample: [{sample['region']}] {sample['content']} (Score: {sample['sentiment']})")
            if sample.get('translated_content'):
                print(f"   Translated: {sample['translated_content']}")
        else:
            print("   ⚠️ No news fetched (possibly rate limited or network issue).")
            
    except Exception as e:
        print(f"   ❌ Translation/Fetch Error: {e}")

if __name__ == "__main__":
    asyncio.run(verify_enterprise_upgrade())
