import os
import sys
import logging

# Configure logging to stdout
logging.basicConfig(level=logging.INFO, format='%(levelname)s - %(message)s')

# Add backend dir to path so we can import app modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import SessionLocal
from app.models.ml_model import CustomMLModel
from app.strategies.helpers.ml_l2_predictor import MLL2Predictor

def test_predictor():
    print("\n--- Starting ML L2 Predictor Test ---")
    db = SessionLocal()
    
    # Find a model whose file exists
    models = db.query(CustomMLModel).filter(CustomMLModel.active_version_id != None).all()
    
    valid_model = None
    for m in models:
        version = next((v for v in m.versions if v.id == m.active_version_id), None)
        if version and os.path.exists(version.file_path):
            valid_model = m
            break
            
    if not valid_model:
        # Fallback: maybe just manually try to find the .pkl file
        import glob
        pkl_files = glob.glob("uploads/models/*.pkl")
        if pkl_files:
            print(f"⚠️ No active models found with valid DB paths. Using fallback path: {pkl_files[0]}")
            # Patch the DB record if any model exists
            m = db.query(CustomMLModel).first()
            if m and m.active_version_id:
                version = next((v for v in m.versions if v.id == m.active_version_id), None)
                if version:
                    print(f"Patching DB model {m.id} to point to {pkl_files[0]}")
                    version.file_path = pkl_files[0]
                    db.commit()
                    valid_model = m
                    
    if not valid_model:
        print("❌ Could not find or patch any model.")
        db.close()
        return

    ai_model_id = valid_model.id
    print(f"✅ Found active model: {valid_model.name} (ID: {ai_model_id}) - Algorithm: {valid_model.model_type}")
    
    db.close()

    print("\n--- Initializing Predictor ---")
    predictor = MLL2Predictor(ai_model_id=ai_model_id)
    
    if not predictor.is_loaded:
        print("❌ Predictor failed to load the model. Check logs above.")
        return

    print("\n--- Testing Prediction with Mock Orderbook ---")
    
    # Create a mock orderbook (similar to CCXT format)
    # Mid price around 60,000
    mock_orderbook = {
        'bids': [
            [60000.0, 1.5],
            [59990.0, 2.0],
            [59980.0, 5.0]
        ],
        'asks': [
            [60010.0, 0.5],
            [60020.0, 1.0],
            [60030.0, 2.0]
        ]
    }
    
    current_mid_price = 60005.0
    
    # Test LONG direction
    target_side = "long"
    print(f"\nTesting target side: {target_side.upper()}")
    is_valid_long = predictor.predict(mock_orderbook, current_mid_price, target_side)
    print(f"Result for LONG: {is_valid_long}")

    # Test SHORT direction
    target_side = "short"
    print(f"\nTesting target side: {target_side.upper()}")
    is_valid_short = predictor.predict(mock_orderbook, current_mid_price, target_side)
    print(f"Result for SHORT: {is_valid_short}")
    
    print("\n--- Test Complete ---")

if __name__ == "__main__":
    test_predictor()
