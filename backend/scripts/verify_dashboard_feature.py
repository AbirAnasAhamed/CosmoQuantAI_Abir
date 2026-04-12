import requests
import json
import sys

def verify_dashboard_feature():
    url = "http://localhost:8000/api/v1/sentiment/comprehensive-report"
    base_url = "http://localhost:8000/api/v1/sentiment"
    
    # Debug Check
    print(f"📡 Checking connectivity to {base_url}/news...")
    try:
        check = requests.get(f"{base_url}/news")
        print(f"   Status: {check.status_code}")
    except Exception as e:
        print(f"   Connectivity Check Failed: {e}")
    
    payload = {
        "headlines": [
            "Bitcoin breaks $100k barrier amid ETF inflow surge",
            "SEC approves new crypto regulations favoring institutional adoption",
            "Ethereum gas fees hit 5-year low",
            "Whale moves $500M BTC to Coinbase"
        ],
        "score": 75.5,
        "correlation": 0.85,
        "whale_stats": {
            "net_flow": 12000000,
            "recent_count": 5
        }
    }
    
    print(f"📡 Sending POST request to {url}...")
    try:
        response = requests.post(url, json=payload)
        
        if response.status_code != 200:
            print(f"❌ Failed: Status Code {response.status_code}")
            print(f"Response: {response.text}")
            sys.exit(1)
            
        data = response.json()
        print("✅ Response received (200 OK)")
        
        required_keys = ["score_analysis", "news_summary", "correlation_insight", "whale_insight", "executive_summary"]
        missing_keys = [key for key in required_keys if key not in data]
        
        if missing_keys:
            print(f"❌ Failed: Missing keys in response: {missing_keys}")
            sys.exit(1)
            
        print("🔍 checking keys...")
        for key in required_keys:
            if not isinstance(data[key], str):
                print(f"⚠️ Warning: {key} is not a string (Got {type(data[key])})")
            # print(f"   - {key}: {data[key][:50]}...")
            
        print("\n✅ Dashboard Feature Verification Passed")
        
    except requests.exceptions.ConnectionError:
        print("❌ Failed: Could not connect to backend (is it running?)")
        sys.exit(1)
    except Exception as e:
        print(f"❌ An error occurred: {e}")
        sys.exit(1)

if __name__ == "__main__":
    verify_dashboard_feature()
