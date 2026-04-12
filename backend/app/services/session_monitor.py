"""
Session Monitor Service
========================
A fully modular, always-running background service that:
1. Detects market session starts (Sydney, Tokyo, London, New York)
2. Detects London/New York overlap (highest volatility window)
3. Includes live market price data in alerts
4. Sends weekly summary every Monday
5. Uses Redis to ensure ONE alert per event per user per day

All session times are based on international standards (UTC).
"""

import logging
from datetime import datetime, timedelta
import asyncio
from app.db.session import SessionLocal
from app.models.notification import NotificationSettings
from app.services.notification import NotificationService
from app.utils import get_redis_client

logger = logging.getLogger(__name__)

# ============================================================
# INTERNATIONAL STANDARD SESSION TIMES (UTC)
# ============================================================
SESSIONS = {
    "Sydney": {
        "start": (22, 0),   # 22:00 UTC → 04:00 BDT
        "end":   (7, 0),    # 07:00 UTC → 13:00 BDT
        "icon":  "🇦🇺",
        "field": "notify_sydney",
        "volatility": "Low",
        "pairs": "AUD/USD, NZD/USD, USD/JPY"
    },
    "Tokyo": {
        "start": (0, 0),    # 00:00 UTC → 06:00 BDT
        "end":   (9, 0),    # 09:00 UTC → 15:00 BDT
        "icon":  "🇯🇵",
        "field": "notify_tokyo",
        "volatility": "Medium",
        "pairs": "USD/JPY, EUR/JPY, GBP/JPY"
    },
    "London": {
        "start": (8, 0),    # 08:00 UTC → 14:00 BDT
        "end":   (17, 0),   # 17:00 UTC → 23:00 BDT
        "icon":  "🇬🇧",
        "field": "notify_london",
        "volatility": "High",
        "pairs": "EUR/USD, GBP/USD, USD/CHF"
    },
    "New York": {
        "start": (13, 0),   # 13:00 UTC → 19:00 BDT
        "end":   (22, 0),   # 22:00 UTC → 04:00 BDT
        "icon":  "🇺🇸",
        "field": "notify_new_york",
        "volatility": "Very High",
        "pairs": "EUR/USD, USD/CAD, USD/JPY"
    },
    "TEST_ALIVE": {
        "start": (12, 12),  # Triggering in a few minutes for verification
        "end":   (12, 30),
        "icon":  "🧪",
        "field": "notify_sydney", # Reuse an existing enabled field
        "volatility": "Low",
        "pairs": "TEST/DEBUG"
    },
}

# ============================================================
# OVERLAP WINDOW (Highest Volatility: London + New York)
# ============================================================
OVERLAP = {
    "name": "London & New York Overlap",
    "start": (13, 0),  # 13:00 UTC → 19:00 BDT
    "end":   (17, 0),  # 17:00 UTC → 23:00 BDT
    "icon":  "🔥",
}


