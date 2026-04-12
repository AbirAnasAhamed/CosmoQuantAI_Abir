import sys
import os

# Add backend to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

def test_imports_and_methods():
    print("Testing imports and methods for Wall Hunter Futures...")
    
    try:
        from app.strategies.wall_hunter_futures import WallHunterFuturesStrategy
        print("✅ WallHunterFuturesStrategy imported successfully.")
    except Exception as e:
        print(f"❌ Failed to import WallHunterFuturesStrategy: {e}")
        return False
        
    try:
        from app.services.ccxt_service import ccxt_service
        print("✅ ccxt_service imported successfully.")
        
        # Check if the new methods exist
        has_set_leverage = hasattr(ccxt_service, 'set_leverage')
        has_set_margin_mode = hasattr(ccxt_service, 'set_margin_mode')
        
        if has_set_leverage:
            print("✅ set_leverage method exists on ccxt_service.")
        else:
            print("❌ set_leverage method is missing on ccxt_service.")
            return False
            
        if has_set_margin_mode:
            print("✅ set_margin_mode method exists on ccxt_service.")
        else:
            print("❌ set_margin_mode method is missing on ccxt_service.")
            return False
            
    except Exception as e:
        print(f"❌ Failed to verify ccxt_service: {e}")
        return False
        
    try:
        from app.services.bot_manager import BotManager
        # Just verifying the file parses properly without syntax errors after our injection
        print("✅ BotManager file loaded successfully.")
    except Exception as e:
        print(f"❌ Failed to load BotManager (maybe syntax error?): {e}")
        return False

    print("\n🎉 All futures components have been verified syntactically!")
    return True

if __name__ == "__main__":
    success = test_imports_and_methods()
    sys.exit(0 if success else 1)
