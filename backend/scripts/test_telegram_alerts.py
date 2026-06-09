import sys
import os
import asyncio

# Ensure backend dir is in sys.path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(SCRIPT_DIR)
if BACKEND_DIR not in sys.path:
    sys.path.append(BACKEND_DIR)

from app.db.session import SessionLocal
from app.services.notification import NotificationService

async def main():
    print("Testing Telegram Notification Broadcast System...")
    db = SessionLocal()
    try:
        # Test 1: broadcast_admin_alert (async)
        print("Sending async broadcast alert...")
        await NotificationService.broadcast_admin_alert(
            db, 
            "🚀 *Test Alert*\nThis is a test of the async broadcast notification system.", 
            parse_mode="Markdown"
        )
        print("Async alert executed (check logs for delivery status).")
        
        # Test 2: broadcast_admin_alert_sync (sync wrapper)
        print("Sending sync broadcast alert...")
        NotificationService.broadcast_admin_alert_sync(
            db, 
            "🚀 *Test Alert*\nThis is a test of the synchronous broadcast wrapper.", 
            parse_mode="Markdown"
        )
        print("Sync alert executed (check logs for delivery status).")
        
        print("Testing completed!")
        
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(main())
