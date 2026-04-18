import logging
from datetime import datetime
import asyncio
from typing import Callable, Optional

logger = logging.getLogger(__name__)

# Constants matched from session_monitor.py for modularity
# Times are in UTC
SESSIONS = {
    "Sydney": {"start": (22, 0), "end": (7, 0)},
    "Tokyo": {"start": (0, 0), "end": (9, 0)},
    "London": {"start": (8, 0), "end": (17, 0)},
    "New York": {"start": (13, 0), "end": (22, 0)},
    "Overlap": {"start": (13, 0), "end": (17, 0)}, # London & NY Overlap
}

class TradingSessionTracker:
    """
    Modular tracker to handle Trading Session logic for WallHunter.
    It checks if the current time is within the configured session
    and can automatically trigger a shutdown sequence if the session ends.
    """
    
    def __init__(
        self,
        bot_instance,
        session_names: list[str],
        on_session_end: Callable
    ):
        self.bot = bot_instance
        self.session_names = session_names if isinstance(session_names, list) else [session_names]
        self.on_session_end = on_session_end
        self.is_active = True
        self._monitor_task = None
        self._waiting_logged = False  # Tracks if we already sent the "waiting" notification
    
    @staticmethod
    def _is_time_in_window(current_h: int, current_m: int, start_h: int, start_m: int, end_h: int, end_m: int) -> bool:
        start_time = start_h * 60 + start_m
        end_time = end_h * 60 + end_m
        curr_time = current_h * 60 + current_m
        
        if start_time < end_time:
            return start_time <= curr_time < end_time
        elif start_time > end_time:
            # Crosses midnight (e.g., Sydney 22:00 to 07:00)
            return curr_time >= start_time or curr_time < end_time
        else:
            return True # If start == end, assume 24h

    @staticmethod
    def is_session_active(session_names: list[str]) -> bool:
        """Helper to quickly check if any of the given sessions are active right now."""
        if not session_names or "None" in session_names or len(session_names) == 0:
            return True # If no valid session is strictly selected or None is allowed, return True (24/7)
            
        now = datetime.utcnow()
        now_h, now_m = now.hour, now.minute

        for s_name in session_names:
            if s_name in SESSIONS:
                active_session = SESSIONS[s_name]
                if TradingSessionTracker._is_time_in_window(
                    now_h, now_m,
                    active_session["start"][0], active_session["start"][1],
                    active_session["end"][0], active_session["end"][1]
                ):
                    return True
            else:
                # Custom format handling e.g., "14:30-16:00"
                try:
                    if "-" in s_name and ":" in s_name:
                        time_part = s_name.split("|")[-1] if "|" in s_name else s_name
                        start_str, end_str = time_part.split("-")
                        sh, sm = map(int, start_str.strip().split(":"))
                        eh, em = map(int, end_str.strip().split(":"))
                        if TradingSessionTracker._is_time_in_window(now_h, now_m, sh, sm, eh, em):
                            return True
                except Exception as e:
                    logger.debug(f"Could not parse custom session time: {s_name} - {e}")

        return False

    @staticmethod
    def get_session_window_str(session_names: list[str]) -> str:
        """Returns a human-readable UTC window for multiple sessions."""
        if not session_names or "None" in session_names:
            return "24/7"
        
        windows = []
        for s_name in session_names:
            if s_name in SESSIONS:
                s = SESSIONS[s_name]
                sh, sm = s["start"]
                eh, em = s["end"]
                windows.append(f"{s_name} ({sh:02d}:{sm:02d}-{eh:02d}:{em:02d} UTC)")
            else:
                windows.append(f"Custom ({s_name} UTC)")
        
        return ", ".join(windows)

    async def start_monitor(self):
        """Start background loop to monitor session status.
        If the session is currently INACTIVE at startup, sends a Telegram notification.
        """
        if not self.session_names or "None" in self.session_names:
            return
        
        self.is_active = True
        
        # ---- STARTUP CHECK ----
        if not self.is_session_active(self.session_names):
            window_str = self.get_session_window_str(self.session_names)
            now_utc = datetime.utcnow().strftime("%H:%M UTC")
            
            display_name = ", ".join(self.session_names)
            msg = (
                f"⏳ *Session Waiting...*\n"
                f"Bot #{getattr(self.bot, 'bot_id', '?')} is running but the *{display_name}* "
                f"session is not active yet.\n\n"
                f"📅 Target Windows: `{window_str}`\n"
                f"🕐 Current Time: `{now_utc}`\n\n"
                f"_The bot will automatically start taking entries when the session begins._"
            )
            logger.info(f"[Session Tracker] '{display_name}' is NOT active at startup. Waiting for session window: {window_str}.")
            # Send telegram notification if bot has the method
            if hasattr(self.bot, '_send_telegram'):
                asyncio.create_task(self.bot._send_telegram(msg))
            self._waiting_logged = True
        else:
            display_name = ", ".join(self.session_names)
            logger.info(f"[Session Tracker] '{display_name}' is ACTIVE. Bot is ready to take entries.")
        # -----------------------
        
        self._monitor_task = asyncio.create_task(self._monitor_loop())
        logger.info(f"[Session Tracker] Background monitor started for session: {display_name}")

    async def stop_monitor(self):
        """Stop background loop."""
        self.is_active = False
        if self._monitor_task and not self._monitor_task.done():
            self._monitor_task.cancel()

    async def _monitor_loop(self):
        """Background loop that:
        - Logs every 30s when session is not yet active (waiting mode)  
        - EVERY 3 seconds logs a warning in the terminal when session is not active
        - Fires on_session_end callback when an active session expires
        """
        was_active = self.is_session_active(self.session_names)
        log_counter = 0

        while self.is_active and self.bot.running:
            try:
                currently_active = self.is_session_active(self.session_names)
                now_utc = datetime.utcnow().strftime("%H:%M:%S UTC")
                window_str = self.get_session_window_str(self.session_names)
                display_name = ", ".join(self.session_names)

                if not currently_active:
                    # Log to terminal every 3 seconds (every loop tick)
                    logger.info(
                        f"⏳🚫 [Session Filter] '{display_name}' NOT active ({now_utc}). "
                        f"Windows: {window_str}. No entries will be taken."
                    )

                    # If we just transitioned from active -> inactive, fire the end callback
                    if was_active:
                        logger.warning(f"[Session Tracker] '{display_name}' session just ended! Triggering auto-shutdown.")
                        if asyncio.iscoroutinefunction(self.on_session_end):
                            await self.on_session_end(display_name)
                        else:
                            self.on_session_end(display_name)
                        break  # Stop monitoring since the bot is shutting down
                else:
                    # Session is active
                    if not was_active:
                        # Just transitioned from waiting -> active!
                        logger.info(f"[Session Tracker] '{display_name}' session is now ACTIVE! Bot will start taking entries.")
                        if hasattr(self.bot, '_send_telegram'):
                            asyncio.create_task(self.bot._send_telegram(
                                f"🟢 *Session Started!*\n"
                                f"The *{display_name}* session is now active.\n"
                                f"Bot #{getattr(self.bot, 'bot_id', '?')} will now start monitoring for entries."
                            ))
                    self._waiting_logged = False

                was_active = currently_active
                await asyncio.sleep(3)  # Check every 3 seconds
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in TradingSessionTracker loop: {e}")
                await asyncio.sleep(3)
