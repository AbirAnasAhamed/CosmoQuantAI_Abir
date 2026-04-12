from celery import Celery
from celery.schedules import crontab
from app.core.config import settings

celery_app = Celery(
    "cosmoquant",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    beat_schedule={
        "fetch-news-every-10-mins": {
            "task": "app.tasks.fetch_market_news",
            "schedule": 600.0,  # 10 minutes in seconds
        },
        "prune-db-daily-midnight": {
            "task": "app.tasks.prune_database",
            "schedule": crontab(minute=0, hour=0),
        },
        "docker-log-monitor": {
            "task": "app.tasks.monitor_docker_logs",
            "schedule": 60.0,
        },
        "broadcast-container-logs": {
            "task": "app.tasks.broadcast_container_logs",
            "schedule": 2.0,  # FAST polling (every 2 seconds) for near real-time!
        },
    },
    broker_connection_retry_on_startup=True,
)

# Auto-discover tasks in packages
celery_app.autodiscover_tasks(["app.tasks"])
