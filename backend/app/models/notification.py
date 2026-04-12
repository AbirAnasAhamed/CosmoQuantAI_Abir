from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.db.base_class import Base

class NotificationSettings(Base):
    __tablename__ = "notification_settings"

    user_id = Column(Integer, primary_key=True, index=True)
    telegram_bot_token = Column(String, nullable=True)
    telegram_chat_id = Column(String, nullable=True)
    is_enabled = Column(Boolean, default=False)

    # === Session Alert Preferences ===
    notify_sydney = Column(Boolean, default=True)
    notify_tokyo = Column(Boolean, default=True)
    notify_london = Column(Boolean, default=True)
    notify_new_york = Column(Boolean, default=True)

    # === Alert Type Toggles ===
    alert_session_start = Column(Boolean, default=True)   # Basic session start alert
    alert_price_data = Column(Boolean, default=True)      # Include market price in alert
    alert_overlap = Column(Boolean, default=True)         # London+NY overlap alert
    alert_weekly_summary = Column(Boolean, default=True)  # Weekly session summary
    alert_server_errors = Column(Boolean, default=True)   # System alert monitoring for docker logs
    broadcast_live_logs = Column(Boolean, default=True)   # Whether to broadcast live container logs via Redis to the frontend

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
