import os
import sys
import time
from datetime import datetime, timedelta

# Setup environment
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import SessionLocal, engine
from app.models import User
from app.models.ml_model import CustomMLModel
from app.models.prediction_log import PredictionLog
from app.tasks import evaluate_model_drift_task
import ccxt

def run_verification():
    print("🚀 Starting Phase 3 & 4 Verification Script...")
    db = SessionLocal()
    
    try:
        # 1. Setup Dummy User & Model
        user = db.query(User).first()
        if not user:
            user = User(email="test_drift@example.com", hashed_password="pw", is_active=True)
            db.add(user)
            db.commit()
            print("✅ Created dummy user.")
            
        model = db.query(CustomMLModel).filter(CustomMLModel.name == "DriftTestModel").first()
        if not model:
            model = CustomMLModel(
                id="model_drift_test_123",
                name="DriftTestModel",
                model_type="Random Forest",
                user_id=user.id
            )
            db.add(model)
            db.commit()
            print("✅ Created dummy model.")

        # 2. Fetch actual historical price to ensure our predictions fail
        print("Fetching historical price for BTC/USDT...")
        exchange = ccxt.binance()
        # Time for prediction: 3 hours ago. Resolution time: 2 hours ago.
        timestamp_3h_ago = datetime.utcnow() - timedelta(hours=3)
        target_resolution_time = timestamp_3h_ago + timedelta(hours=1)
        
        target_timestamp_ms = int(target_resolution_time.timestamp() * 1000)
        candles = exchange.fetch_ohlcv('BTC/USDT', '1m', since=target_timestamp_ms, limit=1)
        if not candles:
            print("❌ Failed to fetch historical candle from Binance. Aborting.")
            return
            
        actual_price = candles[0][4]
        print(f"✅ Found historical price 2 hours ago: {actual_price}")

        # 3. Create 10 Prediction Logs (3 hours ago)
        # To trigger drift, we want accuracy < 45%. 
        # So we need at least 6 WRONG predictions out of 10.
        db.query(PredictionLog).filter(PredictionLog.model_id == model.id).delete()
        
        print("Inserting 10 prediction logs...")
        for i in range(10):
            # For a BUY, if actual_price < predicted_price, it's WRONG.
            # So if we predict BUY at a price much higher than actual_price, it's wrong.
            predicted_price = actual_price + 1000  # Way too high
            
            # Make 2 correct, 8 wrong.
            if i < 2:
                # Correct: BUY and actual price > predicted
                predicted_price = actual_price - 1000
                
            log = PredictionLog(
                model_id=model.id,
                symbol="BTC/USDT:USDT",
                timeframe="15m",
                predicted_signal="BUY",
                confidence=85.0,
                predicted_price=predicted_price,
                timestamp=timestamp_3h_ago
            )
            db.add(log)
            
        # 4. Create 1 Prediction Log (15 days ago) to test Cleanup
        old_log = PredictionLog(
            model_id=model.id,
            symbol="BTC/USDT:USDT",
            timeframe="15m",
            predicted_signal="BUY",
            confidence=90.0,
            predicted_price=50000.0,
            timestamp=datetime.utcnow() - timedelta(days=15)
        )
        db.add(old_log)
        db.commit()
        
        print("✅ Inserted mock data successfully.")
        
        # 5. Run the Celery Task Directly
        print("\n⏳ Executing evaluate_model_drift_task()...")
        evaluate_model_drift_task()
        
        # 6. Verify Results
        print("\n📊 Verification Results:")
        
        # A. Check Cleanup
        # Check if the 15-day-old log is gone
        old_logs_check = db.query(PredictionLog).filter(PredictionLog.timestamp < (datetime.utcnow() - timedelta(days=14))).all()
        if not old_logs_check:
            print("✅ Data Retention Cleanup Working: 15-day old log deleted.")
        else:
            print("❌ Data Retention Cleanup Failed: Old log still exists.")
            
        # B. Check Drift Evaluation
        evaluated_logs = db.query(PredictionLog).filter(
            PredictionLog.model_id == model.id,
            PredictionLog.is_correct != None
        ).all()
        
        print(f"Found {len(evaluated_logs)} evaluated logs.")
        if len(evaluated_logs) == 10:
            print("✅ Drift Evaluation Working: All 10 logs were evaluated.")
            
            correct_count = sum(1 for l in evaluated_logs if l.is_correct)
            accuracy = correct_count / 10
            print(f"Accuracy calculated: {accuracy * 100}%")
            if accuracy == 0.2:
                print("✅ Accuracy matches expectations (20%).")
                print("✅ Telegram notification should have been triggered (check backend logs for NotificationService print).")
            else:
                print(f"❌ Expected 20% accuracy, got {accuracy * 100}%")
        else:
            print(f"❌ Expected 10 evaluated logs, found {len(evaluated_logs)}.")

    except Exception as e:
        print(f"❌ Verification script failed: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    run_verification()
