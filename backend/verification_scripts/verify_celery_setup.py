from app.core.celery_app import celery_app
from app.tasks import test_celery_worker
import time
import sys

def verify_celery():
    print("🚀 triggering test_celery_worker task...")
    try:
        # Send task to Celery
        result = test_celery_worker.delay("World")
        print(f"✅ Task dispatched. ID: {result.id}")
        
        # Wait for result
        print("⏳ Waiting for result...")
        try:
            output = result.get(timeout=10)
            print(f"🎉 Task succeeded! Result: {output}")
            
            if output == "Hello World from Celery!":
                print("✅ VERIFICATION SUCCESSFUL")
                return True
            else:
                print("❌ Result mismatch.")
                return False
                
        except Exception as e:
            print(f"❌ Task timed out or failed: {e}")
            return False
            
    except Exception as e:
        print(f"❌ Failed to dispatch task: {e}")
        return False

if __name__ == "__main__":
    success = verify_celery()
    sys.exit(0 if success else 1)
