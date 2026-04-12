import urllib.request
import urllib.error
import urllib.parse
import json
import sys

BASE_URL = "http://localhost:8000"

def test_validation_error():
    print("\n[TEST] Testing Validation Error (422)...")
    url = f"{BASE_URL}/api/v1/login/access-token"
    # Sending empty data to trigger val error
    # x-www-form-urlencoded expected usually, but even empty post should trigger something for required fields
    data = urllib.parse.urlencode({}).encode()
    req = urllib.request.Request(url, data=data, method='POST')
    
    try:
        urllib.request.urlopen(req)
        print("❌ Expected 422 error, got 200 OK")
        return False
    except urllib.error.HTTPError as e:
        print(f"Status Code: {e.code}")
        response_body = e.read().decode()
        print(f"Response Body: {response_body}")
        
        try:
            data = json.loads(response_body)
            if e.code == 422 and data.get("error") is True and "Validation Error" in data.get("message"):
                print("✅ Validation Error Test PASSED")
                return True
            else:
                print("❌ Validation Error Test FAILED (Content check)")
                return False
        except json.JSONDecodeError:
            print("❌ Response is not JSON")
            return False
    except Exception as e:
        print(f"FAILED to connect: {e}")
        return False

def test_http_exception():
    print("\n[TEST] Testing HTTP Exception (404)...")
    url = f"{BASE_URL}/api/v1/non-existent-endpoint-12345"
    
    try:
        urllib.request.urlopen(url)
        print("❌ Expected 404 error, got 200 OK")
        return False
    except urllib.error.HTTPError as e:
        print(f"Status Code: {e.code}")
        response_body = e.read().decode()
        print(f"Response Body: {response_body}")
        
        try:
            data = json.loads(response_body)
            if e.code == 404 and data.get("error") is True:
                print("✅ HTTP Exception Test PASSED")
                return True
            else:
                print("❌ HTTP Exception Test FAILED (Content check)")
                return False
        except json.JSONDecodeError:
            print("❌ Response is not JSON")
            return False
    except Exception as e:
        print(f"FAILED to connect: {e}")
        return False

def main():
    print("🚀 Starting Error Handler Verification (urllib)...")
    
    v_pass = test_validation_error()
    h_pass = test_http_exception()
    
    if v_pass and h_pass:
        print("\n🎉 ALL TESTS PASSED! Global Exception Handlers are working correctly.")
        sys.exit(0)
    else:
        print("\n⚠️ SOME TESTS FAILED.")
        sys.exit(1)

if __name__ == "__main__":
    main()
