"""
Test Script: Auto-Retrain Telegram Notification Verifier
=========================================================
Checks:
  1. DB connectivity
  2. Models with is_auto_retrain=1
  3. Notification settings for model owners
  4. Sends a REAL test Telegram notification
"""

import asyncio
import sys
import os

# Add app to path
sys.path.insert(0, "/app")

from app.db.session import SessionLocal
from app.models.ml_model import CustomMLModel, ModelVersion
from app.models.notification import NotificationSettings
from app.services.notification import NotificationService

# ─────────────────────────────────────────────
# ANSI colors
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

def ok(msg):  print(f"  {GREEN}✅ {msg}{RESET}")
def fail(msg): print(f"  {RED}❌ {msg}{RESET}")
def warn(msg): print(f"  {YELLOW}⚠️  {msg}{RESET}")
def info(msg): print(f"  {CYAN}ℹ️  {msg}{RESET}")

# ─────────────────────────────────────────────

async def run_test():
    print(f"\n{BOLD}{'='*55}{RESET}")
    print(f"{BOLD}  Auto-Retrain Notification — Verification & Test{RESET}")
    print(f"{BOLD}{'='*55}{RESET}\n")

    db = SessionLocal()
    all_passed = True

    try:
        # ── STEP 1: DB Connection ──────────────────────────────
        print(f"{BOLD}[1] Database Connection{RESET}")
        try:
            from sqlalchemy import text
            db.execute(text("SELECT 1"))
            ok("PostgreSQL connection OK")
        except Exception as e:
            fail(f"DB connection failed: {e}")
            return

        # ── STEP 2: Find auto-retrain models ──────────────────
        print(f"\n{BOLD}[2] Auto-Retrain Models{RESET}")
        models = db.query(CustomMLModel).filter(CustomMLModel.is_auto_retrain == 1).all()

        if not models:
            warn("No models with is_auto_retrain=1 found in DB!")
            all_passed = False
        else:
            ok(f"Found {len(models)} model(s) with auto-retrain enabled:")
            for m in models:
                print(f"     → ID: {m.id}")
                print(f"       Name: {m.name}")
                print(f"       Algorithm: {m.model_type}")
                print(f"       Retrain every: {m.retrain_interval_hours}h")
                print(f"       Owner (user_id): {m.user_id}")

        # ── STEP 3: Check latest ModelVersion ─────────────────
        print(f"\n{BOLD}[3] Latest Model Version (for notification data){RESET}")
        for m in models:
            latest_v = db.query(ModelVersion).filter(
                ModelVersion.model_id == m.id
            ).order_by(ModelVersion.upload_date.desc()).first()

            if latest_v:
                version_str   = f"v{latest_v.version:.1f}"
                accuracy_str  = f"{latest_v.accuracy:.2%}" if latest_v.accuracy else "N/A"
                f1_str        = f"{latest_v.f1_score:.4f}" if latest_v.f1_score else "N/A"
                ok(f"Model '{m.name}' → Latest: {version_str} | Accuracy: {accuracy_str} | F1: {f1_str}")
            else:
                warn(f"Model '{m.name}' has no ModelVersion yet (first train not registered?)")

        # ── STEP 4: Check Notification Settings ───────────────
        print(f"\n{BOLD}[4] Notification Settings{RESET}")
        target_model = models[0] if models else None
        notif_settings = None

        if target_model:
            notif_settings = db.query(NotificationSettings).filter(
                NotificationSettings.user_id == target_model.user_id
            ).first()

            if not notif_settings:
                fail(f"No NotificationSettings for user_id={target_model.user_id}")
                all_passed = False
            elif not notif_settings.is_enabled:
                warn(f"Notifications are DISABLED for user_id={target_model.user_id}")
                all_passed = False
            elif not notif_settings.telegram_bot_token or not notif_settings.telegram_chat_id:
                fail("Telegram Bot Token or Chat ID is missing!")
                all_passed = False
            else:
                ok(f"Notifications ENABLED for user_id={target_model.user_id}")
                masked_token = notif_settings.telegram_bot_token[:10] + "..." + notif_settings.telegram_bot_token[-4:]
                info(f"Bot Token: {masked_token}")
                info(f"Chat ID:   {notif_settings.telegram_chat_id}")

        # ── STEP 5: Send Real Test Notification ───────────────
        print(f"\n{BOLD}[5] Sending Real Test Telegram Notification{RESET}")

        if not all_passed:
            warn("Skipping send — fix issues above first.")
        elif target_model and notif_settings and notif_settings.is_enabled:
            latest_v = db.query(ModelVersion).filter(
                ModelVersion.model_id == target_model.id
            ).order_by(ModelVersion.upload_date.desc()).first()

            version_str  = f"v{latest_v.version:.1f}" if latest_v else "v1.0"
            accuracy_str = f"{latest_v.accuracy:.2%}" if latest_v and latest_v.accuracy else "N/A"
            f1_str       = f"{latest_v.f1_score:.4f}" if latest_v and latest_v.f1_score else "N/A"

            test_msg = (
                f"🧪 *[TEST] Auto-Retrain Notification*\n"
                f"━━━━━━━━━━━━━━━━━━\n"
                f"📦 *Model:* {target_model.name}\n"
                f"🔖 *Version:* {version_str}\n"
                f"🧠 *Algorithm:* {target_model.model_type}\n"
                f"━━━━━━━━━━━━━━━━━━\n"
                f"📊 *Performance:*\n"
                f"  • Accuracy: {accuracy_str}\n"
                f"  • F1 Score: {f1_str}\n"
                f"━━━━━━━━━━━━━━━━━━\n"
                f"⏭️ *Next Retrain:* ~{target_model.retrain_interval_hours}h later\n"
                f"✅ This is a TEST message — notification system is working!"
            )

            try:
                await NotificationService.send_message(
                    db, target_model.user_id, test_msg, parse_mode="Markdown"
                )
                ok("Test Telegram notification sent successfully!")
                print(f"\n  {BOLD}Message preview:{RESET}")
                print("  ┌─────────────────────────────────────┐")
                for line in test_msg.replace("\\[", "[").replace("\\]", "]").replace("\\~", "~").split("\n"):
                    print(f"  │ {line}")
                print("  └─────────────────────────────────────┘")
            except Exception as e:
                fail(f"Failed to send notification: {e}")
                all_passed = False
        else:
            warn("No valid model/settings found to send test.")

        # ── SUMMARY ───────────────────────────────────────────
        print(f"\n{BOLD}{'='*55}{RESET}")
        if all_passed:
            print(f"{GREEN}{BOLD}  🎉 All checks PASSED! Notification system is ready.{RESET}")
        else:
            print(f"{RED}{BOLD}  ⚠️  Some checks FAILED. Review above output.{RESET}")
        print(f"{BOLD}{'='*55}{RESET}\n")

    except Exception as e:
        fail(f"Unexpected error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(run_test())
