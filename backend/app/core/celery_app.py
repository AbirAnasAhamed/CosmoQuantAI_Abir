from celery import Celery
from celery.schedules import crontab
from app.core.config import settings
import warnings

warnings.filterwarnings("ignore", category=UserWarning, module="gym")
warnings.filterwarnings("ignore", category=DeprecationWarning, module="gym")
warnings.filterwarnings("ignore", message=".*Gym has been unmaintained.*")

import sys
import types
# Mock gym_notices to completely silence the terminal print from gym.__init__
dummy_gym_notices = types.ModuleType("gym_notices")
dummy_gym_notices.notices = types.ModuleType("gym_notices.notices")
dummy_gym_notices.notices.notices = ""
sys.modules["gym_notices"] = dummy_gym_notices
sys.modules["gym_notices.notices"] = dummy_gym_notices.notices
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
        "prune-l2-data-hourly": {
            "task": "app.tasks.prune_l2_data",
            "schedule": crontab(minute=0), # Run every hour
        },
        "auto-retrain-models-hourly": {
            "task": "app.tasks.auto_retrain_models",
            "schedule": crontab(minute=30), # Run every hour at minute 30
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
    task_routes={
        'app.tasks.run_backtest_task': {'queue': 'heavy'},
        'app.tasks.run_optimization_task': {'queue': 'heavy'},
        'app.tasks.run_walk_forward_task': {'queue': 'heavy'},
        'app.tasks.run_batch_backtest_task': {'queue': 'heavy'},
        'app.tasks.celery_train_model_task': {'queue': 'heavy'},
    },
    broker_connection_retry_on_startup=True,
    broker_transport_options={'visibility_timeout': 86400},  # 24 hours to prevent duplicate long tasks
)

# Auto-discover tasks in packages
celery_app.autodiscover_tasks(["app.tasks"])
