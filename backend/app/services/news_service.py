import httpx
import html
import requests
import asyncio
import feedparser
import time
from datetime import datetime, timedelta, timezone
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
import pandas as pd
import random
from deep_translator import GoogleTranslator
from app.services.translation_service import translation_service
from app.services.impact_service import impact_analysis_service
# from transformers import pipeline # Moved to inside get_pipeline to save memory on import
from app.core.config import settings
import logging
import urllib.parse
import hashlib
from app.core.redis import redis_manager

logger = logging.getLogger(__name__)

# Global Singleton for FinBERT
_sentiment_pipeline = None

def get_pipeline():
    """Singleton Accessor for FinBERT Pipeline (Lazy Loading)"""
    global _sentiment_pipeline
    if _sentiment_pipeline is None:
        if settings.ENABLE_FINBERT:
            try:
                # Suppress noisy 404 warnings from huggingface_hub checking for optional files
                logging.getLogger("transformers").setLevel(logging.ERROR)
                logging.getLogger("huggingface_hub").setLevel(logging.ERROR)

                print("🧠 Loading FinBERT model... (This may take a moment)")
                from transformers import pipeline
                _sentiment_pipeline = pipeline("sentiment-analysis", model="ProsusAI/finbert")
                print("✅ FinBERT model loaded and cached globally.")
            except Exception as e:
                print(f"⚠️ FinBERT Load Failed (Memory/Network): {e}. Falling back to VADER.")
                _sentiment_pipeline = False # Mark as failed so we don't retry forever
        else:
            _sentiment_pipeline = False
    return _sentiment_pipeline if _sentiment_pipeline else None

