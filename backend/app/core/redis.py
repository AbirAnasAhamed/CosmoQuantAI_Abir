from redis import asyncio as aioredis
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

class RedisManager:
    """
    Singleton class to manage Redis connection pool.
    """
    _instance = None
    redis: aioredis.Redis = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(RedisManager, cls).__new__(cls)
        return cls._instance

    async def init_redis(self):
        """
        Initialize the Redis connection pool.
        """
        if not self.redis:
            logger.info(f"🔌 Connecting to Redis at {settings.REDIS_URL}...")
            # max_connections is 10000+ by default in some settings, but we can stick to defaults or set explicit limits if needed.
            # Default is usually enough for typical usage, effectively unbounded or limited by OS.
            # We can set max_connections if strict control is needed, e.g. max_connections=100.
            # For now, relying on aioredis default pooling which is efficient.
            self.redis = aioredis.from_url(
                settings.REDIS_URL, 
                decode_responses=True,
                max_connections=1000, # Explicitly setting a high limit to accommodate 1000+ viewers
            )
            try:
                await self.redis.ping()
                logger.info("✅ Redis Connection Pool Established.")
            except Exception as e:
                logger.error(f"❌ Redis Connection Failed: {e}")
                # We might not want to crash entire app if redis is down, but it's critical.
                # Re-raising might be safer to let orchestration restart, but let's log for now.
                # raise e 

    async def close_redis(self):
        """
        Close the Redis connection pool.
        """
        if self.redis:
            await self.redis.close()
            logger.info("🛑 Redis Connection Pool Closed.")
            self.redis = None

    def get_redis(self) -> aioredis.Redis:
        """
        Get the Redis client instance.
        """
        return self.redis

# Global instance
redis_manager = RedisManager()

async def get_redis_pool() -> aioredis.Redis:
    """
    Dependency to get redis pool.
    """
    return redis_manager.get_redis()
