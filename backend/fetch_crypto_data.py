import requests
import json
from typing import Dict, Any, Optional

def fetch_crypto_data(symbol: str = "BTCUSDT") -> Optional[Dict[str, Any]]:
    """
    Fetches real-time cryptocurrency data from the Binance Public API.
    Does not rely on any internal configurations or databases.
    """
    url = "https://api.binance.com/api/v3/ticker/24hr"
    params = {"symbol": symbol}
    
    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        # Structure the data cleanly for frontend consumption
        result = {
            "symbol": data.get("symbol"),
            "lastPrice": float(data.get("lastPrice", 0)),
            "priceChangePercent": float(data.get("priceChangePercent", 0)),
            "highPrice": float(data.get("highPrice", 0)),
            "lowPrice": float(data.get("lowPrice", 0)),
            "volume": float(data.get("volume", 0)),
            "quoteVolume": float(data.get("quoteVolume", 0)),
            "timestamp": data.get("closeTime", 0)
        }
        return result
        
    except requests.exceptions.RequestException as e:
        print(f"Error fetching data for {symbol}: {e}")
        return None

if __name__ == "__main__":
    # Test execution when run as a script
    print("Fetching BTCUSDT market data...")
    market_data = fetch_crypto_data()
    if market_data:
        print("Data fetched successfully:")
        print(json.dumps(market_data, indent=2))
    else:
        print("Failed to fetch data.")
