"""
Exchange Connection Pool
========================
CCXT Exchange অবজেক্টগুলো মেমোরিতে Cache করে রাখে।
প্রতিটি অর্ডারে নতুন করে Exchange Init করতে হয় না,
ফলে Order Latency ~400-800ms কমে যায়।

শুধুমাত্র ManualTradeModal এর জন্য ব্যবহার করা হবে।
অন্য কোনো সার্ভিস এটি ব্যবহার করে না।
"""

import asyncio
import time
import logging
import ccxt.async_support as ccxt
from typing import Dict, Any, Optional, Tuple

logger = logging.getLogger(__name__)

# Cache entry: (exchange_instance, created_at_timestamp)
_pool: Dict[str, Tuple[Any, float]] = {}
_pool_lock = asyncio.Lock()

# একটি Exchange Instance কতক্ষণ Cache এ থাকবে (seconds)
CACHE_TTL_SECONDS = 300  # 5 মিনিট


def _make_cache_key(api_key_id: int, is_futures: bool) -> str:
    """api_key_id এবং mode (spot/futures) দিয়ে unique key তৈরি করে।"""
    mode = "futures" if is_futures else "spot"
    return f"key_{api_key_id}_{mode}"


async def get_or_create_exchange(
    api_key_id: int,
    exchange_name: str,
    decrypted_api_key: str,
    decrypted_secret: str,
    is_futures: bool,
    passphrase: Optional[str] = None,
) -> Any:
    """
    Cache থেকে Exchange Instance ফেরত দেয়।
    না থাকলে নতুন তৈরি করে Cache করে রাখে।
    """
    cache_key = _make_cache_key(api_key_id, is_futures)

    async with _pool_lock:
        # Cache Hit — TTL চেক করুন
        if cache_key in _pool:
            exchange, created_at = _pool[cache_key]
            if time.time() - created_at < CACHE_TTL_SECONDS:
                logger.debug(f"[ExchangePool] ✅ Cache HIT for key={api_key_id} mode={'futures' if is_futures else 'spot'}")
                return exchange
            else:
                # Expired — পুরনোটা বন্ধ করে নতুন তৈরি করব
                logger.debug(f"[ExchangePool] 🔄 Cache EXPIRED for key={api_key_id}, reinitializing...")
                try:
                    await exchange.close()
                except Exception:
                    pass
                del _pool[cache_key]

        # Cache Miss — নতুন Exchange তৈরি করুন
        logger.info(f"[ExchangePool] 🆕 Cache MISS — creating new exchange instance for key={api_key_id}")

        exchange_class = getattr(ccxt, exchange_name.lower(), None)
        if not exchange_class:
            raise ValueError(f"Unsupported exchange: {exchange_name}")

        config = {
            'apiKey': decrypted_api_key,
            'secret': decrypted_secret,
            'enableRateLimit': True,
            'options': {
                'adjustForTimeDifference': True,
                'recvWindow': 60000 if exchange_name.lower() == 'mexc' else 10000,
            }
        }

        if passphrase:
            config['password'] = passphrase

        if is_futures:
            config['options']['defaultType'] = 'swap'

        exchange = exchange_class(config)

        # Markets লোড করে রাখুন — পরবর্তী রিকোয়েস্টে আর লাগবে না
        try:
            await exchange.load_markets()
            logger.info(f"[ExchangePool] ✅ Markets loaded for {exchange_name} key={api_key_id}")
        except Exception as e:
            logger.warning(f"[ExchangePool] ⚠️ Market load warning for {exchange_name}: {e}")

        _pool[cache_key] = (exchange, time.time())
        return exchange


async def invalidate(api_key_id: int):
    """
    নির্দিষ্ট API Key-এর সব Cache Entry মুছে ফেলে।
    Key Update বা Delete হলে call করতে হবে।
    """
    async with _pool_lock:
        keys_to_remove = [k for k in _pool if k.startswith(f"key_{api_key_id}_")]
        for k in keys_to_remove:
            exchange, _ = _pool.pop(k)
            try:
                await exchange.close()
            except Exception:
                pass
        if keys_to_remove:
            logger.info(f"[ExchangePool] 🗑️ Invalidated {len(keys_to_remove)} cache entries for api_key_id={api_key_id}")


async def close_all():
    """
    সব Connection বন্ধ করে। App shutdown এ call করতে হবে।
    """
    async with _pool_lock:
        for key, (exchange, _) in list(_pool.items()):
            try:
                await exchange.close()
            except Exception:
                pass
        _pool.clear()
        logger.info("[ExchangePool] 🛑 All cached connections closed.")
