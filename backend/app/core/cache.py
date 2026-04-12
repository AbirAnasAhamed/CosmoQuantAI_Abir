import json
import logging
import functools
import hashlib
import re
from typing import Any, Callable, Optional
from app.core.redis import redis_manager

logger = logging.getLogger(__name__)

def cache(expire: int = 60):
    """
    Async decorator to cache function results in Redis.
    
    Args:
        expire (int): Expiration time in seconds.
    """
    def decorator(func: Callable):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            # 1. Generate a unique cache key
            
            # Remove memory addresses from args string to support instance methods
            # This handles cases where self is a new instance (e.g. <... object at 0x...>)
            args_str = str(args)
            kwargs_str = str(kwargs)
            
            # Regex to remove addresses like ' at 0x7f8b1c0d3a90' or ' at 0x...'
            clean_args = re.sub(r' at 0x[0-9a-fA-F]+', '', args_str)
            clean_kwargs = re.sub(r' at 0x[0-9a-fA-F]+', '', kwargs_str)
            
            key_parts = [func.__module__, func.__name__, clean_args, clean_kwargs]
            key_str = ":".join(key_parts)
            
            # Create a hash to keep the key short and safe
            key_hash = hashlib.md5(key_str.encode()).hexdigest()
            cache_key = f"cache:{func.__name__}:{key_hash}"

            redis = redis_manager.get_redis()
            
            # Fail-safe: If Redis is not connected, just run the function
            if not redis:
                logger.warning("Redis is not available. Skipping cache lookup.")
                return await func(*args, **kwargs)

            try:
                # 2. Check Redis for existing data
                cached_data = await redis.get(cache_key)
                if cached_data:
                    # logger.info(f"Cache HIT for {func.__name__}")
                    return json.loads(cached_data)
            except Exception as e:
                logger.warning(f"Redis get failed: {e}. Proceeding to live fetch.")

            # 3. Fetch live data
            result = await func(*args, **kwargs)

            try:
                # 4. Store result in Redis
                # Note: This assumes result is JSON serializable. 
                # If result is a Pydantic model, you might need result.model_dump_json() or jsonable_encoder
                # For now using json.dumps which works for dicts/lists/primitives.
                await redis.set(cache_key, json.dumps(result), ex=expire)
            except Exception as e:
                logger.warning(f"Redis set failed: {e}")

            return result
        return wrapper
    return decorator
