import sys
import os
from datetime import datetime, timedelta
import random

# Add project root to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.db.session import SessionLocal
from app.models.education import EducationResource
from app.models import MarketData
from app.models.analysis import AnalysisSignal
from app.services.analysis.social_volume import SocialVolumeAnalyzer

def run_test():
    print("🧪 Starting Social Volume Verification...")
    db = SessionLocal()
    analyzer = SocialVolumeAnalyzer(db)
    
    test_symbol = "TEST_COIN"
    
    try:
        # 1. Cleanup old test data
        db.query(EducationResource).filter(EducationResource.category == test_symbol).delete()
        db.query(MarketData).filter(MarketData.symbol == f"{test_symbol}/USDT").delete()
        db.query(AnalysisSignal).filter(AnalysisSignal.symbol == test_symbol).delete()
        db.commit()
        
        # 2. Mock Data Generation
        print("📝 Generating Mock Data...")
        
        now = datetime.utcnow()
        
        # A. Create Volume Spike
        # Current 24h: 50 items
        # Prev 24h: 10 items 
        # -> Increase = (50-10)/10 * 100 = 400% > 20% ✅
        
        news_items = []
        # Recent (0-24h ago)
        for i in range(50):
            ts = now - timedelta(hours=random.randint(0, 23))
            news_items.append(EducationResource(
                title=f"News {i}", link=f"http://test.com/{i}", 
                category=test_symbol, published_at=ts, source="Test"
            ))
            
        # Old (24-48h ago)
        for i in range(10):
            ts = now - timedelta(hours=random.randint(24, 47))
            news_items.append(EducationResource(
                title=f"Old News {i}", link=f"http://test.com/old/{i}", 
                category=test_symbol, published_at=ts, source="Test"
            ))
            
        db.add_all(news_items)
        
        # B. Create Flat Price
        # Hourly candles for 48h
        prices = []
        base_price = 100.0
        for i in range(48):
            ts = now - timedelta(hours=i)
            # Price stays between 99 and 101 roughly -> 0% change over 24h
            # Specifically: Current Price (i=0) = 100
            # Price 24h ago (i=24) = 100
            
            p = base_price + random.uniform(-0.1, 0.1) # Super flat
            
            prices.append(MarketData(
                exchange="binance", symbol=f"{test_symbol}/USDT", timeframe='1h',
                timestamp=ts, open=p, high=p+0.5, low=p-0.5, close=p, volume=1000
            ))
            
        db.add_all(prices)
        db.commit()
        print("✅ Mock Data Inserted.")
        
        # 3. Run Analysis
        print("🏃 Running Detection...")
        signal = analyzer.detect_divergence(test_symbol)
        
        if signal:
            print(f"✅ SUCCESS: Signal Detected!")
            print(f"   - Pattern: {signal.pattern_name}")
            print(f"   - Volume Change: {signal.volume_change_pct:.2f}%")
            print(f"   - Price Change: {signal.price_change_pct:.2f}%")
            
            # Verify Signal stored in DB
            stored = db.query(AnalysisSignal).filter(AnalysisSignal.symbol == test_symbol).first()
            if stored:
                print("✅ Database Verification Passed: Signal found in DB.")
            else:
                print("❌ Database Verification Failed: Signal NOT in DB.")
        else:
            print("❌ FAILURE: No Signal Detected (Expected Bullish Divergence).")
            
    except Exception as e:
        print(f"❌ Error during test: {e}")
        import traceback
        traceback.print_exc()
    finally:
        # Cleanup
        print("🧹 Cleaning up...")
        db.query(EducationResource).filter(EducationResource.category == test_symbol).delete()
        db.query(MarketData).filter(MarketData.symbol == f"{test_symbol}/USDT").delete()
        db.query(AnalysisSignal).filter(AnalysisSignal.symbol == test_symbol).delete()
        db.commit()
        db.close()
        analyzer.close()

if __name__ == "__main__":
    run_test()