class NewsService:
    def __init__(self):
        # We are using RSS now, so GNews init is removed.
        self.vader = SentimentIntensityAnalyzer()
        # FinBERT is now accessed via get_pipeline() global singleton

    def _generate_news_hash(self, url: str) -> str:
        """Generate SHA256 hash for news URL to use as Redis key"""
        return hashlib.sha256(url.encode('utf-8')).hexdigest()

    async def _get_processed_news(self, news_hash: str):
        """Get processed news data from Redis if exists"""
        redis = redis_manager.get_redis()
        if not redis: return None
        try:
            data = await redis.get(f"news:processed:{news_hash}")
            if data:
                import json
                parsed = json.loads(data)
                if isinstance(parsed, dict):
                    return parsed
                # If it's valid JSON but not a dict (e.g. "1" from old version), return None to re-process
                return None
            return None
        except Exception:
            return None

    async def _mark_news_as_processed(self, news_hash: str, data: dict):
        """Mark news as processed for 24h and store data"""
        redis = redis_manager.get_redis()
        if not redis: return
        try:
            import json
            # TTL = 24 hours (86400 seconds)
            await redis.setex(f"news:processed:{news_hash}", 86400, json.dumps(data))
        except Exception as e:
            print(f"⚠️ Redis Write Failed: {e}")

    def _chunk_list(self, data, size):
        """Yield successive n-sized chunks from data."""
        for i in range(0, len(data), size):
            yield data[i:i + size]

    def analyze_batch(self, texts: list[str]) -> list[dict]:
        """
        Analyze a batch of texts using FinBERT pipeline.
        Returns a list of dicts: [{'label': '..', 'score': ..}, ...]
        """
        model = get_pipeline()
        results = []
        if not model:
            # Fallback to VADER for batch? VADER is fast enough to loop.
            # But let's return a consistent format.
            for text in texts:
                vs = self.vader.polarity_scores(str(text))
                # Map VADER to FinBERT format roughly
                compound = vs['compound']
                label = 'positive' if compound > 0.05 else 'negative' if compound < -0.05 else 'neutral'
                results.append({'label': label, 'score': abs(compound)})
            return results

        try:
            # pipeline call with list
            # Truncate texts to avoid token length issues (512 is standard BERT limit)
            truncated_texts = [str(t)[:512] for t in texts]
            results = model(truncated_texts)
            return results
        except Exception as e:
            print(f"⚠️ Batch Analysis Failed: {e}")
            # Fallback/Empty or retry individually?
            # Requirement: "catches it, logs the error, and tries to process the rest or skips"
            # Skipping the batch or returning nulls
            return [{'label': 'neutral', 'score': 0.0} for _ in texts]

    async def fetch_and_process_latest_news(self):
        """
        Orchestrator method to be called by Celery Task.
        Fetches news using the scraper logic and updates DB.
        """
        try:
            print("📰 Starting Market News Fetch Job...")
            from app.db.session import SessionLocal
            from app.services.news_scraper import NewsScraper
            from app.models.education import EducationResource
            
            db = SessionLocal()
            count = 0
            new_resources = []
            
            try:
                # Initialize Scraper
                scraper = NewsScraper()
                
                # Fetch News (Unified)
                news_items = await scraper.get_crypto_news()
                
                # 1. Filter duplicates and prepare for batching
                # Skip items with empty/missing URLs (they would violate the unique constraint)
                new_items_to_process = []
                for item in news_items:
                    item_url = item.get('url', '').strip()
                    if not item_url:  # Skip empty URLs - they can't be uniquely identified
                        logger.warning(f"Skipping news item with empty URL: '{item.get('title', 'Unknown')}' from {item.get('source', 'Unknown')}")
                        continue
                    existing = db.query(EducationResource).filter(EducationResource.link == item_url).first()
                    if not existing:
                        item['url'] = item_url  # Use stripped URL
                        new_items_to_process.append(item)
                
                if not new_items_to_process:
                     logger.info("✅ Market News Fetch Completed. No new items.")
                     return 0

                # 2. Batch Sentiment Analysis
                # Collect titles
                titles = [item['title'] for item in new_items_to_process]
                
                # Process in chunks
                batch_size = 10
                all_sentiments = []
                
                for chunk_titles in self._chunk_list(titles, batch_size):
                    try:
                        # Offload heavy model inference to thread
                        batch_results = await asyncio.to_thread(self.analyze_batch, chunk_titles)
                        all_sentiments.extend(batch_results)
                    except Exception as e:
                        print(f"❌ Batch Chunk Failed: {e}")
                        # Append defaults to keep alignment
                        all_sentiments.extend([{'label': 'neutral', 'score': 0.0}] * len(chunk_titles))

                # 3. Map results back and Save (one-by-one to avoid entire batch failure on duplicate)
                total_sentiment_score = 0
                score = 0
                
                for i, item in enumerate(new_items_to_process):
                    # Safety check for index
                    if i < len(all_sentiments):
                        sent_res = all_sentiments[i]
                        # Calculate a simple score for averaging
                        if sent_res['label'].lower() == 'positive':
                            score = sent_res['score']
                        elif sent_res['label'].lower() == 'negative':
                            score = -sent_res['score']
                        else:
                            score = 0
                        total_sentiment_score += score
                        item['sentiment_score'] = score # Attach to dict if needed temporarily
                    
                    # Impact Analysis
                    impact_data = impact_analysis_service.calculate_impact(item['title'], score)
                    
                    # Calculate simple category
                    title_lower = item['title'].lower()
                    cat = "General"
                    if "bitcoin" in title_lower: cat = "Bitcoin"
                    elif "ethereum" in title_lower: cat = "Ethereum"
                    elif "defi" in title_lower: cat = "DeFi"
                    
                    resource = EducationResource(
                        title=item['title'],
                        description=f"Source: {item['source']}", # Summary often missing in simple RSS
                        type="News",
                        category=cat,
                        source=item['source'],
                        link=item['url'],
                        image_url="",
                        published_at=item.get('published_at', datetime.now(timezone.utc)),
                        impact_level=impact_data['level'],
                        impact_score=impact_data['score']
                    )
                    # Save each item individually to prevent one duplicate from aborting the whole batch
                    try:
                        db.add(resource)
                        db.flush()  # Detect constraint violations early without committing
                        new_resources.append(resource)
                        count += 1
                    except Exception as insert_err:
                        db.rollback()  # Roll back the failed flush
                        logger.warning(f"Skipping duplicate/invalid news item '{item['title']}': {insert_err}")
                        continue  # Continue saving remaining items
                
                db.commit()

                if count > 0:
                    avg_score = total_sentiment_score / count
                    logger.info(f"📊 Average Batch Sentiment Score: {avg_score:.2f}")

                if new_resources:
                    logger.info(f"✅ Market News Fetch Completed. {count} new items. Sending notifications...")
                    from app.services.notification import NotificationService
                    from app.models.notification import NotificationSettings
                    
                    # Fetch all users with enabled notifications for market news
                    active_notifications = db.query(NotificationSettings).filter(
                        NotificationSettings.is_enabled == True,
                        NotificationSettings.alert_market_news == True
                    ).all()
                    
                    for r in new_resources:
                        # Translate title to Bengali
                        try:
                            translator = GoogleTranslator(source='auto', target='bn')
                            bn_title = await asyncio.to_thread(translator.translate, r.title)
                            safe_title = html.escape(bn_title)
                        except Exception as e:
                            logger.error(f"Translation error: {e}")
                            safe_title = html.escape(r.title)
                            
                        voice_path = None
                        hashtags = f"#HighImpact #{r.category.replace(' ', '')}"
                        insights = ""
                        trading_verdict = ""
                        
                        if r.impact_level == 'HIGH':
                            from app.services.telegram_ai_agent import telegram_ai_agent
                            import os
                            
                            ai_data = await telegram_ai_agent.get_ai_insights(r.title, r.link)
                            
                            raw_summary = ai_data.get("bengali_summary", "")
                            if isinstance(raw_summary, list):
                                raw_summary = "\n".join([str(x) for x in raw_summary])
                            summary = html.escape(str(raw_summary))
                            # The <br> or \n might be escaped depending on how Gemini formatted it. 
                            # We will assume summary text formatting is clean.
                            if summary:
                                # unescape quotes/newlines if needed or keep text simple
                                insights = f"\n\n📝 <b>সারসংক্ষেপ:</b>\n{summary}"
                            
                            verdict = html.escape(ai_data.get("trading_verdict", ""))
                            if verdict:
                                trading_verdict = f"\n\n💡 <b>এআই ট্রেডিং বিশ্লেষণ:</b> {verdict}"
                                
                            raw_hashtags = ai_data.get("hashtags", "")
                            if isinstance(raw_hashtags, list):
                                raw_hashtags = " ".join([str(x) for x in raw_hashtags])
                            ai_hashtags = html.escape(str(raw_hashtags))
                            
                            if ai_hashtags and ai_hashtags != "#CryptoNews":
                                hashtags = ai_hashtags
                                
                            if summary:
                                voice_path = await telegram_ai_agent.generate_voice_note(ai_data.get("bengali_summary", ""))

                            msg = f"🚨 <b>ব্রেকিং নিউজ</b> 🚨\n\n<a href='{r.link}'><b>{safe_title}</b></a>{insights}{trading_verdict}\n\n🔥 ইমপ্যাক্ট স্কোর: {r.impact_score}/100\n\n{hashtags}"
                        else:
                            msg = f"📰 <a href='{r.link}'><b>{safe_title}</b></a>\n\nউৎস: {r.source}"
                        
                        for setting in active_notifications:
                            if voice_path:
                                await NotificationService.send_voice(db, setting.user_id, voice_path, caption=msg, parse_mode="HTML")
                            else:
                                await NotificationService.send_message(db, setting.user_id, msg, parse_mode="HTML")
                                
                        # Cleanup temp audio
                        if voice_path:
                            try:
                                import os
                                if os.path.exists(voice_path): os.remove(voice_path)
                            except:
                                pass
                
                logger.info(f"✅ Market News Fetch Completed. {count} new items.")
                return count
            finally:
                db.close()
                
        except Exception as e:
            print(f"❌ Market News Fetch Failed: {e}")
            raise e

        
    def analyze_with_vader(self, text: str) -> dict:
        """
        Analyze text using VADER and return normalized score (0-100).
        """
        vs = self.vader.polarity_scores(text)
        compound = vs['compound']
        normalized_score = (compound + 1) * 50
        label = 'Positive' if compound > 0.05 else 'Negative' if compound < -0.05 else 'Neutral'
        return {'label': label, 'score': normalized_score}

    async def analyze_sentiment(self, text, keyword_weights=None, model: str = "vader"):
        """
        Analyze text and return a result dict.
        Supports keyword boosting for specific terms (e.g., 'Moon', 'Rekt').
        CPU-bound tasks (FinBERT/VADER) are offloaded to a thread.
        """
        if not text: return {'label': 'Neutral', 'score': 50.0}
        
        # Define the synchronous prediction logic
        def _predict_sync(text_input, curr_model):
            if curr_model == "finbert":
                result_model = get_pipeline()
                if result_model:
                    try:
                        # FinBERT returns [{'label': 'positive', 'score': 0.9}]
                        # Truncate to 512 tokens to avoid errors
                        result = result_model(str(text_input)[:512])[0]
                        label = result['label'].lower() # 'positive', 'negative', 'neutral'
                        confidence = result['score']
                        
                        # Normalize FinBERT score to 0-100
                        # FinBERT gives confidence 0-1.
                        # We map: Positive -> 50 + (conf * 50)
                        #         Negative -> 50 - (conf * 50)
                        #         Neutral  -> 50
                        # Wait, this is a bit heuristic. Prompt says explicitly for VADER.
                        # For FinBERT, let's keep it consistent 0-100.
                        
                        score_val = 50.0
                        if label == 'positive':
                            score_val = 50 + (confidence * 50)
                        elif label == 'negative':
                            score_val = 50 - (confidence * 50)
                        else: 
                            score_val = 50.0 # Neutral is 50
                            
                        # Capitalize label for consistency
                        final_label = label.capitalize()
                        return {'label': final_label, 'score': score_val}
                    except Exception as e:
                        print(f"FinBERT Error: {e}. Falling back to VADER.")
                        # Fallback
                        return self.analyze_with_vader(text_input)
                else:
                    return self.analyze_with_vader(text_input)
            else:
                return self.analyze_with_vader(text_input)

        # Offload to thread
        result = await asyncio.to_thread(_predict_sync, text, model)
        
        # Keyword Boosting Logic (affects score only)
        # We process this on the 0-100 scale now?
        # Original logic was on -1 to 1.
        # Let's adjust boosting to working on 0-100 scale (e.g. +10, -10)
        
        final_score = result['score']
        
        if keyword_weights:
            lower_text = str(text).lower()
            for word, weight in keyword_weights.items():
                if word.lower() in lower_text:
                    # Weight was likely for -1 to 1 scale (e.g. 0.1). 
                    # Multiply by 50 to match 0-100 scale approximately.
                    final_score += (weight * 50)
                    
            # Clamp result between 0 and 100
            final_score = max(0.0, min(100.0, final_score))
            result['score'] = final_score
            
            # Recalculate label if score shifted significantly? 
            # Let's keep label simple based on score
            if final_score > 60: result['label'] = 'Positive'
            elif final_score < 40: result['label'] = 'Negative'
            else: result['label'] = 'Neutral'
            
        return result

    async def fetch_news(self, model: str = "vader"):
        """Fetch latest news with Fallback"""
        try:
            # Main query
            data = await self.fetch_google_news_data(query="Cryptocurrency Bitcoin market", period='1d', model=model)
            if not data:
                print("⚠️ Warning: Empty news data, using fallback.")
                return self.get_mock_news()
            return data
        except Exception as e:
            print(f"❌ News Fetch Error: {e}. Using fallback data.")
            return self.get_mock_news()


    async def fetch_historical_sentiment(self, days=7):
        try:
            # Fetching real historical sentiment using Alternative.me Crypto Fear & Greed Index
            # This replaces the need for expensive historical RSS parsing or database accumulation.
            return self._get_real_historical_data(days)

        except Exception as e:
            print(f"Historical Sentiment Error: {e}")
            # Fallback will be handled inside _get_real_historical_data gracefully
            return self._get_real_historical_data(days)

    async def _fetch_rss_news(self, query, language='en', country='US', period='1d', model="vader"):
        """Fetch news using Google News RSS Feed (More reliable than GNews lib)"""
        
        # Encode query
        encoded_query = urllib.parse.quote(query)
        
        # Construct RSS URL
        # ceid logic: country:US -> US:en
        # usually ceid={country}:{language}
        ceid = f"{country}:{language}"
        url = f"https://news.google.com/rss/search?q={encoded_query}+when:{period}&hl={language}-{country}&gl={country}&ceid={ceid}"
        
        def parse_feed():
            return feedparser.parse(url)

        feed = await asyncio.to_thread(parse_feed)
        
        results = []
        translator = GoogleTranslator(source='auto', target='en') if language != 'en' else None

        for entry in feed.entries[:50]: # Limit to 50 items
            title = entry.title
            link = entry.link
            published = entry.published
            source = entry.source.title if hasattr(entry, 'source') else 'Google News'
            
            # Translate if needed using TranslationService
            title_en = translation_service.detect_and_translate(title)
            is_translated = title_en != title

            # --- DEDUPLICATION CHECK ---
            # Use link or title if link is empty/generic
            unique_id = link if link else title
            # Include model in hash to allow re-analysis if model changes?
            # Or just accept cached result? 
            # Prompt implies "Control Speed vs Accuracy". 
            # If I stick to cache, switching model won't change speed/result if cached.
            # Let's append model to hash key OR just use different keys.
            news_hash = self._generate_news_hash(unique_id + model) 
            
            cached_item = await self._get_processed_news(news_hash)
            if cached_item:
                # HOTFIX: If cached item lacks impact data (from old code), add it now
                if 'impact_level' not in cached_item:
                    # We might need title_en here. Cached item has 'translated_content' or 'content'
                    text_for_impact = cached_item.get('translated_content') or cached_item.get('content')
                    # Use existing score if available, else 0
                    existing_score = cached_item.get('score', 0)
                    
                    impact_data = impact_analysis_service.calculate_impact(text_for_impact, existing_score)
                    cached_item['impact_level'] = impact_data['level']
                    cached_item['impact_score'] = impact_data['score']
                    
                    # Optionally update redis, but just returning fixed data is enough for UI
                    
                results.append(cached_item)
                continue
                
            analysis_result = await self.analyze_sentiment(title_en, model=model)
            score = analysis_result['score']
            label = analysis_result['label']
            
            # --- NEW STABLE ID ---
            # abs(hash(title)) is unstable in Python 3.3+ (hash randomization)
            # Using SHA256 of the link or title for persistence.
            item_id_source = link if link else title
            stable_id = hashlib.sha256(item_id_source.encode('utf-8')).hexdigest()[:12]
            
            news_item = {
                "id": f"gn_{stable_id}",
                "source": source,
                "content": title, 
                "translated_content": title_en if is_translated else None,
                "is_translated": is_translated,
                "url": link,
                "sentiment": label,
                "score": score, # Storing the numeric score too
                "timestamp": published,
                "type": "news",
                "region": country
            }

            # --- ONE-SHOT IMPACT ANALYSIS (Added for Frontend Widget) ---
            # Calculate impact immediately so frontend gets it even without background job
            impact_data = impact_analysis_service.calculate_impact(title_en, score)
            news_item['impact_level'] = impact_data['level']
            news_item['impact_score'] = impact_data['score']
            
            # Cache the result
            await self._mark_news_as_processed(news_hash, news_item)
            
            results.append(news_item)
            
        return results

    async def fetch_google_news_data(self, query='Cryptocurrency Bitcoin', period='1d', language='en', country='US', model="vader"):
        try:
            return await self._fetch_rss_news(query, language, country, period, model)
        except Exception as e:
            print(f"Google News RSS Fetch Failed ({language}-{country}): {e}")
            return []

    async def fetch_global_sentiment(self):
        """Fetch news from key crypto markets: US, China, Korea"""
        regions = [
            {'lang': 'en', 'country': 'US'},
            {'lang': 'zh-CN', 'country': 'CN'},
            {'lang': 'ko', 'country': 'KR'}
        ]
        
        all_news = []
        for reg in regions:
            # We add 'crypto' to query to ensure relevance in other languages
            q = 'Cryptocurrency' if reg['lang'] == 'en' else '加密货币' if reg['lang'] == 'zh-CN' else '암호화폐'
            news = await self.fetch_google_news_data(query=q, period='1d', language=reg['lang'], country=reg['country'])
            all_news.extend(news)
            
        random.shuffle(all_news)
        return all_news[:50]

    async def fetch_fear_greed_index(self):
        try:
            async with httpx.AsyncClient() as client:
                timeout = getattr(settings, "DEFAULT_HTTP_TIMEOUT", 15.0)
                response = await client.get("https://api.alternative.me/fng/", params={"limit": 1}, timeout=timeout)
                if response.status_code == 200:
                    return response.json()['data'][0]
                return {"value": "50", "value_classification": "Neutral"}
        except:
            return {"value": "50", "value_classification": "Neutral"}

    async def fetch_social_sentiment(self, asset: str):
        """
        Fetch social sentiment from Reddit and Twitter (Mock for now).
        TODO: Integrate real APIs (Reddit PRAW, Twitter API v2).
        """
        try:
            # Simulate network delay associated with API calls
            await asyncio.sleep(0.5)
            
            mock_data = [
                {
                    'source': 'Reddit',
                    'text': f'{asset} is looking strong on the daily chart! Bullish momentum building.',
                    'sentiment_score': 0.8
                },
                {
                    'source': 'Reddit', 
                    'text': f'Not sure about {asset} right now, classic bear trap setup.',
                    'sentiment_score': -0.4
                },
                {
                    'source': 'Twitter',
                    'text': f'Just bought more #{asset}! 🚀 #ToTheMoon',
                    'sentiment_score': 0.9
                },
                 {
                    'source': 'Twitter',
                    'text': f'Market looking shaky, sold my {asset} bag.',
                    'sentiment_score': -0.3
                }
            ]
            return mock_data
            
        except Exception as e:
            print(f"❌ Social Sentiment Fetch Error: {e}")
            return []

    # --- MOCK DATA GENERATORS (For when API fails) ---
    
    def get_mock_news(self):
        """Returns dummy news when connection fails"""
        return [
            {
                "id": "mock_1",
                "source": "CryptoDaily (Mock)",
                "content": "Bitcoin shows resilience above $95k despite global uncertainty.",
                "url": "#",
                "sentiment": "Positive",
                "timestamp": datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S GMT"),
                "type": "news"
            },
            {
                "id": "mock_2",
                "source": "MarketWatch (Mock)",
                "content": "Ethereum network activity surges to new highs.",
                "url": "#",
                "sentiment": "Positive",
                "timestamp": datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S GMT"),
                "type": "news"
            },
            {
                "id": "mock_3",
                "source": "CoinDesk (Mock)",
                "content": "Analysts warn of potential short-term volatility in altcoins.",
                "url": "#",
                "sentiment": "Negative",
                "timestamp": datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S GMT"),
                "type": "news"
            }
        ]
            
    # Fetch real historical sentiment using Fear & Greed Index
    def _get_real_historical_data(self, days):
        """Returns authentic historical sentiment for charts via alternative.me"""
        try:
            url = f"https://api.alternative.me/fng/?limit={days}"
            response = requests.get(url, timeout=5)
            response.raise_for_status()
            data = response.json().get('data', [])
            
            # Map alternative.me (0-100) back to our (-1 to 1) score
            dates = []
            scores = []
            
            for item in data:
                # Convert string timestamp to proper datetime
                ts = int(item['timestamp'])
                dt = pd.to_datetime(ts, unit='s', utc=True)
                dates.append(dt)
                
                # Convert 0-100 to -1.0 to 1.0 logic
                val = float(item['value'])
                normalized_score = (val / 50.0) - 1.0
                scores.append(normalized_score)
                
            # Reverse so it's chronologically ascending for the chart
            df = pd.DataFrame(scores, index=dates, columns=['score'])
            df = df.sort_index()
            
            # If the index doesn't have enough data points (e.g., API glitch), forward fill it to be safe
            if df.empty:
                raise ValueError("Empty data from API")
                
            return df
            
        except Exception as e:
            print(f"Error fetching historical sentiment: {e}")
            # Ultimate fallback if Alternative.me completely dies
            dates = pd.date_range(end=datetime.now(timezone.utc), periods=days, freq='D')
            data = [0.0 for _ in range(len(dates))]
            return pd.DataFrame(data, index=dates, columns=['score'])

news_service = NewsService()
