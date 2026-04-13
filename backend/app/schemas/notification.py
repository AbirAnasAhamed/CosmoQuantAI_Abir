from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class NotificationSettingsBase(BaseModel):
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    is_enabled: bool = False

    # Per-session toggles
    notify_sydney: bool = True
    notify_tokyo: bool = True
    notify_london: bool = True
    notify_new_york: bool = True

    # Alert type toggles
    alert_session_start: bool = True
    alert_price_data: bool = True
    alert_overlap: bool = True
    alert_weekly_summary: bool = True
    alert_server_errors: bool = True
    broadcast_live_logs: bool = True
    alert_market_news: bool = True

class NotificationSettingsCreate(NotificationSettingsBase):
    pass

class NotificationSettingsUpdate(NotificationSettingsBase):
    pass

class NotificationSettingsResponse(NotificationSettingsBase):
    user_id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
