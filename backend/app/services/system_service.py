
import logging
from sqlalchemy.sql import text
from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError
from redis.exceptions import ConnectionError
from app.core.celery_app import celery_app
from app.core.redis import redis_manager

logger = logging.getLogger(__name__)

class SystemService:
    @staticmethod
    async def check_health(db: Session):
        """
        Check the health of critical system components: Database, Redis, Celery.
        """
        services_status = {
            "database": "unknown",
            "redis": "unknown",
            "celery_worker": "unknown"
        }
        
        # 1. Database Check
        try:
            db.execute(text("SELECT 1"))
            services_status["database"] = "online"
        except Exception as e:
            logger.error(f"Health Check - Database Error: {e}")
            services_status["database"] = "offline"

        # 2. Redis Check
        try:
            redis_client = redis_manager.get_redis()
            if redis_client:
                await redis_client.ping()
                services_status["redis"] = "online"
            else:
                # If client is None, it might not be initialized. 
                # In a real app getting a request, it should be initialized.
                services_status["redis"] = "offline"
        except Exception as e:
            logger.error(f"Health Check - Redis Error: {e}")
            services_status["redis"] = "offline"

        # 3. Celery Worker Check
        try:
            # inspect() defaults to a small timeout if not specified, 
            # but we should be explicit if possible. 
            # However, standard Celery inspect() init accepts timeout.
            inspector = celery_app.control.inspect(timeout=2.0)
            stats = inspector.active()
            
            # stats is None if no workers replied.
            # stats is a dict if workers replied (even if empty list of active tasks).
            if stats is not None:
                services_status["celery_worker"] = "online"
            else:
                services_status["celery_worker"] = "offline"
        except Exception as e:
            logger.error(f"Health Check - Celery Error: {e}")
            services_status["celery_worker"] = "error"

        # Determine overall status
        # Critical services that cause UNHEALTHY state
        if services_status["database"] != "online" or services_status["redis"] != "online":
             overall_status = "unhealthy"
        elif services_status["celery_worker"] != "online":
             # Non-critical but important
             overall_status = "degraded"
        else:
             overall_status = "healthy"

        return {
            "status": overall_status,
            "services": services_status,
            # Timestamp can be added by the caller or here. 
            # Using ISO format usually.
            "timestamp": "now" # Placeholder, will be replaced or formatted in Pydantic schema if needed
        }
