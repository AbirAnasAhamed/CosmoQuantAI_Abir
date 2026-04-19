import logging
import telegram
from telegram.request import HTTPXRequest
from sqlalchemy.orm import Session
from app.models.notification import NotificationSettings
from app.core.config import settings

import asyncio
logger = logging.getLogger(__name__)

# Telegram network timeouts (seconds) - Default fallbacks
DEFAULT_TELEGRAM_TIMEOUT = 30.0


def _make_bot(token: str) -> telegram.Bot:
    """
    Create a Telegram Bot with explicit timeouts to avoid indefinite hangs.
    Uses HTTPXRequest so we can set connection / read / write timeouts.
    """
    timeout = getattr(settings, "TELEGRAM_TIMEOUT", DEFAULT_TELEGRAM_TIMEOUT)
    
    request = HTTPXRequest(
        connect_timeout=timeout,
        read_timeout=timeout,
        write_timeout=timeout,
    )
    return telegram.Bot(token=token, request=request)


class NotificationService:
    @staticmethod
    async def send_message(db: Session, user_id: int, message: str, parse_mode: str = None):
        """
        Sends a Telegram message to the user if notifications are enabled.
        """
        try:
            settings = db.query(NotificationSettings).filter(
                NotificationSettings.user_id == user_id
            ).first()

            if not settings:
                logger.info(f"Notification settings not found for user {user_id}")
                return

            if not settings.is_enabled:
                logger.info(f"Notifications disabled for user {user_id}")
                return

            if not settings.telegram_bot_token or not settings.telegram_chat_id:
                logger.warning(f"Incomplete Telegram credentials for user {user_id}")
                return

            bot = _make_bot(settings.telegram_bot_token)
            
            # Implementation of the "Better than before" Retry Logic
            retries = 1
            while retries >= 0:
                try:
                    await bot.send_message(chat_id=settings.telegram_chat_id, text=message, parse_mode=parse_mode)
                    logger.info(f"Notification sent to user {user_id}")
                    break 
                except telegram.error.TimedOut:
                    if retries > 0:
                        logger.warning(f"Telegram timeout for user {user_id}. Retrying in 2s...")
                        await asyncio.sleep(2)
                        retries -= 1
                        continue
                    else:
                        raise # Re-raise for the outer except block to handle final failure
        
        except telegram.error.TimedOut:
            # Network is slow / Telegram API unreachable — log at WARNING, not ERROR,
            # to avoid triggering the log-monitor alert loop.
            logger.warning(
                f"[TelegramNotify] Timed out sending to user {user_id} — "
                "check network connectivity to api.telegram.org"
            )
        except telegram.error.NetworkError as e:
            logger.warning(f"[TelegramNotify] Network error for user {user_id}: {e}")
        except Exception as e:
            logger.error(f"[TelegramNotify] Unexpected error for user {user_id}: {e}")

    @staticmethod
    async def send_voice(db: Session, user_id: int, voice_path: str, caption: str = None, parse_mode: str = None):
        """
        Sends an audio/voice file to the user via Telegram.
        """
        try:
            settings = db.query(NotificationSettings).filter(
                NotificationSettings.user_id == user_id
            ).first()

            if not settings or not settings.is_enabled or not settings.telegram_bot_token or not settings.telegram_chat_id:
                return

            bot = _make_bot(settings.telegram_bot_token)
            
            with open(voice_path, 'rb') as voice_file:
                await bot.send_voice(
                    chat_id=settings.telegram_chat_id, 
                    voice=voice_file, 
                    caption=caption, 
                    parse_mode=parse_mode
                )
                logger.info(f"Voice note sent to user {user_id}")
        except Exception as e:
            logger.error(f"[TelegramNotify] Failed to send voice message to {user_id}: {e}")

    @staticmethod
    async def send_photo(db: Session, user_id: int, photo_url: str, caption: str = None, parse_mode: str = None):
        """
        Sends a photo (by URL) to the user via Telegram.
        """
        try:
            settings = db.query(NotificationSettings).filter(
                NotificationSettings.user_id == user_id
            ).first()

            if not settings or not settings.is_enabled or not settings.telegram_bot_token or not settings.telegram_chat_id:
                return

            bot = _make_bot(settings.telegram_bot_token)
            await bot.send_photo(
                chat_id=settings.telegram_chat_id,
                photo=photo_url,
                caption=caption,
                parse_mode=parse_mode
            )
            logger.info(f"Photo notification sent to user {user_id}")
        except Exception as e:
            logger.warning(f"[TelegramNotify] Could not send photo to {user_id}: {e} — falling back to text.")
            raise  # Let caller fall back to text

    @staticmethod
    async def force_send_message(bot_token: str, chat_id: str, message: str):
        """
        Sends a test message using provided credentials.
        """
        try:
            bot = _make_bot(bot_token)
            await bot.send_message(chat_id=chat_id, text=message)
            return True, "Message sent successfully"
        except telegram.error.TimedOut:
            return False, "Request timed out — check your network or Telegram API access."
        except Exception as e:
            return False, str(e)
