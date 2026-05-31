import requests
import json
import time

BASE_URL = "http://localhost:8000/api/v1/sentiment"

def print_result(name, passed, details=None):
    icon = "✅" if passed else "❌"
    print(f"{icon} {name}")
    if details:
        print(f"   {details}")

def verify_sentiment_endpoints():
    print("🚀 Starting Sentiment API Verification...")
    
    # 1. Test Analysis Endpoint
    try:
        response = requests.get(f"{BASE_URL}/analysis")
        if response.status_code == 200:
            data = response.json()
            if "composite_score" in data and "sentiment_label" in data:
                print_result("Sentiment Analysis Endpoint", True, f"Score: {data['composite_score']}")
            else:
                print_result("Sentiment Analysis Endpoint", False, "Missing keys in response")
        else:
            print_result("Sentiment Analysis Endpoint", False, f"Status: {response.status_code}")
    except Exception as e:
        print_result("Sentiment Analysis Endpoint", False, f"Connection Failed: {e}")

    # 2. Test Correlation Endpoint
    try:
        response = requests.get(f"{BASE_URL}/correlation?symbol=BTC/USDT&days=7")
        if response.status_code == 200:
             print_result("Correlation Endpoint", True)
        else:
             print_result("Correlation Endpoint", False, f"Status: {response.status_code}")
    except Exception as e:
        print_result("Correlation Endpoint", False, f"Connection Failed: {e}")

    # 3. Test Poll Endpoint
    try:
        payload = {"symbol": "BTC", "vote": "bullish"}
        response = requests.post(f"{BASE_URL}/poll", json=payload)
        if response.status_code == 200:
            print_result("Poll Endpoint", True, "Vote cast successfully")
        elif response.status_code == 429:
            print_result("Poll Endpoint", True, "Rate Limit Active (Expected)")
        else:
             print_result("Poll Endpoint", False, f"Status: {response.status_code} - {response.text}")
    except Exception as e:
        print_result("Poll Endpoint", False, f"Connection Failed: {e}")

if __name__ == "__main__":
    verify_sentiment_endpoints()
