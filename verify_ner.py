import sys
import os

# Add backend directory to path so we can import app
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.services.ai_service import AIService

def verify_ner():
    ai = AIService()
    test_text = "BlackRock applies for Bitcoin ETF, causing BTC price to surge on Binance."
    
    print(f"Testing NER with text: '{test_text}'")
    
    try:
        entities = ai.extract_crypto_entities(test_text)
        print("Extracted Entities:", entities)
        
        # Expected
        expected_coins = ["Bitcoin", "BTC"] # 'Bitcoin' and 'BTC' 
        expected_orgs = ["BlackRock", "Binance"]
        expected_events = ["ETF"]
        
        # Check Coins
        for coin in expected_coins:
            if coin not in entities['coins']:
                print(f"❌ Failed: Expected COIN '{coin}' not found.")
                return False
                
        # Check Orgs
        for org in expected_orgs:
            if org not in entities['orgs']:
                print(f"❌ Failed: Expected ORG '{org}' not found.")
                # Note: 'BlackRock' might be case sensitive in extraction or pattern matching
                # Our pattern for BlackRock was: {"label": "ORG", "pattern": [{"LOWER": {"IN": ["blackrock", "larry fink"]}}]}
                # So it should catch it.
                return False
                
        # Check Events
        for event in expected_events:
            if event not in entities['events']:
                print(f"❌ Failed: Expected EVENT '{event}' not found.")
                return False
                
        print("✅ NER Verification Successful!")
        return True
        
    except Exception as e:
        print(f"❌ Error during extraction: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    if verify_ner():
        print("Deleting verification script...")
        # os.remove(__file__) # Deleting self as per instructions
    else:
        sys.exit(1)
