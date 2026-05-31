import sys
import os

# Ensure backend directory is in python path
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)

try:
    from app.core.config import settings
except ImportError as e:
    print(f"Error importing settings: {e}")
    sys.exit(1)

def main():
    print("--- Environment Verification ---")
    
    # Check Secrets (Status Only)
    print(f"Binance API Key: {'LOADED' if settings.BINANCE_API_KEY else 'MISSING'}")
    print(f"Binance Secret Key: {'LOADED' if settings.BINANCE_SECRET_KEY else 'MISSING'}")
    print(f"News API Key: {'LOADED' if settings.NEWS_API_KEY else 'MISSING'}")
    
    # Check Infrastructure (Values allowed)
    print(f"Redis URL: {settings.REDIS_URL}")
    print(f"Database URL: {settings.DATABASE_URL}")
    
    print("--------------------------------")

if __name__ == "__main__":
    main()
