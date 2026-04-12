import ccxt.async_support as ccxt
import os
import ccxt as ccxt_sync 
from sqlalchemy.orm import Session
from sqlalchemy import desc, delete
from sqlalchemy.dialects.postgresql import insert # ✅ এই ইমপোর্টটি খুব গুরুত্বপূর্ণ
from datetime import datetime, timedelta
from app import models
from app.constants import VALID_TIMEFRAMES 
import asyncio
from tqdm import tqdm
from app.services.websocket_manager import manager
from fastapi.concurrency import run_in_threadpool
from app.core.cache import cache
from fastapi import HTTPException
from app.core.config import settings
import pandas as pd
import pandas_ta as ta
import numpy as np
from app.services.news_service import news_service
from app.services.sentiment_service import sentiment_service

class MarketService:
    def __init__(self):
        self._markets_cache = {} 
        self._timeframes_cache = {} 

    def prune_old_sentiment_data(self, db: Session, days: int = 30) -> int:
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        # Construct delete statement: DELETE FROM sentiment_history WHERE timestamp < cutoff
        stmt = delete(models.SentimentHistory).where(models.SentimentHistory.timestamp < cutoff_date)
        result = db.execute(stmt)
        db.commit()
        return result.rowcount # Return number of deleted rows

    async def _execute_with_retry(self, coro_func):
        """
        Executes a coroutine function with retry logic and exponential backoff.
        Args:
            coro_func: A callable that returns an awaitable (coroutine).
        """
        for i in range(3):
            try:
                return await coro_func()
            except (ccxt.NetworkError, ccxt.RequestTimeout) as e:
                if i == 2:  # Last attempt
                    raise e
                print(f"Attempt {i+1} failed: {e}. Retrying in {i+1}s...")
                await asyncio.sleep(1 * (i + 1))
        return None # Should not be reached due to raise

    async def get_exchange_timeframes(self, exchange_id: str):
        # 1. Check cache
        if exchange_id in self._timeframes_cache:
            return self._timeframes_cache[exchange_id]

        try:
            if hasattr(ccxt, exchange_id):
                exchange_class = getattr(ccxt, exchange_id)
                exchange = exchange_class()
                
                # Load markets to populate timeframes
                await exchange.load_markets()
                
                if exchange.timeframes:
                    timeframes = list(exchange.timeframes.keys())
                    self._timeframes_cache[exchange_id] = timeframes
                    await exchange.close()
                    return timeframes
                
                await exchange.close()
        except Exception as e:
            print(f"Error fetching timeframes for {exchange_id}: {e}")
        
        # Fallback timeframes
        return ["1m", "5m", "15m", "1h", "4h", "1d"] 

    def timeframe_to_ms(self, timeframe):
        seconds = 0
        if timeframe.endswith('s'): seconds = int(timeframe[:-1])
        elif timeframe.endswith('m'): seconds = int(timeframe[:-1]) * 60
        elif timeframe.endswith('h'): seconds = int(timeframe[:-1]) * 3600
        elif timeframe.endswith('d'): seconds = int(timeframe[:-1]) * 86400
        elif timeframe.endswith('w'): seconds = int(timeframe[:-1]) * 604800
        elif timeframe.endswith('M'): seconds = int(timeframe[:-1]) * 2592000
        return seconds * 1000

    async def fetch_and_store_candles(self, db: Session, symbol: str, timeframe: str, start_date: str = None, end_date: str = None, limit: int = 1000):
        # 1. Exchange Setup
        exchange_config = {
            'enableRateLimit': True, 'options': {'adjustForTimeDifference': True},
            'userAgent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        
        # Force public endpoint for Binance to avoid strict Timestamp sync issues in Docker/WSL
        # if settings.BINANCE_API_KEY:
        #     exchange_config['apiKey'] = settings.BINANCE_API_KEY
        #     exchange_config['secret'] = settings.BINANCE_SECRET_KEY
            
        exchange = ccxt.binance(exchange_config)
        
        # ✅ সেফ সিম্বল জেনারেট করা (স্ল্যাশ ছাড়া) - ফ্রন্টএন্ডের সাথে মিল রাখার জন্য
        safe_symbol = symbol.replace('/', '') 

        try:
            # 2. Check if timeframe is supported
            await exchange.load_markets()
            if timeframe not in exchange.timeframes:
                return {
                    "status": "error", 
                    "message": f"Binance does not support '{timeframe}'. Please sync '15m' or '1m' instead."
                }

            # টাইম রেঞ্জ ক্যালকুলেশন
            since_ts = None
            end_ts = int(datetime.utcnow().timestamp() * 1000)

            if start_date:
                start_dt = datetime.strptime(start_date, "%Y-%m-%d")
                since_ts = int(start_dt.timestamp() * 1000)
            
            if end_date:
                end_dt = datetime.strptime(end_date, "%Y-%m-%d")
                end_dt = end_dt.replace(hour=23, minute=59, second=59)
                end_ts = int(end_dt.timestamp() * 1000)

            # 3. Latest Data (No Loop if start_date is not provided)
            if not since_ts:
                 try:
                    # শুরুতেই একটা ০% মেসেজ পাঠানো
                    await self._broadcast_progress(symbol, safe_symbol, 0, "Fetching latest data...")

                    ohlcv = await exchange.fetch_ohlcv(symbol, timeframe, limit=limit)
                    count = await run_in_threadpool(self._save_candles, db, ohlcv, symbol, timeframe)
                    
                    # শেষ হলে ১০০% মেসেজ পাঠানো
                    await self._broadcast_progress(symbol, safe_symbol, 100, "Latest data synced!")
                    
                    return {"status": "success", "message": "Latest data synced", "count": count}
                 except Exception as e:
                     return {"status": "error", "message": f"Fetch Error: {str(e)}"}

            # 4. Historical Data Loop with Progress Bar
            total_saved = 0
            tf_ms = self.timeframe_to_ms(timeframe)
            current_since = since_ts
            
            # মোট কত সময় বাকি তা হিসাব করা (প্রোগ্রেস এর জন্য)
            total_duration = end_ts - since_ts
            
            # শুরুতেই একটা ০% মেসেজ পাঠানো যাতে UI রেডি হয়
            await self._broadcast_progress(symbol, safe_symbol, 0, f"Starting sync for {symbol}...")

            with tqdm(total=total_duration, desc=f"Syncing {symbol}", unit="ms") as pbar:
                while current_since < end_ts:
                    try:
                        ohlcv = await exchange.fetch_ohlcv(symbol, timeframe, limit=1000, since=current_since)
                    except Exception as e:
                        print(f"Error fetching batch: {e}")
                        break 

                    if not ohlcv:
                        break
                    
                    filtered_ohlcv = [c for c in ohlcv if c[0] <= end_ts]
                    saved_count = await run_in_threadpool(self._save_candles, db, filtered_ohlcv, symbol, timeframe)
                    total_saved += saved_count
                    
                    if not filtered_ohlcv:
                        break

                    last_time = filtered_ohlcv[-1][0]
                    
                    # প্রোগ্রেস ক্যালকুলেশন
                    progress_percent = int(((last_time - since_ts) / total_duration) * 100)
                    progress_percent = min(100, max(0, progress_percent))

                    # TQDM আপডেট
                    pbar.update(last_time - current_since)

                    # ✅ WebSocket মেসেজ পাঠানো (সব চ্যানেলে)
                    await self._broadcast_progress(symbol, safe_symbol, progress_percent, f"Syncing {symbol}... {progress_percent}%")

                    # পরবর্তী লুপের জন্য সময় সেট করা
                    if last_time == current_since:
                        current_since += tf_ms
                    else:
                        current_since = last_time + tf_ms
                    
                    # ইভেন্ট লুপ ব্লক না করার জন্য ছোট বিরতি
                    await asyncio.sleep(0.1)

            # ফাইনাল ১০০% মেসেজ পাঠানো
            await self._broadcast_progress(symbol, safe_symbol, 100, "Sync Completed Successfully!")

            return {
                "status": "success", 
                "new_candles_stored": total_saved, 
                "range": f"{start_date} to {end_date or 'Now'}",
            }

        except Exception as e:
            print(f"Sync Error: {e}")
            # এরর মেসেজ পাঠানো
            await self._broadcast_progress(symbol, safe_symbol, 0, f"Sync Failed: {str(e)}")
            return {"status": "error", "message": str(e)}
        finally:
            await exchange.close()

    @cache(expire=10)
    async def get_real_time_sentiment_metrics(self, symbol: str) -> dict:
        exchange = ccxt.binance({
            'timeout': 10000, # 10 seconds
            'enableRateLimit': True, 'options': {'adjustForTimeDifference': True},
            'userAgent': 'CosmoQuant/1.0'
        })
        try:
            # 1. Fetch Ticker for Price and immediate Volume
            ticker = await self._execute_with_retry(lambda: exchange.fetch_ticker(symbol))
            current_price = float(ticker['last'])
            
            # 2. Fetch OHLCV for Volume Anomaly Analysis (1h timeframe, limit=50)
            # 2. Fetch OHLCV for Volume Anomaly Analysis (1h timeframe, limit=50)
            # We need enough history for SMA20
            ohlcv = await self._execute_with_retry(lambda: exchange.fetch_ohlcv(symbol, '1h', limit=50))
            
            # Default values
            smart_money_score = 50.0
            volume_spike_ratio = 1.0
            price_change_pct = 0.0
            
            if ohlcv and len(ohlcv) >= 20:
                # OHLCV structure: [timestamp, open, high, low, close, volume]
                # Extract volumes
                volumes = [c[5] for c in ohlcv]
                
                # Current candle might be incomplete, let's look at the last closed candle for analysis 
                # or use current if meaningful. 
                # NOTE: For "Real Time" Feel, we usually look at the very latest entry even if forming.
                current_vol = volumes[-1] 
                
                # Avg Volume (last 20 excluding current if we want strict SMA, 
                # but including it is fine for "current trend"). 
                # Let's take previous 20 to compare current against historical norm.
                avg_vol = sum(volumes[-21:-1]) / 20 if len(volumes) > 20 else sum(volumes[:-1]) / len(volumes[:-1])
                
                if avg_vol > 0:
                    volume_spike_ratio = current_vol / avg_vol
                
                # Price Momentum (Current Candle Change)
                open_price = ohlcv[-1][1]
                close_price = ohlcv[-1][4]
                if open_price > 0:
                    price_change_pct = (close_price - open_price) / open_price
                
                # --- SMART MONEY LOGIC (Refined for Sensitivity) ---
                # 1. Accumulation: High Volume + Price UP (Whales buying)
                # Lowered threshold to 1.2 to capture more activity
                if volume_spike_ratio > 1.2 and price_change_pct > 0:
                    # Score 60-100 based on intensity
                    base_score = 60.0
                    # Intensity: (1.2 to 2.0 ratio) -> adds 0 to 40 points
                    intensity = min(40.0, (volume_spike_ratio - 1.2) * 50) 
                    smart_money_score = base_score + intensity
                    
                # 2. Distribution: High Volume + Price DOWN (Whales selling)
                elif volume_spike_ratio > 1.2 and price_change_pct < 0:
                    # Score 0-40 based on intensity
                    base_score = 40.0
                    intensity = min(40.0, (volume_spike_ratio - 1.2) * 50)
                    smart_money_score = max(0.0, base_score - intensity)
                    
                # 3. Neutral/Retail churn (Normal Activity)
                else:
                    # Allow minor fluctuations around 50 based on price action and volume
                    # Price Change Pct is usually small (e.g., 0.005 for 0.5%)
                    # multiplied by 500 gives +/- 2.5 points
                    momentum_drift = price_change_pct * 500
                    
                    # Volume drift: if volume is slightly higher/lower than avg
                    # ratio 0.8 to 1.2 -> -5 to +5 points
                    volume_drift = (volume_spike_ratio - 1.0) * 20
                    
                    smart_money_score = 50.0 + momentum_drift + volume_drift
                    # Constrain to 40-60 range for neutral
                    smart_money_score = max(40.0, min(60.0, smart_money_score))

            # 3. Exchange Netflow (Buy vs Sell Volume from recent Trades)
            # This is a good proxy for "Flow"

            trades = await self._execute_with_retry(lambda: exchange.fetch_trades(symbol, limit=500))
            buy_vol = 0.0
            sell_vol = 0.0
            
            for trade in trades:
                # cost = amount * price (Quote Volume)
                trade_cost = float(trade.get('cost', 0.0))
                if trade_cost == 0:
                     trade_cost = float(trade['amount']) * float(trade['price'])
                
                if trade['side'] == 'buy':
                    buy_vol += trade_cost
                else:
                    sell_vol += trade_cost
            
            netflow = buy_vol - sell_vol
            
            return {
                "smart_money_score": round(smart_money_score, 2),
                "exchange_netflow": round(netflow, 2),
                "price": current_price,
                "retail_sentiment": 50.0 # Placeholder or could be derived from social volume if we had it here
            }


        except (ccxt.NetworkError, ccxt.RequestTimeout, HTTPException) as e:
            # If it's already an HTTPException, re-raise it
            if isinstance(e, HTTPException):
                raise e
            
            print(f"Market data unavailable temporarily: {e}")
            raise HTTPException(status_code=503, detail="Market data unavailable temporarily.")

        except Exception as e:
            print(f"Error fetching real-time metrics: {e}")
            # Fallback for other unexpected errors
            return {
                "smart_money_score": 50.0,
                "exchange_netflow": 0.0,
                "price": 0.0,
                "retail_sentiment": 50.0
            }
        finally:
            await exchange.close()

    def get_sentiment_history(self, db: Session, symbol: str, limit: int = 100) -> list[dict]:
        """
        Fetches historical sentiment data from the database.
        Returns the last N records, sorted chronologically.
        """
        try:
            # Query DB: Select * from SentimentHistory where symbol=symbol
            history = db.query(models.SentimentHistory).filter(
                models.SentimentHistory.symbol == symbol
            ).order_by(desc(models.SentimentHistory.timestamp)).limit(limit).all()

            if not history:
                return []

            # Convert to list of dicts
            result = []
            for record in history:
                result.append({
                    "id": record.id,
                    "symbol": record.symbol,
                    "price": record.price,
                    "smart_money_score": record.smart_money_score,
                    "retail_score": record.retail_score,
                    "news_sentiment": record.news_sentiment,
                    "timestamp": record.timestamp
                })
            
            # Reverse to show chronological order (Oldest -> Newest)
            return result[::-1]
            
        except Exception as e:
            print(f"Error fetching sentiment history: {e}")
            return []

    # ✅ হেল্পার মেথড: সব পসিবল চ্যানেলে ব্রডকাস্ট করার জন্য
    async def _broadcast_progress(self, symbol: str, safe_symbol: str, percent: int, status_msg: str):
        message = {
            "type": "sync_progress",
            "percent": percent,
            "status": status_msg
        }
        # ১. জেনারেল চ্যানেলে (যদি কেউ থাকে)
        await manager.broadcast_to_symbol("general", message)
        # ২. অরিজিনাল সিম্বল (যেমন: 'BTC/USDT')
        await manager.broadcast_to_symbol(symbol, message)
        # ৩. সেফ সিম্বল (যেমন: 'BTCUSDT') - এটিই ফ্রন্টএন্ড সাধারণত ব্যবহার করে
        if safe_symbol != symbol:
            await manager.broadcast_to_symbol(safe_symbol, message)


    # ✅ আপডেটেড _save_candles মেথড (বাল্ক ইনসার্ট)
    def _save_candles(self, db: Session, ohlcv: list, symbol: str, timeframe: str):
        if not ohlcv:
            return 0
            
        candles_data = []
        for candle in ohlcv:
            timestamp_ms = candle[0]
            dt_object = datetime.fromtimestamp(timestamp_ms / 1000.0)
            
            candles_data.append({
                "exchange": "binance",
                "symbol": symbol,
                "timeframe": timeframe,
                "timestamp": dt_object,
                "open": candle[1],
                "high": candle[2],
                "low": candle[3],
                "close": candle[4],
                "volume": candle[5]
            })

        if candles_data:
            # PostgreSQL Efficient Upsert (DO NOTHING on Conflict)
            stmt = insert(models.MarketData).values(candles_data)
            
            # প্রাইমারি কি (exchange, symbol, timeframe, timestamp) মিলে গেলে ইগনোর করবে
            stmt = stmt.on_conflict_do_nothing(
                index_elements=['exchange', 'symbol', 'timeframe', 'timestamp']
            )
            
            try:
                db.execute(stmt)
                db.commit()
            except Exception as e:
                db.rollback()
                print(f"Bulk Insert Error: {e}")
                return 0
        
        return len(candles_data)

    async def get_exchange_markets(self, exchange_id: str):
        if exchange_id in self._markets_cache:
            return self._markets_cache[exchange_id]

        try:
            if hasattr(ccxt, exchange_id):
                exchange_class = getattr(ccxt, exchange_id)
                
                # ১. বেসিক কনফিগারেশন
                config = {
                    'enableRateLimit': True, 'options': {'adjustForTimeDifference': True},
                    'userAgent': 'CosmoQuant/1.0',  # User Agent সরল করা হলো
                    'options': {'adjustForTimeDifference': True}, # ✅ Fix for Timestamp recvWindow errors
                }

                # ২. .env থেকে API Key চেক করা (Via Settings for known keys, fallback to env for others if needed)
                env_api_key = None
                env_secret = None
                
                if exchange_id == 'binance':
                    env_api_key = settings.BINANCE_API_KEY
                    env_secret = settings.BINANCE_SECRET_KEY
                else:
                    # Fallback for other exchanges not yet in Settings explicitly
                    env_api_key = os.getenv(f"{exchange_id.upper()}_API_KEY")
                    env_secret = os.getenv(f"{exchange_id.upper()}_SECRET")
                
                # Skip API keys for fetching public markets (Binance recvWindow fix)
                if env_api_key and env_secret and exchange_id != 'binance':
                    config['apiKey'] = env_api_key
                    config['secret'] = env_secret

                # ৩. এক্সচেঞ্জ ইনিশিয়ালাইজ করা
                try:
                    temp_exchange = exchange_class(config)
                    
                    # ✅ ULTIMATE FIX: সরাসরি অবজেক্টের URL প্রপার্টি মডিফাই করা
                    if exchange_id == 'alpaca' and env_api_key and env_api_key.startswith('PK'):
                        print(f"⚠️ FORCE SWITCH: Switching Alpaca to Paper Trading Mode...")
                        
                        # স্যান্ডবক্স মোড সেট করার চেষ্টা
                        temp_exchange.set_sandbox_mode(True)
                        
                        # ডাবল চেক: যদি set_sandbox_mode কাজ না করে, তবে ম্যানুয়ালি URL বসানো
                        if 'test' in temp_exchange.urls:
                            # টেস্ট URL গুলো মেইন API স্লটে কপি করা
                            temp_exchange.urls['api'] = temp_exchange.urls['test'].copy()
                        
                        # ডাটা URL এবং ট্রেডার URL ম্যানুয়ালি নিশ্চিত করা
                        # কারণ অনেক সময় স্যান্ডবক্স ডাটা URL (data.sandbox...) কাজ করে না
                        if isinstance(temp_exchange.urls['api'], dict):
                            temp_exchange.urls['api']['market'] = 'https://data.alpaca.markets'
                            temp_exchange.urls['api']['trader'] = 'https://paper-api.alpaca.markets'
                            
                        print(f"ℹ️ Active Alpaca URLs: {temp_exchange.urls['api']}")

                except Exception as e:
                    print(f"Skipping {exchange_id}: Init failed. Error: {e}")
                    return []

                # ৪. মার্কেট লোড করার চেষ্টা
                try:
                    markets = await temp_exchange.load_markets()
                    symbols = list(markets.keys())
                    
                    self._markets_cache[exchange_id] = symbols
                    print(f"✅ Successfully loaded {len(symbols)} markets for {exchange_id}")
                    return symbols
                except Exception as e:
                    print(f"❌ Could not load markets for {exchange_id}: {e}")
                    # এরর এর বিস্তারিত প্রিন্ট করা
                    return []
                finally:
                    if temp_exchange:
                        await temp_exchange.close()
            return []
        except Exception as e:
            print(f"Critical Error fetching {exchange_id}: {e}")
            return []

    def get_supported_exchanges(self):
        # ccxt লাইব্রেরিতে থাকা সব এক্সচেঞ্জ রিটার্ন করবে
        return ccxt.exchanges

    async def get_exchange_credentials_info(self):
        """
        Returns a dictionary of supported exchanges and their required credentials fields.
        Useful for dynamic frontend forms.
        """
        exchange_info = {}
        # A curated list of popular exchanges to check, or we could loop through all
        # Loop through a subset to save time/resources on instantiation if checking all is too heavy
        # For now, let's target the major ones or allow checking all if needed.
        # Ideally, we should cache this result.
        
        target_exchanges = ['binance', 'kucoin', 'okx', 'bybit', 'kraken', 'coinbasepro', 'gateio', 'huobi', 'mexc']
        
        for exchange_id in target_exchanges:
            try:
                if hasattr(ccxt, exchange_id):
                    exchange_class = getattr(ccxt, exchange_id)
                    # Instantiate without keys just to check requirements
                    exchange = exchange_class()
                    
                    required_creds = exchange.requiredCredentials
                    
                    fields = []
                    if required_creds.get('apiKey'): fields.append('apiKey')
                    if required_creds.get('secret'): fields.append('secret')
                    if required_creds.get('password'): fields.append('passphrase')
                    if required_creds.get('uid'): fields.append('uid')
                    
                    exchange_info[exchange_id] = {
                        "name": exchange.name,
                        "fields": fields
                    }
                    
                    await exchange.close()
            except Exception as e:
                print(f"Error checking credentials for {exchange_id}: {e}")
                continue
                
        return exchange_info
            
    def get_candles_from_db(self, db: Session, symbol: str, timeframe: str, start_date: str = None, end_date: str = None):
        query = db.query(
            models.MarketData.timestamp,
            models.MarketData.open,
            models.MarketData.high,
            models.MarketData.low,
            models.MarketData.close,
            models.MarketData.volume
        ).filter(
            models.MarketData.symbol == symbol,
            models.MarketData.timeframe == timeframe
        )

        if start_date:
            try:
                start_dt = datetime.strptime(start_date, "%Y-%m-%d")
                query = query.filter(models.MarketData.timestamp >= start_dt)
            except: pass
        if end_date:
             try:
                end_dt = datetime.strptime(end_date, "%Y-%m-%d")
                end_dt = end_dt.replace(hour=23, minute=59, second=59)
                query = query.filter(models.MarketData.timestamp <= end_dt)
             except: pass
             
        return query.order_by(models.MarketData.timestamp.asc()).all()

    def cleanup_old_data(self, db: Session, retention_rules: dict = None):
        if not retention_rules:
            retention_rules = {
                '1s': 7, '1m': 30, '1h': 365, '1d': 365*5
            }
        
        total_deleted = 0
        for tf, days in retention_rules.items():
            cutoff_date = datetime.utcnow() - timedelta(days=days)
            deleted = db.query(models.MarketData).filter(
                models.MarketData.timeframe == tf,
                models.MarketData.timestamp < cutoff_date
            ).delete(synchronize_session=False)
            if deleted > 0:
                total_deleted += deleted
        db.commit()
        return total_deleted

    async def get_composite_sentiment(self, symbol: str, model: str = "vader") -> dict:
        """
        Aggregates Real-Time Market Metrics & News Sentiment.
        Orchestrates calls to internal methods and external services.
        """
        try:
            # 1. Get Real-Time Metrics (Smart Money, Netflow)
            rt_metrics = await self.get_real_time_sentiment_metrics(symbol)
            
            # 2. Get News Sentiment (Latest)
            # We fetch generic news and calculate average sentiment
            news_items = await news_service.fetch_google_news_data(query=f"{symbol} crypto news", period='1d', model=model)
            
            # Calculate simple average sentiment from news items
            news_score = 0
            if news_items:
                score_map = {"Positive": 0.8, "Neutral": 0, "Negative": -0.8}
                total = sum(score_map.get(item['sentiment'], 0) for item in news_items)
                news_score = total / len(news_items)
            
            # 3. Aggregate
            response = {
                "symbol": symbol,
                "market_sentiment": {
                    "smart_money_score": rt_metrics.get('smart_money_score', 50),
                    "exchange_netflow": rt_metrics.get('exchange_netflow', 0),
                    "price_momentum": "Bullish" if rt_metrics.get('price', 0) > 0 else "Bearish", 
                },
                "news_sentiment": {
                    "score": round(news_score, 2),
                    "label": "Bullish" if news_score > 0.2 else "Bearish" if news_score < -0.2 else "Neutral",
                    "article_count": len(news_items)
                },
                "composite_score": await sentiment_service.calculate_final_score(
                    (rt_metrics.get('smart_money_score', 50) + ((news_score + 1) * 50)) / 2, 
                    symbol
                ), 
                "timestamp": datetime.utcnow().isoformat()
            }
            
            return response
            
        except Exception as e:
            print(f"Error in get_composite_sentiment: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    async def get_correlation_data(self, symbol: str, period: str) -> list:
        """
        Generates correlation data between Price, News Sentiment, and Smart Money.
        Moved from sentiment.py.
        """
        exchange = ccxt.binance()
        try:
            # Dynamic Timeframe Logic
            if period == "1h":
                timeframe = '1m'
                limit = 60      # 60 * 1m = 1 hour
                days_history = 1 
            elif period == "24h":
                timeframe = '15m'
                limit = 96      # 96 * 15m = 24 hours
                days_history = 1
            elif period == "30d":
                timeframe = '4h'
                limit = 180     # 180 * 4h = 30 days
                days_history = 30
            else: # Default 7d
                timeframe = '1h'
                limit = 168     # 168 * 1h = 7 days
                days_history = 7

            ohlcv = await exchange.fetch_ohlcv(symbol, timeframe, limit=limit)
        except Exception as e:
            print(f"Error fetching OHLCV for correlation: {e}")
            raise HTTPException(status_code=500, detail="Failed to fetch market data")
        finally:
            await exchange.close()

        if not ohlcv:
            return []

        df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms', utc=True)
        df.set_index('timestamp', inplace=True)

        sentiment_df = await news_service.fetch_historical_sentiment(days=days_history)
        merged_df = df.join(sentiment_df, how='left')
        
        merged_df['score'] = merged_df['score'].ffill().fillna(0)
        merged_df['retail_score'] = merged_df['score'] * 0.7 + merged_df['close'].pct_change().rolling(5).mean() * 10
        merged_df['retail_score'] = merged_df['retail_score'].fillna(0)

        merged_df.ta.cmf(append=True)
        # Check if CMF was actually calculated and added
        cmf_col = merged_df.columns[-1]
        
        merged_df['vol_ma'] = merged_df['volume'].rolling(24).mean()
        merged_df['exchange_netflow'] = merged_df['volume'] - merged_df['vol_ma']
        merged_df['exchange_netflow'] = merged_df['exchange_netflow'].fillna(0)

        max_flow = merged_df['exchange_netflow'].abs().max()
        if max_flow == 0: max_flow = 1
        merged_df['netflow_signal'] = merged_df['exchange_netflow'] / max_flow

        if cmf_col not in merged_df.columns:
             merged_df[cmf_col] = 0

        cmf_score = merged_df[cmf_col].rolling(3).mean() * 5 
        cmf_score = cmf_score.clip(-1, 1).fillna(0)
        
        merged_df['smart_money_score'] = (0.4 * cmf_score) + (0.6 * merged_df['netflow_signal'])
        merged_df['smart_money_score'] = merged_df['smart_money_score'].clip(-1, 1).fillna(0)

        # --- REAL-TIME INJECTION ---
        try:
            # We call the internal method
            rt_metrics = await self.get_real_time_sentiment_metrics(symbol)
            
            rt_score_normalized = (rt_metrics['smart_money_score'] - 50) / 50.0
            
            if not merged_df.empty:
                last_idx = merged_df.index[-1]
                merged_df.at[last_idx, 'smart_money_score'] = rt_score_normalized
                merged_df.at[last_idx, 'exchange_netflow'] = rt_metrics['exchange_netflow']
                merged_df.at[last_idx, 'netflow_signal'] = rt_metrics['exchange_netflow'] / max_flow if max_flow else 0
                
        except Exception as e:
            print(f"Real-time update failed in correlation: {e}")

        merged_df['news_score'] = merged_df['score'] 
        
        merged_df['score'] = np.where(
            merged_df['score'] == 0, 
            merged_df['smart_money_score'], 
            (merged_df['score'] + merged_df['smart_money_score']) / 2
        )

        merged_df['momentum'] = merged_df['close'].diff().fillna(0)
        merged_df['social_volume'] = (merged_df['volume'] * merged_df['high'].diff().abs() / 1000).fillna(100).astype(int)

        merged_df = merged_df.fillna(0)
        merged_df = merged_df.replace({np.nan: 0})

        chart_data = []
        for ts, row in merged_df.iterrows():
            smart_val = row['smart_money_score'] if not pd.isna(row['smart_money_score']) else 0
            retail_val = row['retail_score'] if not pd.isna(row['retail_score']) else 0
            
            netflow_val = row['netflow_signal']
            netflow_status = "Accumulating" if netflow_val > 0.2 else "Dumping" if netflow_val < -0.2 else "Neutral"
            
            chart_data.append({
                "time": ts.isoformat(),
                "price": row['close'],
                "score": round(row['score'], 2),
                "retail_score": round(retail_val, 2),        
                "smart_money_score": round(smart_val, 2),
                "netflow_status": netflow_status, 
                "momentum": round(row['momentum'], 2), 
                "social_volume": int(row['social_volume']),
                "volume": row['volume'],
                "divergence": round(smart_val - retail_val, 2)
            })

        return chart_data