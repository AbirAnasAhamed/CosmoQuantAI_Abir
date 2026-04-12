import os
from celery import Celery
from celery.schedules import crontab

# এনভায়রনমেন্ট ভেরিয়েবল থেকে কনফিগ নেওয়া
broker_url = os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0")
result_backend = os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0")

celery_app = Celery(
    "cosmoquant_tasks",
    broker=broker_url,
    backend=result_backend,
    include=["app.tasks"]
)

celery_app.conf.beat_schedule = {
    'fetch-sentiment-every-hour': {
        'task': 'app.tasks.fetch_and_store_sentiment',
        'schedule': crontab(minute=0), # Every hour at minute 0
    },
    "fetch-news-every-hour": {
        "task": "app.tasks.task_fetch_latest_news",
        "schedule": crontab(minute=0, hour="*"), # প্রতি ঘন্টায় একবার চলবে
    },
    "monitor-whale-movements": {
        "task": "app.tasks.monitor_whale_movements",
        "schedule": 300.0, # Every 5 minutes
    },
    "session-monitor": {
        "task": "app.tasks.run_session_monitor_task",
        "schedule": crontab(minute="*"), # Every 1 minute precisely
    },
    "docker-log-monitor": {
        "task": "app.tasks.monitor_docker_logs",
        "schedule": crontab(minute="*"), # Every 60 seconds — scan all container logs
    },
    "broadcast-container-logs": {
        "task": "app.tasks.broadcast_container_logs",
        "schedule": 10.0,  # Every 10 seconds — stream all logs to frontend
    },
}

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    broker_connection_retry_on_startup=True,
)