class SessionMonitorService:

    @staticmethod
    async def _get_price_snapshot() -> str:
        """
        Attempts to fetch a quick BTC price snapshot from CoinGecko.
        Returns a formatted string or empty string on failure.
        """
        try:
            import aiohttp
            url = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true"
            async with aiohttp.ClientSession() as session:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        btc = data.get("bitcoin", {})
                        price = btc.get("usd", 0)
                        change = btc.get("usd_24h_change", 0)
                        arrow = "📈" if change >= 0 else "📉"
                        return f"\n💰 *BTC:* ${price:,.0f} {arrow} {change:+.2f}%"
            return ""
        except Exception:
            return ""

    @staticmethod
    async def check_and_notify_sessions():
        """
        Main method called every minute by Celery Beat.
        Checks for session starts, overlaps, and sends alerts.
        """
        db = SessionLocal()
        redis = get_redis_client()
        now_utc = datetime.utcnow()
        current_date = now_utc.strftime("%Y-%m-%d")

        try:
            all_settings = db.query(NotificationSettings).filter(
                NotificationSettings.is_enabled == True
            ).all()

            if not all_settings:
                return

            # Fetch price data once for all users (efficiency)
            price_str = await SessionMonitorService._get_price_snapshot()

            for settings in all_settings:
                if not settings.telegram_bot_token or not settings.telegram_chat_id:
                    continue

                # --- 1. Session Start Alerts ---
                if settings.alert_session_start:
                    for session_name, info in SESSIONS.items():
                        # Check if user wants this session
                        if not getattr(settings, info["field"], True):
                            continue

                        start_h, start_m = info["start"]

                        # Match within a 5-minute window for better reliability
                        if now_utc.hour == start_h and start_m <= now_utc.minute < start_m + 5:
                            redis_key = f"alert:session:{session_name}:user:{settings.user_id}:{current_date}"

                            if not redis.exists(redis_key):
                                vol = info["volatility"]
                                vol_emoji = {"Low": "🟢", "Medium": "🟡", "High": "🟠", "Very High": "🔴"}.get(vol, "⚪")
                                
                                price_line = price_str if settings.alert_price_data else ""

                                message = (
                                    f"{info['icon']} *{session_name} Session Started!*\n"
                                    f"━━━━━━━━━━━━━━━━━━\n"
                                    f"⏰ *Time:* {now_utc.strftime('%H:%M')} UTC\n"
                                    f"{vol_emoji} *Volatility:* {vol}\n"
                                    f"📊 *Key Pairs:* {info['pairs']}"
                                    f"{price_line}\n"
                                    f"━━━━━━━━━━━━━━━━━━\n"
                                    f"_Good luck with your trades!_ 🚀"
                                )

                                await NotificationService.send_message(db, settings.user_id, message)
                                redis.setex(redis_key, 86400, "1")
                                logger.info(f"Sent {session_name} alert to user {settings.user_id}")

                # --- 2. London + New York Overlap Alert ---
                if settings.alert_overlap:
                    ov_h, ov_m = OVERLAP["start"]
                    if now_utc.hour == ov_h and ov_m <= now_utc.minute < ov_m + 2:
                        redis_key = f"alert:overlap:user:{settings.user_id}:{current_date}"

                        if not redis.exists(redis_key):
                            price_line = price_str if settings.alert_price_data else ""

                            message = (
                                f"🔥 *High Volatility Window Started!*\n"
                                f"━━━━━━━━━━━━━━━━━━\n"
                                f"🇬🇧 London + 🇺🇸 New York *Overlap*\n"
                                f"⏰ *Window:* 13:00 – 17:00 UTC\n"
                                f"⚡ This is the most volatile trading window of the day!"
                                f"{price_line}\n"
                                f"━━━━━━━━━━━━━━━━━━\n"
                                f"_Maximum liquidity. Trade carefully!_"
                            )

                            await NotificationService.send_message(db, settings.user_id, message)
                            redis.setex(redis_key, 86400, "1")
                            logger.info(f"Sent Overlap alert to user {settings.user_id}")

                # --- 3. Weekly Summary (Monday 00:05 UTC) ---
                if settings.alert_weekly_summary:
                    if now_utc.weekday() == 0 and now_utc.hour == 0 and 5 <= now_utc.minute < 7:
                        redis_key = f"alert:weekly:user:{settings.user_id}:{current_date}"

                        if not redis.exists(redis_key):
                            week_num = now_utc.isocalendar()[1]
                            price_line = price_str if settings.alert_price_data else ""

                            message = (
                                f"📊 *Weekly Market Session Summary*\n"
                                f"━━━━━━━━━━━━━━━━━━\n"
                                f"Week #{week_num} starts today! Here are your session windows (BDT):\n\n"
                                f"🇦🇺 *Sydney:*   04:00 – 13:00\n"
                                f"🇯🇵 *Tokyo:*    06:00 – 15:00\n"
                                f"🇬🇧 *London:*   14:00 – 23:00\n"
                                f"🇺🇸 *New York:* 19:00 – 04:00\n"
                                f"🔥 *Overlap:*   19:00 – 23:00"
                                f"{price_line}\n"
                                f"━━━━━━━━━━━━━━━━━━\n"
                                f"_Powered by CosmoQuantAI_ ✨"
                            )

                            await NotificationService.send_message(db, settings.user_id, message)
                            redis.setex(redis_key, 86400, "1")
                            logger.info(f"Sent Weekly Summary to user {settings.user_id}")

        except Exception as e:
            logger.error(f"SessionMonitorService error: {e}", exc_info=True)
        finally:
            db.close()

    @staticmethod
    async def send_test_notification(user_id: int):
        """
        Force send a test notification to verify the Telegram setup is working.
        """
        db = SessionLocal()
        try:
            price_str = await SessionMonitorService._get_price_snapshot()

            message = (
                f"🧪 *Session Alert System — Active!*\n"
                f"━━━━━━━━━━━━━━━━━━\n"
                f"✅ Your Telegram alerts are configured correctly.\n\n"
                f"You'll receive alerts for:\n"
                f"🇦🇺 Sydney • 🇯🇵 Tokyo • 🇬🇧 London • 🇺🇸 New York\n"
                f"🔥 London/NY Overlap • 📊 Weekly Summary"
                f"{price_str}\n"
                f"━━━━━━━━━━━━━━━━━━\n"
                f"_CosmoQuantAI Session Monitor_ 🚀"
            )
            await NotificationService.send_message(db, user_id, message)
            return True
        except Exception as e:
            logger.error(f"Test notification failed: {e}")
            return False
        finally:
            db.close()
