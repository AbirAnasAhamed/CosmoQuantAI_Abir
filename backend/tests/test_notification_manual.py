import asyncio
import logging
import sys
import os

# Ensure the app is in the path
sys.path.append(os.getcwd())

from app.db.session import SessionLocal
from app.services.session_monitor import SessionMonitorService

# Set up logging to stdout to see what's happening
logging.basicConfig(level=logging.INFO, stream=sys.stdout)

async def test():
    print("🧪 Starting manual notification test for user_id 1...")
    try:
        # We manually call the service's test method
        result = await SessionMonitorService.send_test_notification(1)
        print(f"✅ Test Result: {result}")
    except Exception as e:
        print(f"❌ Test Failed with Exception: {e}")

if __name__ == "__main__":
    asyncio.run(test())
