import feedparser
import asyncio
from datetime import datetime, timedelta
from dateutil import parser
import logging
import urllib.parse
import requests
import praw # type: ignore
from app.core.config import settings

# Setup logger
logger = logging.getLogger(__name__)

class NewsScraper:
    COINTELEGRAPH_RSS = "https://cointelegraph.com/rss"
    COINDESK_RSS = "https://www.coindesk.com/arc/outboundfeeds/rss/"
    CRYPTOPANIC_RSS = "https://cryptopanic.com/news/rss/"
    CRYPTOPANIC_API_URL = "https://cryptopanic.com/api/developer/v2/posts/?auth_token={token}&public=true"
    GOOGLE_NEWS_RSS_TEMPLATE = "https://news.google.com/rss/search?q={query}+when:{period}&hl={lang}-{country}&gl={country}&ceid={country}:{lang}"

    # Known placeholder values that indicate credentials are not configured
    _PLACEHOLDER_PATTERNS = ("your_", "YOUR_", "placeholder", "PLACEHOLDER", "<", "xxx", "test")

    # CryptoPanic rate-limit cooldown tracking (class-level so it persists across calls)
    _cryptopanic_rate_limited_until: datetime = datetime.min
    # Cooldown duration after a 429 response (minutes)
    _CRYPTOPANIC_COOLDOWN_MINUTES: int = 15

    # Redis cache keys
    _REDIS_CACHE_KEY = "cryptopanic:cache:results"
    _REDIS_COOLDOWN_KEY = "cryptopanic:rate_limit_until"
    _REDIS_RSS_COOLDOWN_KEY = "cryptopanic:rss_rate_limit_until"

    # How long to cache a successful API response (seconds)
    _CACHE_TTL_SECONDS: int = 6 * 3600   # 6 hours
    # Cooldown duration after an RSS 403/429 response (minutes)
    _RSS_COOLDOWN_MINUTES: int = 30

    def _is_placeholder(self, value: str) -> bool:
        """Returns True if the value looks like an unconfigured placeholder."""
        if not value:
            return True
        return any(value.startswith(p) for p in self._PLACEHOLDER_PATTERNS)

    def __init__(self):
        self.reddit = None
        reddit_id = settings.REDDIT_CLIENT_ID or ""
        reddit_secret = settings.REDDIT_CLIENT_SECRET or ""

        if self._is_placeholder(reddit_id) or self._is_placeholder(reddit_secret):
            logger.warning(
                "Reddit credentials appear to be placeholder values. "
                "Set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET in .env to enable Reddit."
            )
        elif reddit_id and reddit_secret:
            try:
                self.reddit = praw.Reddit(
                    client_id=reddit_id,
                    client_secret=reddit_secret,
                    user_agent=settings.REDDIT_USER_AGENT
                )
                logger.info("Reddit PRAW initialized successfully.")
            except Exception as e:
                logger.error(f"Failed to initialize Reddit PRAW: {e}")
        else:
            logger.warning("Reddit credentials missing. Skipping Reddit integration.")

    # -------------------------------------------------------------------------
    # Redis helpers (sync wrappers — scraper methods are sync, Redis is sync too)
    # -------------------------------------------------------------------------

    def _get_redis(self):
        """Return a sync Redis client, or None if unavailable."""
        try:
            import redis as redis_lib
            import os
            redis_url = os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0")
            return redis_lib.from_url(redis_url, decode_responses=True)
        except Exception:
            return None

    def _redis_get_cached_cryptopanic(self):
        """
        Return deserialized list from Redis cache if it exists, else None.
        Also handles converting stored strings back to datetime objects.
        """
        try:
            import json
            r = self._get_redis()
            if not r:
                return None
            raw = r.get(self._REDIS_CACHE_KEY)
            if not raw:
                return None
            items = json.loads(raw)
            # Restore datetime objects
            for item in items:
                if isinstance(item.get("published_at"), str):
                    try:
                        item["published_at"] = parser.parse(item["published_at"])
                    except Exception:
                        item["published_at"] = datetime.now()
            return items
        except Exception as exc:
            logger.debug(f"CryptoPanic cache read failed: {exc}")
            return None

    def _redis_set_cached_cryptopanic(self, items: list):
        """Serialize and store CryptoPanic results in Redis with TTL."""
        try:
            import json
            r = self._get_redis()
            if not r:
                return
            # datetime is not JSON-serializable — convert to ISO strings
            serializable = []
            for item in items:
                entry = dict(item)
                if isinstance(entry.get("published_at"), datetime):
                    entry["published_at"] = entry["published_at"].isoformat()
                serializable.append(entry)
            r.setex(self._REDIS_CACHE_KEY, self._CACHE_TTL_SECONDS, json.dumps(serializable))
            logger.info(
                f"CryptoPanic: {len(items)} items cached in Redis for "
                f"{self._CACHE_TTL_SECONDS // 3600}h."
            )
        except Exception as exc:
            logger.debug(f"CryptoPanic cache write failed: {exc}")

    def _redis_is_rate_limited(self) -> bool:
        """
        Check whether a Redis-persisted cooldown key is still alive.
        This survives Celery worker restarts unlike the class-level variable.
        """
        try:
            r = self._get_redis()
            if not r:
                # Fallback: use in-memory class variable
                return datetime.utcnow() < NewsScraper._cryptopanic_rate_limited_until
            return r.exists(self._REDIS_COOLDOWN_KEY) == 1
        except Exception:
            return datetime.utcnow() < NewsScraper._cryptopanic_rate_limited_until

    def _redis_set_rate_limit_cooldown(self, cooldown_minutes: int):
        """Persist rate-limit cooldown both in Redis and the class variable."""
        now = datetime.utcnow()
        until = now + timedelta(minutes=cooldown_minutes)
        # Class-level (in-memory, fast)
        NewsScraper._cryptopanic_rate_limited_until = until
        # Redis (survives restarts)
        try:
            r = self._get_redis()
            if r:
                r.setex(self._REDIS_COOLDOWN_KEY, cooldown_minutes * 60, "1")
        except Exception as exc:
            logger.debug(f"CryptoPanic cooldown Redis write failed: {exc}")

    def _redis_is_rss_rate_limited(self) -> bool:
        """Check whether the RSS cooldown key is alive in Redis."""
        try:
            r = self._get_redis()
            if not r: return False
            return r.exists(self._REDIS_RSS_COOLDOWN_KEY) == 1
        except Exception:
            return False

    def _redis_set_rss_rate_limit_cooldown(self, cooldown_minutes: int):
        """Set a cooldown for the RSS fallback in Redis."""
        try:
            r = self._get_redis()
            if r:
                r.setex(self._REDIS_RSS_COOLDOWN_KEY, cooldown_minutes * 60, "1")
        except Exception as exc:
            logger.debug(f"CryptoPanic RSS cooldown Redis write failed: {exc}")

    def fetch_rss_feed(self, url: str, source_name: str) -> list[dict]:
        """
        Generic RSS fetcher and parser with improved headers to mimic a modern browser.
        Log status issues as WARNING to avoid triggering automated 'Server Alerts'.
        """
        news_items = []
        try:
            # Modernized headers (Chrome 123) to bypass basic bot detection architectures
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://www.google.com/',
                'DNT': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'cross-site',
                'Upgrade-Insecure-Requests': '1'
            }
            
            timeout = getattr(settings, "DEFAULT_HTTP_TIMEOUT", 20)
            response = requests.get(url, headers=headers, timeout=timeout)
            
            # Using WARNING instead of ERROR to suppress automated terminal alerts
            if response.status_code != 200:
                logger.warning(
                    f"Transient issue fetching RSS from {source_name} ({url}). "
                    f"Status: {response.status_code}"
                )
                
                # If specific to CryptoPanic RSS and blocked, trigger RSS cooldown
                if "CryptoPanic" in source_name and response.status_code in (403, 429):
                    self._redis_set_rss_rate_limit_cooldown(self._RSS_COOLDOWN_MINUTES)
                
                return []

            feed = feedparser.parse(response.content)
            
            # check for bozo bit (malformed XML or other errors)
            if feed.bozo:
                excerpt = str(feed.bozo_exception)
                # Check for common Cloudflare/HTML block signatures in the exception or feed
                if "mismatched tag" in excerpt or "SAXParseException" in excerpt:
                     # Identify if it's likely a Cloudflare block (HTML returned instead of XML)
                     if b"<!DOCTYPE html>" in response.content or b"Cloudflare" in response.content:
                         logger.warning(
                             f"RSS {source_name} likely blocked by Cloudflare (HTML returned). "
                             f"Trigerring cooldown."
                         )
                         if "CryptoPanic" in source_name:
                             self._redis_set_rss_rate_limit_cooldown(self._RSS_COOLDOWN_MINUTES)
                     else:
                         logger.warning(f"Feedparser issue with {source_name}: {feed.bozo_exception}")
                else:
                    logger.warning(f"Feedparser issue with {source_name}: {feed.bozo_exception}")

            if not feed.entries:
                 logger.info(f"No entries found for {source_name}. It might be empty.")

            for entry in feed.entries[:10]: # Limit to 10 latest per source
                # Normalization
                title = entry.get('title', 'No Title')
                link = entry.get('link', '')
                
                # Published Date Parsing
                pub_date = datetime.now()
                if 'published' in entry:
                    try:
                        pub_date = parser.parse(entry.published)
                    except:
                        pass
                elif 'updated' in entry:
                     try:
                        pub_date = parser.parse(entry.updated)
                     except:
                        pass
                
                item = {
                    'title': title,
                    'url': link,
                    'source': source_name,
                    'published_at': pub_date
                }
                news_items.append(item)
                
        except Exception as e:
            logger.warning(f"Error fetching RSS from {source_name}: {e}")
            
        return news_items

    def fetch_reddit_posts(self, limit: int = 10) -> list[dict]:
        """
        Fetches top discussions from r/Cryptocurrency and r/Bitcoin using PRAW.
        """
        if not self.reddit:
            return []

        reddit_news = []
        subreddits = ['Cryptocurrency', 'Bitcoin']

        for sub_name in subreddits:
            try:
                subreddit = self.reddit.subreddit(sub_name)
                # Fetch hot posts
                for post in subreddit.hot(limit=limit):
                    if post.stickied:
                        continue
                        
                    # Normalize data
                    item = {
                        'title': post.title,
                        'url': post.url,
                        'source': f'Reddit (r/{sub_name})',
                        'published_at': datetime.fromtimestamp(post.created_utc)
                    }
                    reddit_news.append(item)
            except Exception as e:
                logger.error(f"Error fetching from r/{sub_name}: {e}")

        return reddit_news

    def fetch_google_news(self, query="Cryptocurrency", period="1d") -> list[dict]:
        """
        Fetches news from Google News RSS.
        """
        url = self.GOOGLE_NEWS_RSS_TEMPLATE.format(
            query=urllib.parse.quote(query),
            period=period,
            lang="en",
            country="US"
        )
        # Re-use the generic fetcher, though Google News structure is standard RSS mostly.
        return self.fetch_rss_feed(url, "Google News")

    # -------------------------------------------------------------------------
    # CryptoPanic — smart cached + rate-limit-aware fetcher
    # -------------------------------------------------------------------------

    def fetch_cryptopanic_api(self) -> list[dict]:
        """
        Fetches news from CryptoPanic API with a 3-layer smart strategy:

        Layer 1 — Redis Cache (6 h TTL):
            A successful response is cached.  Every subsequent call within the
            TTL returns the cached data without touching the API at all.

        Layer 2 — Rate-Limit Guard (Redis-persisted cooldown):
            If a 429 is received the cooldown is written to Redis so it survives
            Celery worker restarts.  While the cooldown key is alive, the last
            cached response is returned instead of an empty list.

        Layer 3 — RSS Fallback:
            If neither cache nor API data is available, we transparently fall
            back to the public CryptoPanic RSS feed (no auth required).
        """
        api_key = settings.CRYPTOPANIC_API_KEY
        if not api_key:
            logger.warning("CryptoPanic API key not found. Skipping API fetch.")
            return []

        # ── Layer 1: serve from Redis cache if still fresh ──────────────────
        cached = self._redis_get_cached_cryptopanic()
        if cached is not None:
            logger.info(
                f"CryptoPanic: serving {len(cached)} items from Redis cache "
                f"(TTL {self._CACHE_TTL_SECONDS // 3600}h)."
            )
            return cached

        # ── Layer 2: respect rate-limit cooldown ─────────────────────────────
        if self._redis_is_rate_limited():
            logger.info(
                "CryptoPanic rate-limit cooldown active (Redis key present). "
                "Falling back to RSS feed."
            )
            return self._rss_fallback()

        # ── Live API call ────────────────────────────────────────────────────
        url = self.CRYPTOPANIC_API_URL.format(token=api_key)
        headers = {
            'User-Agent': (
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                'AppleWebKit/537.36 (KHTML, like Gecko) '
                'Chrome/123.0.0.0 Safari/537.36'
            )
        }

        try:
            timeout = getattr(settings, "DEFAULT_HTTP_TIMEOUT", 15)
            response = requests.get(url, headers=headers, timeout=timeout)

            if response.status_code == 200:
                try:
                    data = response.json()
                except ValueError:
                    logger.warning(
                        "CryptoPanic API returned non-JSON response (Cloudflare block). "
                        "Falling back to RSS."
                    )
                    return self._rss_fallback()

                news_items = []
                if 'results' in data:
                    for post in data['results']:
                        title = post.get('title', 'No Title')
                        link = post.get('url', '')
                        published_at = datetime.now()
                        if 'published_at' in post:
                            try:
                                published_at = parser.parse(post['published_at'])
                            except Exception:
                                pass
                        news_items.append({
                            'title': title,
                            'url': link,
                            'source': 'CryptoPanic',
                            'published_at': published_at,
                        })
                else:
                    logger.warning(
                        f"CryptoPanic API returned unexpected format: "
                        f"{list(data.keys())}"
                    )

                # Cache the fresh results
                if news_items:
                    self._redis_set_cached_cryptopanic(news_items)

                return news_items

            elif response.status_code in (403, 429):
                # Parse Retry-After header if provided
                retry_after = response.headers.get("Retry-After")
                if retry_after and retry_after.isdigit():
                    cooldown_minutes = max(int(retry_after) // 60,
                                          self._CRYPTOPANIC_COOLDOWN_MINUTES)
                else:
                    cooldown_minutes = self._CRYPTOPANIC_COOLDOWN_MINUTES

                self._redis_set_rate_limit_cooldown(cooldown_minutes)
                logger.warning(
                    f"CryptoPanic API blocked (HTTP {response.status_code}). "
                    f"Cooling down for {cooldown_minutes} min. "
                    f"Falling back to RSS."
                )
                return self._rss_fallback()

            elif response.status_code == 401:
                logger.warning(
                    "CryptoPanic API 401 Unauthorized. "
                    "Check CRYPTOPANIC_API_KEY in .env."
                )
                return []

            elif response.status_code in (502, 503, 504):
                logger.warning(
                    f"CryptoPanic API temporarily unavailable "
                    f"(HTTP {response.status_code}). Falling back to RSS."
                )
                return self._rss_fallback()

            else:
                logger.warning(
                    f"CryptoPanic API returned unexpected status "
                    f"{response.status_code}. Falling back to RSS."
                )
                return self._rss_fallback()

        except requests.exceptions.Timeout:
            logger.warning("CryptoPanic API request timed out. Falling back to RSS.")
            return self._rss_fallback()
        except Exception as e:
            logger.warning(f"Error fetching from CryptoPanic API: {e}")
            return self._rss_fallback()

    def _rss_fallback(self) -> list[dict]:
        """
        Transparent fallback: fetch CryptoPanic's public RSS feed when the
        authenticated API is unavailable or rate-limited.
        Includes a cooldown check to avoid hammering a blocked RSS endpoint.
        """
        if self._redis_is_rss_rate_limited():
             logger.info("CryptoPanic RSS fallback in cooldown. Skipping.")
             return []
             
        logger.info("CryptoPanic: using public RSS fallback.")
        return self.fetch_rss_feed(self.CRYPTOPANIC_RSS, "CryptoPanic (RSS)")

    async def get_crypto_news(self) -> list[dict]:
        """
        Aggregates news from all sources asynchronously.
        """
        tasks = []

        # 1. Google News
        tasks.append(asyncio.to_thread(self.fetch_google_news))

        # 2. CoinTelegraph
        tasks.append(asyncio.to_thread(self.fetch_rss_feed, self.COINTELEGRAPH_RSS, "CoinTelegraph"))

        # 3. CoinDesk
        tasks.append(asyncio.to_thread(self.fetch_rss_feed, self.COINDESK_RSS, "CoinDesk"))

        # 4. CryptoPanic — always go through the smart cached fetcher
        tasks.append(asyncio.to_thread(self.fetch_cryptopanic_api))

        # 5. Reddit
        tasks.append(asyncio.to_thread(self.fetch_reddit_posts, 10))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        all_news = []
        for res in results:
            if isinstance(res, list):
                all_news.extend(res)
            else:
                logger.warning(f"News task failed with error: {res}")

        all_news.sort(key=lambda x: x.get('published_at') or datetime.min, reverse=True)

        return all_news


# Basic usage for testing (if run directly)
if __name__ == "__main__":
    scraper = NewsScraper()
    news = asyncio.run(scraper.get_crypto_news())
    print(f"Fetched {len(news)} items.")
    for n in news[:5]:
        print(f"[{n['source']}] {n['title']} ({n['published_at']})")
