import ccxt
import time
import pandas as pd
import pandas_ta as ta
from datetime import datetime
import asyncio
import json
import redis
import websockets # ✅ Added for Real-Time Data
import aiohttp # ✅ For HTTP Negotiation
from sqlalchemy.orm import Session
from app import models
from app.utils import get_redis_client
from app.core.config import settings
import uuid # ✅ For Unique Client Order ID
# ✅ সিকিউরিটি এবং স্ট্র্যাটেজি ইমপোর্ট
from app.core.security import decrypt_key
from app.core.security import decrypt_key
from app.strategies.live_strategies import LiveStrategyFactory
from app.models.trade import Trade

redis_log_client = redis.from_url(settings.REDIS_URL, decode_responses=True)

# ✅ Notification Services
from app.services.notification import NotificationService

class LiveBotEngine:
    def __init__(self, bot: models.Bot, db_session: Session):
        self.bot = bot
        self.db = db_session
        self.symbol = bot.market
        self.timeframe = bot.timeframe
        self.redis = get_redis_client()
        
        # কনফিগারেশন লোড
        self.config = bot.config or {}
        
        # 🟢 NEW: মোড ডিটেকশন (Standard vs Scalp)
        self.mode = self.config.get('mode', 'standard')
        self.scalp_settings = self.config.get('scalp_settings', {})

        # স্ট্র্যাটেজি লোডিং (শুধু স্ট্যান্ডার্ড মোডের জন্য)
        if self.mode == 'standard':
            strategy_name = bot.strategy or "RSI Strategy"
            self.strategy_executor = LiveStrategyFactory.get_strategy(strategy_name, self.config)
        else:
            self.strategy_executor = None # স্ক্যাল্পিং মোডে আলাদা লজিক চলবে
        
        # ট্রেডিং কনফিগারেশন
        self.deployment_target = self.config.get('deploymentTarget', 'Spot').lower()
        if 'future' in self.deployment_target: self.deployment_target = 'future'
        
        self.trade_value = bot.trade_value or 100.0
        self.trade_unit = bot.trade_unit or "QUOTE"
        self.order_type = self.config.get('orderType', 'market').lower()
        
        # Risk Params
        risk_params = self.config.get('riskParams', {})
        self.stop_loss_pct = float(risk_params.get('stopLoss', 0))
        
        # Take Profits (Standard Mode)
        self.take_profits = []
        raw_tps = risk_params.get('takeProfits', [])
        for tp in raw_tps:
            self.take_profits.append({
                "target": float(tp['target']),
                "amount": float(tp['amount']),
                "executed": False
            })
        self.take_profits.sort(key=lambda x: x['target'])
        
        # Trailing Stop
        self.trailing_config = risk_params.get('trailingStop', {})
        self.is_trailing_enabled = self.trailing_config.get('enabled', False)
        self.trailing_callback = float(self.trailing_config.get('callbackRate', 1.0))
        self.highest_price = 0.0

        # Position State
        self.position = { "amount": 0.0, "entry_price": 0.0, "trade_id": None }
        
        # 🟢 NEW: Scalp Order Tracking
        self.active_scalp_order = None # টু ট্র্যাক পেন্ডিং লিমিট অর্ডারস
        
        self._load_state()

        # ✅ EXCHANGE INITIALIZATION WITH SECURITY
        self.exchange = self._initialize_exchange()

        # 🟢 FIX: যদি প্রাইভেট কানেকশন (self.exchange) না থাকে, তবে পাবলিক ডাটা দেখার ব্যবস্থা করা
        self.public_exchange = None
        if not self.exchange:
            try:
                # ডিফল্ট বাইনান্স বা বটের এক্সচেঞ্জ নাম অনুযায়ী পাবলিক ইন্সট্যান্স তৈরি
                exch_name = (bot.exchange or 'binance').lower()
                if hasattr(ccxt, exch_name):
                    self.public_exchange = getattr(ccxt, exch_name)({
                        'enableRateLimit': True, 'options': {'adjustForTimeDifference': True},
                    })
            except Exception as e:
                print(f"Public Exchange Init Error: {e}")

    def _load_state(self):
        """ডাটাবেস চেক করে দেখবে কোনো ওপেন ট্রেড আছে কিনা"""
        try:
            open_trade = self.db.query(Trade).filter(
                Trade.bot_id == self.bot.id,
                Trade.status == "OPEN"
            ).first()

            if open_trade:
                self.position = {
                    "amount": open_trade.quantity,
                    "entry_price": open_trade.entry_price,
                    "trade_id": open_trade.id
                }
                self.highest_price = open_trade.entry_price
                self.log(f"🔄 Restored Open Position: {open_trade.quantity} @ {open_trade.entry_price}", "SYSTEM")
            else:
                self.log("✅ No open positions found. Starting fresh.", "SYSTEM")
                
        except Exception as e:
            self.log(f"⚠️ Error loading state: {e}", "ERROR")

    # ---------------------------------------------------------
    # ✅ ধাপ ১: এনক্রিপ্টেড API Key লোড এবং ডিক্রিপ্ট করা
    # ---------------------------------------------------------
    def _initialize_exchange(self):
        """ডাটাবেস থেকে API Key এনে ডিক্রিপ্ট করে এক্সচেঞ্জ কানেক্ট করা"""
        # 🟢 SIMULATION MODE CHECK
        if self.bot.is_paper_trading:
            self.log("🧪 Simulation Mode Enabled: Skipping Real Exchange Auth.", "SYSTEM")
            return None

        api_key_record = None
        
        # ১. বট কনফিগ থেকে নির্দিষ্ট API Key খোঁজা
        if self.bot.api_key_id:
            api_key_record = self.db.query(models.ApiKey).filter(
                models.ApiKey.id == int(self.bot.api_key_id),
                models.ApiKey.user_id == self.bot.owner_id
            ).first()
        
        # ২. না পেলে, এক্সচেঞ্জ নাম দিয়ে ডিফল্ট Active Key খোঁজা
        if not api_key_record:
            exchange_name = self.bot.exchange or 'binance'
            api_key_record = self.db.query(models.ApiKey).filter(
                models.ApiKey.exchange == exchange_name,
                models.ApiKey.user_id == self.bot.owner_id,
                models.ApiKey.is_enabled == True
            ).first()

        if not api_key_record:
            self.log("⚠️ No Valid API Key Found! Bot is running in SIMULATION mode.", "WARNING")
            return None

        try:
            # 🔐 SECRET KEY DECRYPTION
            decrypted_secret = decrypt_key(api_key_record.secret_key)
            decrypted_api_key = decrypt_key(api_key_record.api_key)
            
            exchange_class = getattr(ccxt, api_key_record.exchange.lower(), ccxt.binance)
            exchange_options = {
                'apiKey': decrypted_api_key,
                'secret': decrypted_secret,
                'enableRateLimit': True,
                'options': {
                    'adjustForTimeDifference': True,
                    'recvWindow': 60000 if api_key_record.exchange.lower() == 'mexc' else 10000,
                    'defaultType': self.deployment_target
                }
            }

            # Optional Passphrase for KuCoin/OKX
            if hasattr(api_key_record, 'passphrase') and api_key_record.passphrase:
                try:
                    exchange_options['password'] = decrypt_key(api_key_record.passphrase)
                except Exception:
                     # Fallback if not encrypted or error
                    exchange_options['password'] = api_key_record.passphrase
            
            self.log(f"✅ Authenticated with {api_key_record.exchange}", "SYSTEM")
            return exchange_class(exchange_options)
            
        except Exception as e:
            self.log(f"❌ Exchange Auth Error: {e}", "ERROR")
            return None

    def log(self, message: str, type: str = "INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{type}] {self.symbol}: {message}", flush=True)

        log_payload = {
            "time": timestamp,
            "type": type,
            "message": message
        }
        
        # ✅ Publish to Multi-Tenant Log Stream (for main.py to pick up)
        # main.py listens to "bot_logs" and forwards based on "channel" field
        
        stream_payload = {
            "channel": f"logs_{self.bot.id}",
            "data": log_payload
        }

        try:
            # 1. Publish to Pub/Sub (Firehose)
            redis_log_client.publish("bot_logs", json.dumps(stream_payload))
            
            # ✅ Directly publish to the specific Bot's Channel for the WebSocket endpoint
            redis_log_client.publish(f"bot_logs:{self.bot.id}", json.dumps(log_payload))
            
            # 2. Store in Redis List for History
            list_key = f"bot_logs_list:{self.bot.id}"
            redis_log_client.rpush(list_key, json.dumps(log_payload))
            redis_log_client.ltrim(list_key, -50, -1) # Keep last 50 logs
            
        except Exception as e:
            print(f"⚠️ Redis Publish Error: {e}")

    # ---------------------------------------------------------
    # ✅ NOTIFICATION HELPER
    # ---------------------------------------------------------
    async def _send_notification(self, message: str):
        """Helper to send Telegram notifications safely."""
        try:
            # We use self.db session which is passed in __init__
            await NotificationService.send_message(self.db, self.bot.owner_id, message)
        except Exception as e:
            self.log(f"⚠️ Notification Failed: {e}", "WARNING")


    # ---------------------------------------------------------
    # ✅ ধাপ ১.৫: স্ট্যাটাস আপডেট পাবলিশ করা (Heartbeat)
    # ---------------------------------------------------------
    def _publish_status(self):
        """Frontend এ লাইভ স্ট্যাটাস পাঠানো"""
        try:
            current_price = self.highest_price if self.position["amount"] > 0 else 0
            # যদি এক্সচেঞ্জ থাকে, লেটেস্ট প্রাইস নেওয়ার চেষ্টা করুন
            # (রিয়েল টাইমে এটি _process_ws_message থেকে আসবে)
            
            pnl_pct = 0.0
            pnl_val = 0.0
            
            if self.position['amount'] > 0:
                 entry = self.position['entry_price']
                 # আমরা লুপের মধ্যে current_price আপডেট করবো, তাই এখানে self.last_price থাকলে ভালো হতো
                 # আপাতত highest_price বা entry ব্যবহার করছি যদি current_price না থাকে
                 curr = getattr(self, 'last_known_price', entry)
                 
                 pnl_val = (curr - entry) * self.position['amount']
                 pnl_pct = ((curr - entry) / entry) * 100

            status_payload = {
                "id": self.bot.id,
                "status": "active",
                "pnl": float(f"{pnl_val:.2f}"),
                "pnl_percent": float(f"{pnl_pct:.2f}"),
                "price": float(f"{getattr(self, 'last_known_price', 0):.4f}"),
                "position": self.position["amount"] > 0
            }
            
            self.redis.publish(f"bot_status:{self.bot.id}", json.dumps(status_payload))
            
            # ড্যাশবোর্ডের জন্য (Optional, if we want a global view channel)
            # self.redis.publish(f"dashboard_updates:{self.bot.owner_id}", json.dumps(status_payload))

        except Exception as e:
            pass # সাইলেন্ট ফেইল, লগ জ্যাম না করার জন্য

    async def _negotiate_kucoin_ws_token(self):
        """KuCoin Bullet Protocol: Step 1 - Get Token"""
        try:
            # Public Bullet Endpoint (No Auth Needed for Public Data)
            url = "https://api.kucoin.com/api/v1/bullet-public"
            
            async with aiohttp.ClientSession() as session:
                async with session.post(url) as response:
                    if response.status == 200:
                        data = await response.json()
                        if data['code'] == '200000':
                            token = data['data']['token']
                            endpoint = data['data']['instanceServers'][0]['endpoint']
                            # Ping Interval (defaults to 18000ms usually)
                            ping_interval = int(data['data']['instanceServers'][0].get('pingInterval', 18000)) / 1000
                            
                            ws_url = f"{endpoint}?token={token}" # Format for connectivity
                            return ws_url, ping_interval
            
            self.log("⚠️ Failed to negotiate KuCoin Token", "WARNING")
            return None, None
        except Exception as e:
            self.log(f"KuCoin Negotiation Error: {e}", "ERROR")
            return None, None
            
    async def _get_ws_url(self):
        """এক্সচেঞ্জ অনুযায়ী WebSocket URL জেনারেট করা (Async Update)"""
        exchange_id = (self.bot.exchange or 'binance').lower()
        symbol = self.symbol.replace('/', '').lower()
        interval = self.timeframe
        
        if 'binance' in exchange_id:
            # Binance: Direct URL
            url = f"wss://stream.binance.com:9443/ws/{symbol}@kline_{interval}"
            return url, None # No negotiation needed, Ping managed by lib or default
            
        elif 'kucoin' in exchange_id:
            # KuCoin: Negotiate first
            self.log("🔗 Negotiating KuCoin WebSocket Token...", "SYSTEM")
            return await self._negotiate_kucoin_ws_token()
        
        return None, None

    async def _process_ws_message(self, message):
        """WebSocket মেসেজ প্রসেস করা এবং স্ট্র্যাটেজি রান করা"""
        try:
            data = json.loads(message)
            
            close_price = 0.0
            
            # Binance Format
            # { "e": "kline", "E": 123456789, "s": "BTCUSDT", "k": { "c": "Close Price", ... } }
            if 'k' in data and 'e' in data: # Binance Check
                kline = data['k']
                close_price = float(kline['c'])
                self.last_known_price = close_price 
            
            # KuCoin Format
            # { "type": "message", "topic": "...", "subject": "trade.candles.update", "data": { "candles": [ ... ] } }
            elif data.get('type') == 'message' and 'candles' in data.get('data', {}):
                # KuCoin sends candles in data['candles']
                # Structure: ["time", "open", "close", "high", "low", "volume", "amount"]
                candle = data['data']['candles'] 
                close_price = float(candle[2]) # Close is index 2
                self.last_known_price = close_price
            
            else:
                return # Unknown format or handshake message

            # ---------------------------------------------------------
            # ✅ Global Kill Switch Check (Every Tick)
            # ---------------------------------------------------------
            if await self.check_global_kill_switch():
                return

            # ---------------------------------------------------------
            # Shared Strategy Execution Logic
            # ---------------------------------------------------------
            self._publish_status()

            if self.mode == 'scalp':
                await self._run_scalp_logic(self.df, close_price)
            else:
                if self.position["amount"] > 0:
                     await self.monitor_risk(close_price)
                     sig, reas, _ = self.strategy_executor.check_signal(self.df)
                     if sig == "SELL": await self.execute_trade("SELL", close_price, reas)
                elif self.position["amount"] <= 0:
                     sig, reas, _ = self.strategy_executor.check_signal(self.df)
                     if sig == "BUY": await self.execute_trade("BUY", close_price, reas)

        except Exception as e:
            # self.log(f"WS Process Error: {e}", "ERROR") 
            pass

    async def _negotiate_kucoin_private_token(self):
        """KuCoin Private Bullet Protocol"""
        try:
            if hasattr(self.exchange, 'privatePostBulletPrivate'):
                response = self.exchange.private_post_bullet_private()
                if response['code'] == '200000':
                    token = response['data']['token']
                    endpoint = response['data']['instanceServers'][0]['endpoint']
                    ping_interval = int(response['data']['instanceServers'][0].get('pingInterval', 18000)) / 1000
                    return f"{endpoint}?token={token}", ping_interval
            return None, None
        except Exception as e:
            self.log(f"KuCoin Private Token Error: {e}", "ERROR")
            return None, None

    async def _get_user_stream_url(self):
        """Get WebSocket URL for User Data Stream"""
        exchange_id = (self.bot.exchange or 'binance').lower()
        
        if 'binance' in exchange_id:
            try:
                # Binance requires a listenKey
                if self.deployment_target == 'future':
                     if hasattr(self.exchange, 'fapiPrivatePostListenKey'):
                         res = self.exchange.fapi_private_post_listen_key()
                         self.listen_key = res['listenKey']
                         return f"wss://fstream.binance.com/ws/{self.listen_key}", None
                else: 
                     if hasattr(self.exchange, 'privatePostUserDataStream'):
                         res = self.exchange.private_post_user_data_stream()
                         self.listen_key = res['listenKey']
                         return f"wss://stream.binance.com:9443/ws/{self.listen_key}", None
            except Exception as e:
                self.log(f"Binance ListenKey Error: {e}", "ERROR")
        
        elif 'kucoin' in exchange_id:
            return await self._negotiate_kucoin_private_token()
            
        return None, None

    async def _process_user_stream_message(self, message):
        """Process User Data Stream (Order Updates)"""
        try:
            data = json.loads(message)
            
            # --- BINANCE ---
            if data.get('e') == 'executionReport':
                status = data.get('X') # NEW, FILLED, CANCELED, REJECTED
                side = data.get('S')
                symbol = data.get('s')
                
                if status == 'FILLED' or status == 'PARTIALLY_FILLED':
                    price = float(data.get('L', 0)) # Last Executed Price
                    qty = float(data.get('q', 0))   # Executed Qty (Check 'z' for cumulative)
                    
                    self.log(f"⚡ Order {status}: {side} {qty} @ {price}", "TRADE")
                    
                    if side == 'BUY':
                        # Update Position
                        self.position['amount'] += qty
                        self.position['entry_price'] = price
                        
                        # Trigger Scalper Logic or SL/TP immediately
                        if self.mode == 'scalp' and not self.active_scalp_order:
                             self.log("⚡ Triggering Scalp Exit Logic...", "SYSTEM")
                             # Scalp logic will handle it in next tick or we can call it here if we want instant reaction
                             # For now, let's update state so scalp loop picks it up instantly
                        
                    elif side == 'SELL':
                        sell_qty_var = qty
                        self.position['amount'] -= qty
                        
                        # ✅ FIX: Sync WS Execution with Database
                        try:
                            open_trade = self.db.query(Trade).filter(
                                Trade.bot_id == self.bot.id,
                                Trade.status == "OPEN"
                            ).first()
                            
                            if open_trade:
                                if self.position['amount'] < 0.00001:
                                    open_trade.status = "CLOSED"
                                    open_trade.exit_price = price
                                    open_trade.closed_at = datetime.utcnow()
                                
                                if open_trade.entry_price:
                                    pnl = (price - open_trade.entry_price) * sell_qty_var
                                    open_trade.pnl = (open_trade.pnl or 0.0) + pnl
                                    open_trade.pnl_percent = ((price - open_trade.entry_price) / open_trade.entry_price) * 100
                                
                                self.db.commit()
                                self.log(f"💾 Trade DB Sync (Stream). Incremental PnL: {pnl:.2f}", "SYSTEM")
                        except Exception as db_err:
                            self.log(f"⚠️ Failed to sync DB from stream: {db_err}", "WARNING")
                            self.db.rollback()

                        if self.position['amount'] < 0.00001: 
                            self.position['amount'] = 0
                            self.active_scalp_order = None # Reset Scalp Flag
                            self.position['trade_id'] = None
                            self.log("✅ Position Closed (Stream).", "INFO")
            
            # --- KUCOIN ---
            # KuCoin format: { "type": "message", "subject": "trade.orders.update", "data": { ... } }
            if data.get('subject') == 'trade.orders.update':
                 order_data = data.get('data', {})
                 status = order_data.get('status') # match, open, done
                 type_ = order_data.get('type') # match = filled??
                 
                 # KuCoin 'match' means execution
                 if order_data.get('type') == 'match':
                     side = order_data.get('side').upper() # buy/sell
                     price = float(order_data.get('price', 0))
                     qty = float(order_data.get('size', 0))
                     
                     self.log(f"⚡ Order Matched (KuCoin): {side} {qty} @ {price}", "TRADE")

                     if side == 'BUY':
                         self.position['amount'] += qty
                         self.position['entry_price'] = price
                     elif side == 'SELL':
                         self.position['amount'] -= qty
                         if self.position['amount'] <= 0:
                             self.active_scalp_order = None

            # ✅ Update Frontend immediately
            self._publish_status()

        except Exception as e:
            # self.log(f"User Stream Error: {e}", "ERROR")
            pass

    def setup_futures_settings(self):
        if self.deployment_target == 'future' and self.exchange:
            try:
                self.exchange.load_markets()
                leverage = int(self.config.get('leverage', 1))
                margin_mode = self.config.get('marginMode', 'cross').lower()
                
                try:
                    self.exchange.set_margin_mode(margin_mode, self.symbol)
                except: pass

                try:
                    self.exchange.set_leverage(leverage, self.symbol)
                    self.log(f"⚙️ Futures Config: {margin_mode.upper()} | Leverage {leverage}x", "SYSTEM")
                except: pass
            except Exception as e:
                self.log(f"Futures Setup Error: {e}", "ERROR")

    async def fetch_market_data(self, limit=100):
        try:
            # 🟢 FIX: প্রাইভেট কানেকশন না থাকলে পাবলিক কানেকশন ব্যবহার করো
            active_exchange = self.exchange or self.public_exchange
            
            if not active_exchange: 
                self.log("❌ No Exchange Connection available for Data!", "ERROR")
                return None
            
            # active_exchange দিয়ে ডাটা আনুন
            # Note: ccxt sync vs async. If using sync ccxt, this call blocks.
            # Assuming sync ccxt for now as per init.
            candles = active_exchange.fetch_ohlcv(self.symbol, self.timeframe, limit=limit)
            
            df = pd.DataFrame(candles, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
            df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
            return df
        except Exception as e:
            self.log(f"Data Fetch Error: {e}", "ERROR")
            return None

    # ---------------------------------------------------------
    # 🟢 NEW: SCALPING LOGIC ENGINE (Ping-Pong)
    # ---------------------------------------------------------
    async def _run_scalp_logic(self, df, current_price):
        """
        Smart Scalper Logic:
        1. Entry: Bollinger Lower or Manual Price
        2. Exit: Instant Limit Sell after Buy
        3. Loop: Auto-restart
        """
        

        # A. মনিটরিং: যদি অর্ডার অলরেডি বসানো থাকে
        if self.active_scalp_order:
            # সিমুলেশন মোডে এখানে আসবে না, কারণ আমরা ফ্ল্যাগ None করে দিচ্ছি
            # রিয়েল ট্রেডিং এর জন্য চেক করা দরকার
            if self.exchange:
                try:
                    # ওপেন অর্ডার চেক করা
                    open_orders = self.exchange.fetch_open_orders(self.symbol)
                    # যদি আমাদের কোনো সেল অর্ডার না থাকে, তার মানে সেটি ফিল হয়ে গেছে
                    has_open_sell = any(o['side'] == 'sell' for o in open_orders)
                    
                    if not has_open_sell:
                        self.log("✅ Limit Order Processed (Filled). Resetting...", "INFO")
                        self.position["amount"] = 0 
                        self.active_scalp_order = None
                except Exception as e:
                    pass # API Error হলে পরের লুপে দেখবে
            return

        # ১. পজিশন নেই -> বাই করার চেষ্টা করুন
        if self.position["amount"] <= 0:
            target_entry_price = 0.0
            
            # --- Entry Price Calculation ---
            trigger_type = self.scalp_settings.get('entry_trigger', 'manual')
            
            if trigger_type == 'manual':
                target_entry_price = float(self.scalp_settings.get('entry_price', 0))
            
            elif trigger_type == 'bollinger':
                # Dynamic Calculation using pandas_ta
                period = int(self.scalp_settings.get('indicator', {}).get('period', 20))
                dev = float(self.scalp_settings.get('indicator', {}).get('dev', 2.0))
                
                # BBands Calculation
                bb = df.ta.bbands(length=period, std=dev)
                if bb is not None:
                    # Lower band name usually matches: BBL_length_std
                    lower_col = f"BBL_{period}_{dev}"
                    target_entry_price = bb[lower_col].iloc[-1]
            
            if target_entry_price <= 0:
                self.log("⚠️ Invalid Entry Price Config", "ERROR")
                return

            # --- Check Condition ---
            # যদি প্রাইস টার্গেটের নিচে বা খুব কাছে আসে (0.1% বাফার)
            dist_pct = (current_price - target_entry_price) / target_entry_price
            
            if current_price <= target_entry_price or dist_pct < 0.001: 
                self.log(f"⚡ Scalp Entry Triggered! Target: {target_entry_price:.4f}, Curr: {current_price:.4f}", "TRADE")
                # বাই ট্রেড এক্সিকিউট (লিমিট অর্ডার সেফার, তবে দ্রুত এন্ট্রির জন্য মার্কেট দিচ্ছি)
                exec_price = target_entry_price if self.order_type == 'limit' else current_price
                await self.execute_trade("BUY", exec_price, "Scalp Entry")

        # ২. পজিশন আছে -> সেল অর্ডার ম্যানেজমেন্ট (Ping-Pong)
        elif self.position["amount"] > 0:
            
            entry_price = self.position["entry_price"]
            
            # Profit Target Calculation
            tp_config = self.scalp_settings.get('take_profit', {})
            tp_val = float(tp_config.get('value', 0))
            
            target_sell_price = 0.0
            if tp_config.get('type', 'spread') == 'spread':
                target_sell_price = entry_price + tp_val
            else: 
                target_sell_price = entry_price * (1 + tp_val / 100)

            # 🟢 FIX: রিয়েল লিমিট অর্ডার বসানো
            if not self.active_scalp_order:
                # 🟢 NEW: In simulation mode, wait for price to reach target before 'selling'
                if not self.exchange:
                    if current_price >= target_sell_price:
                        success = await self.execute_trade("SELL", current_price, "Simulated Auto-Flip Target Hit", amount_pct=100)
                        if success:
                            self.active_scalp_order = None
                    return

                self.log(f"🔄 Placing Auto-Flip Sell Limit Order at {target_sell_price:.4f}", "INFO")
                
                # আমরা অর্ডার টাইপ ফোর্স করে 'limit' করে দিচ্ছি যাতে অর্ডার বুকে বসে থাকে
                # এবং প্রাইস হিসেবে 'target_sell_price' পাঠাচ্ছি
                original_order_type = self.order_type 
                self.order_type = 'limit' # টেম্পোরারি লিমিট মোড
                
                success = await self.execute_trade("SELL", target_sell_price, "Auto-Flip Setup", amount_pct=100)
                
                self.order_type = original_order_type # আবার আগের মোডে ফেরত
                
                if success:
                    # 🟢 FIX: চেক করুন পজিশনটি এখনও ওপেন আছে কিনা
                    # যদি পজিশন > 0 থাকে, তার মানে রিয়েল লিমিট অর্ডার পেন্ডিং আছে -> ফ্ল্যাগ True
                    # আর যদি পজিশন 0 হয় (সিমুলেশন), তার মানে কাজ শেষ -> ফ্ল্যাগ None
                    
                    if self.position["amount"] > 0:
                        self.active_scalp_order = True
                    else:
                        self.active_scalp_order = None
            
            # নোট: এখন আর প্রাইস মনিটর করার দরকার নেই, কারণ লিমিট অর্ডার বসানো আছে।
            # এক্সচেঞ্জ নিজেই ওটা ফিল করে দেবে।

    # ---------------------------------------------------------
    # ✅ ধাপ ২: ব্যালেন্স চেক ফাংশন
    # ---------------------------------------------------------
    def check_balance(self, side, required_amount, price):
        """ট্রেড করার আগে ওয়ালেটে পর্যাপ্ত টাকা আছে কিনা চেক করা"""
        if not self.exchange: return True 

        try:
            balance = self.exchange.fetch_balance()
            
            base_currency = self.symbol.split('/')[0]
            quote_currency = self.symbol.split('/')[1]
            
            if side == "BUY":
                available = float(balance[quote_currency]['free'])
                
                # ✅ FIX: Always calculate cost as quantity * price
                cost = required_amount * price
                
                if available < cost:
                    self.log(f"❌ Insufficient Funds! Required: {cost:.4f} {quote_currency}, Available: {available:.4f}", "WARNING")
                    return False
                return True

            elif side == "SELL":
                if self.deployment_target == 'future':
                    available = float(balance[quote_currency]['free'])
                    leverage = float(self.config.get('leverage', 1))
                    cost = (required_amount * price) / leverage
                    
                    if available < cost:
                        self.log(f"❌ Insufficient Futures Margin! Required: {cost:.4f} {quote_currency}, Available: {available:.4f}", "WARNING")
                        return False
                    return True
                else:
                    available = float(balance[base_currency]['free'])
                    if available < required_amount:
                        self.log(f"❌ Insufficient Asset! Required: {required_amount} {base_currency}, Available: {available}", "WARNING")
                        return False
                    return True

        except Exception as e:
            self.log(f"⚠️ Balance Check Failed: {e}", "ERROR")
            import traceback
            traceback.print_exc()
            return False

    def check_strategy_signal(self, df):
        try:
            signal, reason, price = self.strategy_executor.check_signal(df)
            return signal, reason, price
        except Exception as e:
            self.log(f"Strategy Error: {e}", "ERROR")
            return "HOLD", "Error", df['close'].iloc[-1]

    async def monitor_risk(self, current_price: float):
        """
        Check Stop Loss, Take Profit, and Trailing Stop logic.
        """
        if self.position["amount"] == 0:
            return

        entry_price = self.position["entry_price"]
        
        # ১. Stop Loss Check
        if self.stop_loss_pct > 0:
            sl_price = entry_price * (1 - self.stop_loss_pct / 100)
            if current_price <= sl_price:
                self.log(f"🛑 Stop Loss Hit! Price: {current_price} <= SL: {sl_price}", "RISK")
                await self.execute_trade("SELL", current_price, "Stop Loss", amount_pct=100)
                return

        # ২. Trailing Stop Check
        if self.is_trailing_enabled:
            # Update Highest Price (High Water Mark)
            if current_price > self.highest_price:
                self.highest_price = current_price
            
            # Calculate Dynamic SL
            trailing_sl_price = self.highest_price * (1 - self.trailing_callback / 100)
            
            if current_price <= trailing_sl_price:
                self.log(f"📉 Trailing Stop Hit! Price: {current_price} <= TSL: {trailing_sl_price:.2f}", "RISK")
                await self.execute_trade("SELL", current_price, "Trailing Stop", amount_pct=100)
                return

        # ৩. Take Profit Check (Partial Sell supported)
        for tp in self.take_profits:
            if not tp.get("executed", False):
                target_price = entry_price * (1 + tp["target"] / 100)
                
                if current_price >= target_price:
                    self.log(f"🎯 Take Profit Target {tp['target']}% Hit at {current_price}", "PROFIT")
                    
                    # Partial Sell Execute
                    success = await self.execute_trade("SELL", current_price, f"TP {tp['target']}%", amount_pct=tp["amount"])
                    
                    if success:
                        tp["executed"] = True # Mark as executed to avoid duplicate sells

    async def execute_trade(self, side, price, reason, amount_pct=100):
        """
        Executes a trade with Smart Retry & Reconciliation Mechanism.
        """
        # 🟢 FIX: অ্যাসেট নাম বের করা (যেমন DOGE/USDT থেকে DOGE)
        asset_name = self.symbol.split('/')[0]

        # ---------------------------------------------------------
        # ✅ SIMULATION MODE
        # ---------------------------------------------------------
        if not self.exchange:
            if side == "BUY":
                # ১. আগে ক্যালকুলেশন করা
                quantity = self.trade_value / price
                
                # ২. তারপর অ্যামাউন্ট সহ লগ প্রিন্ট করা
                self.log(f"🕵️ Simulated {side} {quantity:.4f} {asset_name} at {price} ({reason})", "TRADE")
                
                # ৩. স্টেট আপডেট
                self.position = {"amount": quantity, "entry_price": price, "trade_id": "SIM_ID"}
                self.highest_price = price # Reset Trailing High
                # Reset TP flags
                for tp in self.take_profits: tp["executed"] = False

                # 🔔 SIMULATION NOTIFICATION
                await self._send_notification(
                    f"🧪 SIMULATED BUY EXECUTED\n\n"
                    f"Asset: {asset_name}\n"
                    f"Price: {price}\n"
                    f"Amount: {quantity:.4f}\n"
                    f"Reason: {reason}"
                )

            elif side == "SELL":
                # ১. আগে ক্যালকুলেশন করা
                sell_ratio = amount_pct / 100.0
                sell_qty = self.position["amount"] * sell_ratio

                # ২. অ্যামাউন্ট সহ লগ প্রিন্ট করা
                self.log(f"🕵️ Simulated {side} {sell_qty:.4f} {asset_name} at {price} ({reason})", "TRADE")

                # ৩. স্টেট আপডেট
                self.position["amount"] = self.position["amount"] * (1 - sell_ratio)
                # 🟢 FIX: ট্রেড ক্লোজ হলে ফ্ল্যাগ রিসেট করা
                self.active_scalp_order = None 

                # 🔔 SIMULATION NOTIFICATION
                await self._send_notification(
                    f"🧪 SIMULATED SELL EXECUTED\n\n"
                    f"Asset: {asset_name}\n"
                    f"Price: {price}\n"
                    f"Amount: {sell_qty:.4f}\n"
                    f"Reason: {reason}"
                )
            
            return True

        # ---------------------------------------------------------
        # ✅ REAL TRADING MODE WITH SMART RETRY
        # ---------------------------------------------------------
        
        # ১. অ্যামাউন্ট ক্যালকুলেশন
        amount = 0.0
        try:
            if side == "BUY":
                if self.trade_unit == "ASSET":
                    amount = self.trade_value 
                else:
                    amount = self.trade_value / price
            elif side == "SELL":
                # Partial Sell Logic
                amount = self.position["amount"] * (amount_pct / 100.0)

                # ✅ FIX: Selling করার আগে আসল ব্যালেন্স চেক করে অ্যাডজাস্ট করা
                try:
                    if self.deployment_target != 'future': # স্পট ট্রেডিংয়ের ক্ষেত্রে
                        balance = self.exchange.fetch_balance()
                        base_currency = self.symbol.split('/')[0] # যেমন DOGE
                        available_balance = float(balance[base_currency]['free'])

                        # যদি আমরা ১০০% সেল করতে চাই অথবা আমাদের ক্যালকুলেটেড এমাউন্ট ব্যালেন্সের চেয়ে বেশি হয়
                        if amount_pct >= 99 or amount > available_balance:
                            if amount > available_balance:
                                self.log(f"⚠️ Adjusting Sell Amount from {amount} to {available_balance} (Fees Deducted)", "WARNING")
                                amount = available_balance
                except Exception as e:
                    self.log(f"⚠️ Balance Sync Warning: {e}", "WARNING")

            # এক্সচেঞ্জ প্রিসিশন অনুযায়ী ঠিক করা
            amount = float(self.exchange.amount_to_precision(self.symbol, amount))
            
            # লিমিট অর্ডারের জন্য প্রাইসও ঠিক করতে হবে
            if self.order_type != 'market':
                price = float(self.exchange.price_to_precision(self.symbol, price))

            # ট্রেডের আগে ব্যালেন্স ভ্যালিডেশন
            has_funds = self.check_balance(side, amount, price)
            if not has_funds:
                return False

            # 3. Execute Order
            params = {}
            if self.deployment_target == 'future':
                 params['positionSide'] = 'BOTH' # Simple mode

            self.log(f"🔄 Attempting to create order on {self.bot.exchange}...", "SYSTEM")
            
            try:
                order = self.exchange.create_order(
                    symbol=self.symbol,
                    type=self.order_type,
                    side=side.lower(),
                    amount=amount,
                    price=price if self.order_type == 'limit' else None,
                    params=params
                )
                self.log(f"⚡ REAL TRADE EXECUTED: {side} {amount} @ {price}", "TRADE")
                self.log(f"Order ID: {order.get('id')}", "DEBUG")
            except Exception as order_error:
                self.log(f"❌ Create Order Failed: {order_error}", "ERROR")
                return False

            # 🔔 REAL TRADE NOTIFICATION
            await self._send_notification(
                f"🚀 REAL TRADE EXECUTED!\n\n"
                f"Type: {side.upper()}\n"
                f"Symbol: {self.symbol}\n"
                f"Price: {price}\n"
                f"Amount: {amount}\n"
                f"Reason: {reason}"
            )

            # 4. Update State (Optimistic update, Stream will confirm)
            if side == "BUY":
                self.position["amount"] += amount
                self.position["entry_price"] = price 
                self.position["trade_id"] = str(order['id'])
                
                # ✅ FIX: DB Persistence Logic (Save immediately)
                try:
                    new_trade = Trade(
                        bot_id=self.bot.id,
                        symbol=self.symbol,
                        side="BUY",
                        entry_price=price,
                        quantity=amount,
                        status="OPEN",
                        pnl=0.0
                    )
                    self.db.add(new_trade)
                    self.db.commit()
                    self.db.refresh(new_trade)
                    self.position["trade_id"] = new_trade.id # Update with DB ID if needed, or keep local
                    self.log(f"💾 Trade Saved to DB. ID: {new_trade.id}", "SYSTEM")
                except Exception as db_err:
                    self.log(f"⚠️ Failed to save trade to DB: {db_err}", "WARNING")
                    self.db.rollback()

            elif side == "SELL":
                sell_amount = amount
                
                # ✅ FIX: Do NOT deduct amount immediately for LIMIT orders.
                # Let the WebSocket / User Stream handle the deduction upon FILL.
                if self.order_type == 'market' or str(self.order_type).lower() == 'marketable_limit':
                    self.position["amount"] -= amount
                
                # ✅ FIX: Close Trade in DB (Only if position becomes zero)
                try:
                     # Find open trade to close
                     open_trade = self.db.query(Trade).filter(
                         Trade.bot_id == self.bot.id,
                         Trade.status == "OPEN"
                     ).first()
                     
                     if open_trade:
                         # ✅ FIX: Only strict close if position is fully zeroed out
                         if self.position["amount"] <= 0:
                             open_trade.status = "CLOSED"
                             open_trade.exit_price = price
                             open_trade.closed_at = datetime.utcnow()
                         
                         # ✅ Calculate PnL incrementally for partial scaling Out
                         if open_trade.entry_price:
                             pnl = (price - open_trade.entry_price) * sell_amount
                             pnl_pct = ((price - open_trade.entry_price) / open_trade.entry_price) * 100
                             open_trade.pnl = (open_trade.pnl or 0.0) + pnl
                             open_trade.pnl_percent = pnl_pct
                         
                         self.db.commit()
                         self.log(f"💾 Trade DB Updated. Incremental PnL: {pnl}", "SYSTEM")
                except Exception as db_err:
                    self.log(f"⚠️ Failed to update trade in DB: {db_err}", "WARNING")
                    self.db.rollback()

                if self.position["amount"] <= 0:
                     self.position["amount"] = 0
                     self.position["trade_id"] = None
            
            return True

        except Exception as e:
            self.log(f"❌ Trade Execution Error: {e}", "ERROR")
            self.db.rollback()
            return False

    # ---------------------------------------------------------
    # ✅ GLOBAL KILL SWITCH LOGIC
    # ---------------------------------------------------------
    async def check_global_kill_switch(self):
        """
        Checks Redis for Global Kill Switch flag (User Specific).
        If Active: Triggers Emergency Close.
        """
        try:
            # FIX: User Specific Key
            user_key = f"GLOBAL_KILL_SWITCH:{self.bot.owner_id}"
            status_user = self.redis.get(user_key)
            
            # Also check system-wide global switch
            status_global = self.redis.get("global_kill_switch")

            if status_user == "true" or status_global == "true":
                self.log("🚨 GLOBAL KILL SWITCH DETECTED! INITIATING EMERGENCY SHUTDOWN...", "RISK")
                await self.emergency_close()
                return True
        except Exception as e:
            # Redis error shouldn't stop the bot, but we should log it
            # print(f"Kill Switch Check Error: {e}")
            pass
        return False

    async def emergency_close(self):
        """
        🚨 Emergency Protocol:
        1. Cancel All Open Orders
        2. Liquidate Entire Position (Market Sell)
        3. Stop Bot Loop
        """
        try:
            if not self.exchange:
                self.log("🕵️ Simulation Mode: Emergency Close Triggered. Position reset.", "RISK")
                self.position = { "amount": 0.0, "entry_price": 0.0, "trade_id": None }
                self.active_scalp_order = None
                return

            # 1. Cancel Open Orders
            self.log("🚨 Cancelling ALL Open Orders...", "RISK")
            try:
                await self.exchange.cancel_all_orders(self.symbol)
            except Exception as e:
                self.log(f"⚠️ Cancel Order Error: {e}", "WARNING")

            # 2. Liquidate Position
            if self.position['amount'] > 0:
                self.log(f"🚨 LIQUIDATING POSITION: {self.position['amount']} {self.symbol}", "RISK")
                
                # Market Sell Everything
                try:
                    # Refresh Balance/Position info just in case
                    # For simplicty, try to sell tracked amount first
                    await self.execute_trade("SELL", 0, "EMERGENCY_KILL_SWITCH", amount_pct=100)
                except Exception as e:
                    self.log(f"❌ Liquidation Failed: {e}", "ERROR")
            
            self.log("💀 Bot Killed by Global Switch.", "SYSTEM")
            
            # Optional: We can raise an exception to break the loop or just update a status
            # For now, return allows the loop to exit cleanly if called from run_loop check
            
        except Exception as e:
            self.log(f"❌ Emergency Close Critical Error: {e}", "ERROR")


    async def _sync_exchange_state(self):
        """ ✅ Fix: Recovers ghost limit orders on bot restart for scalp mode """
        if self.position["amount"] > 0 and self.mode == 'scalp' and self.exchange:
            try:
                if hasattr(self.exchange, 'fetch_open_orders'):
                    open_orders = await self.exchange.fetch_open_orders(self.symbol)
                    has_sell = any(o['side'] == 'sell' for o in open_orders)
                    if has_sell:
                        self.active_scalp_order = True
                        self.log("✅ Ghost Limit Order Recovered from Exchange", "SYSTEM")
            except Exception as e:
                self.log(f"⚠️ Exchange Sync Failed: {e}", "WARNING")

    async def run_loop(self):
        task_key = f"bot_task:{self.bot.id}"
        self.log(f"🚀 Bot Started | Mode: {self.mode.upper()} | {self.symbol}", "SYSTEM")
        
        if self.deployment_target == 'future':
            self.setup_futures_settings()
            
        # ✅ Synchronize local RAM state with active Exchange Orders to prevent duplicate logic
        await self._sync_exchange_state()

        # ১. শুরুতে কিছু হিস্টোরিকাল ডাটা লোড করে নেওয়া
        self.df = await self.fetch_market_data(limit=100)
        self.last_known_price = 0
        if self.df is not None and not self.df.empty:
            self.last_known_price = self.df['close'].iloc[-1]

        # Launch Concurrent Streams
        await asyncio.gather(
            self._market_data_stream(task_key),
            self._user_data_stream(task_key)
        )
        
        self.log("🌙 Bot has been STOPPED safely. Have a nice day! 💤", "SYSTEM")

    async def _market_data_stream(self, task_key):
        """Main Market Data Loop (Price Updates)"""
        ws_url, ping_interval = await self._get_ws_url()
        if not ws_url:
            self.log("⚠️ WebSocket URL not found for this exchange. Falling back to Polling.", "WARNING")
            await self._run_polling_loop(task_key)
            return

        self.log(f"🔗 Market Stream Connecting: {ws_url}...", "SYSTEM")
        self.last_heartbeat = time.time()

        # ✅ Check Kill Switch Initial State
        if await self.check_global_kill_switch():
            return
        
        while True:
            if not self.redis.exists(task_key):
                break
                
            try:
                # Ping Interval হ্যান্ডল করার জন্য অপশনস
                async with websockets.connect(ws_url, ping_interval=None) as ws:
                    self.log("✅ Market Data Connected! Streaming...", "SYSTEM")
                    
                    # KuCoin Subscription
                    if 'kucoin' in (self.bot.exchange or '').lower():
                        kucoin_sub = {
                            "id": int(time.time() * 1000),
                            "type": "subscribe",
                            "topic": f"/market/candles:{self.symbol.replace('/', '-')}_{self.timeframe}", 
                            "privateChannel": False,
                            "response": True
                        }
                        await ws.send(json.dumps(kucoin_sub))
                        self.log(f"📡 Subscribed: {kucoin_sub['topic']}", "SYSTEM")
                    
                    last_ping = time.time()
                    
                    while True:
                        if not self.redis.exists(task_key): 
                            break 
                            
                        try:
                            msg = await asyncio.wait_for(ws.recv(), timeout=1.0)
                            await self._process_ws_message(msg)
                        except asyncio.TimeoutError:
                            if ping_interval and (time.time() - last_ping > ping_interval):
                                try:
                                    ping_payload = {"id": int(time.time() * 1000), "type": "ping"}
                                    await ws.send(json.dumps(ping_payload))
                                    last_ping = time.time()
                                except: pass
                            pass
                        
                        # Heartbeat
                        if time.time() - self.last_heartbeat >= 3:
                            self.log("💓 Bot is running...", "SYSTEM")
                            self.last_heartbeat = time.time()
                        
            except Exception as e:
                self.log(f"⚠️ Market Stream Error ({e}). Reconnecting...", "WARNING")
                await asyncio.sleep(5)

    async def _user_data_stream(self, task_key):
        """User Data Stream Loop (Order Updates)"""
        if not self.exchange:
            return # Simulation mode handles orders internally

        self.log("🔗 Initializing User Data Stream...", "SYSTEM")

        while True:
            if not self.redis.exists(task_key): break
            
            try:
                ws_url, ping_interval = await self._get_user_stream_url()
                if not ws_url:
                    # Retry logic handled by sleep
                    await asyncio.sleep(10)
                    continue

                self.log(f"🔗 User Stream Connected.", "SYSTEM")
                
                async with websockets.connect(ws_url) as ws:
                    last_keep_alive = time.time()
                    
                    while True:
                        if not self.redis.exists(task_key): break
                        
                        try:
                            # 60 minute listenKey validity for Binance, refresh every 30m
                            if 'binance' in (self.bot.exchange or '').lower():
                                if time.time() - last_keep_alive > 1800: # 30 mins
                                    if self.deployment_target == 'future':
                                         if hasattr(self.exchange, 'fapiPrivatePutListenKey'):
                                             await getattr(self.exchange, 'fapiPrivatePutListenKey')()
                                    else:
                                         if hasattr(self.exchange, 'privatePutUserDataStream'):
                                             await getattr(self.exchange, 'privatePutUserDataStream')({'listenKey': self.listen_key})
                                    last_keep_alive = time.time()
                                    # self.log("🔄 ListenKey Refreshed", "SYSTEM")

                            msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
                            await self._process_user_stream_message(msg)
                            
                        except asyncio.TimeoutError:
                            pass
                        except Exception as e:
                            raise e 
                            
            except Exception as e:
                self.log(f"⚠️ User Stream Disconnected ({e}). Reconnecting in 5s...", "WARNING")
                await asyncio.sleep(5)

    async def _run_polling_loop(self, task_key):
        """Legacy Polling Loop (Fallback)"""
        while True:
            if not self.redis.exists(task_key):
                 self.log("🛑 Stopping Polling...", "SYSTEM")
                 break

            try:
                df = await self.fetch_market_data()
                if df is not None:
                    current_price = df.iloc[-1]['close']
                    self.last_known_price = current_price
                    self._publish_status() # ✅ Poll Status Update

                    if self.mode == 'scalp':
                        await self._run_scalp_logic(df, current_price)
                    else:
                        if self.position["amount"] > 0:
                            await self.monitor_risk(current_price)
                            sig, reas, _ = self.strategy_executor.check_signal(df)
                            if sig == "SELL": await self.execute_trade("SELL", current_price, reas)
                        elif self.position["amount"] <= 0:
                            sig, reas, _ = self.strategy_executor.check_signal(df)
                            if sig == "BUY": await self.execute_trade("BUY", current_price, reas)

                await asyncio.sleep(3) # Polling Interval

            except Exception as e:
                self.log(f"Poll Error: {e}", "ERROR")
                await asyncio.sleep(5)
        
        self.log("🌙 Bot has been STOPPED safely. Have a nice day! 💤", "SYSTEM")
