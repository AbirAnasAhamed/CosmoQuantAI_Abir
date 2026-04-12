
import asyncio
import json
import time
import pandas as pd
import pandas_ta as ta
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session
from app import models
from app.utils import get_redis_client
from app.core.config import settings
from app.models.trade import Trade
from app.services.live_engine import LiveBotEngine # Inherit to reuse setup logic if possible, or copy necessary parts.
# We will copy/adapt to avoid issues with the loop in LiveBotEngine

class AsyncBotInstance(LiveBotEngine):
    """
    Refactored Bot Engine that runs within the BotManager loop.
    It DOES NOT possess its own 'while True' loop for market data.
    Instead, it reacts to 'process_tick' calls.
    """
    def __init__(self, bot: models.Bot, db_session: Session):
        super().__init__(bot, db_session) 
        # LiveBotEngine.__init__ handles config loading, exchange setup, state loading.
        
        self.is_running = False
        self._user_stream_task = None
        
        self._status_task = None

    async def start(self):
        """Called by Manager when starting the bot."""
        self.is_running = True
        self.start_time = datetime.now() # ⏱️ Track Start Time
        self.log(f"🚀 Async Bot Started | Mode: {self.mode.upper()}", "SYSTEM")

        # 🔔 START NOTIFICATION
        await self._send_notification(
            f"🚀 Bot Started\n\n"
            f"Symbol: {self.symbol}\n"
            f"Mode: {self.mode.upper()}\n"
            f"Strategy: {self.bot.strategy}"
        )
        
        # 1. Initial Data Fetch
        self.df = await self.fetch_market_data(limit=100)
        if self.df is not None and not self.df.empty:
            self.last_known_price = self.df['close'].iloc[-1]
            
            
        # 2. Start User Data Stream (Private Order/Trade Updates)
        # 🟢 SIMULATION MODE: Skip User Stream
        if not self.bot.is_paper_trading:
            self._user_stream_task = asyncio.create_task(self._user_data_stream_loop())
        else:
            self.log("🧪 User Stream Skipped (Simulation Mode)", "SYSTEM")
        
        # 3. Start Heartbeat Loop (Decoupled from Market Ticks)
        self._status_task = asyncio.create_task(self._status_loop())
        
    async def stop(self):
        """Called by Manager when stopping."""
        self.is_running = False
        
        if self._user_stream_task:
            self._user_stream_task.cancel()
        
        if self._status_task:
            self._status_task.cancel()
            
        # ⏱️ Log Runtime Duration
        if hasattr(self, 'start_time'):
            duration = datetime.now() - self.start_time
            # Format duration nicely
            total_seconds = int(duration.total_seconds())
            hours, remainder = divmod(total_seconds, 3600)
            minutes, seconds = divmod(remainder, 60)
            duration_str = f"{hours}h {minutes}m {seconds}s"
            self.log(f"⏱️ Bot ran for {duration_str}", "SYSTEM")

        try:
            await self._user_stream_task
        except: pass
        
        self.log("🌙 Async Bot Stopped.", "SYSTEM")

        # 🔔 STOP NOTIFICATION
        if hasattr(self, 'start_time'):
            duration = datetime.now() - self.start_time
            # Format duration nicely
            total_seconds = int(duration.total_seconds())
            hours, remainder = divmod(total_seconds, 3600)
            minutes, seconds = divmod(remainder, 60)
            duration_str = f"{hours}h {minutes}m {seconds}s"
            
            await self._send_notification(f"🌙 Bot Stopped\n\nSymbol: {self.symbol}\nRuntime: {duration_str}")
        else:
             await self._send_notification(f"🌙 Bot Stopped\n\nSymbol: {self.symbol}")

    async def _status_loop(self):
        """Dedicated loop for Heartbeats & Status Updates."""
        while self.is_running:
            try:
                price = getattr(self, 'last_known_price', 0)
                self.log(f"💓 Bot Running | {self.symbol} : {price}", "SYSTEM") 
                self._publish_status()
                await asyncio.sleep(5)
            except asyncio.CancelledError:
                break
            except Exception as e:
                # self.log(f"Status Loop Error: {e}", "ERROR")
                await asyncio.sleep(5)

    async def process_tick(self, price: float, candle_data: dict = None):
        """
        Called by SharedMarketStream whenever a new price comes in.
        This effectively replaces the 'while True' market loop.
        """
        if not self.is_running:
            return

        try:
            # 1. Update Internal Price
            self.last_known_price = price
            
            # 1. Update Internal Price
            self.last_known_price = price
            
            # (Heartbeat logic moved to _status_loop)

            # 3. Update DataFrame (Crucial for Strategy)
            if self.df is not None and candle_data:
                await self._update_dataframe(candle_data)

            # 4. Run Strategy Logic
            if self.mode == 'scalp':
                # Scalp logic often needs just price, but we pass DF too
                await self._run_scalp_logic(self.df, price)
                
            else:
                # Standard Strategy (RSI, MACD etc)
                if self.position["amount"] > 0:
                     await self.monitor_risk(price)
                     
                     if self.df is not None:
                         # Log occasionally that we are checking signals
                         # self.log(f"🔎 Checking Sell Signal...", "DEBUG") 
                         sig, reas, _ = self.strategy_executor.check_signal(self.df)
                         if sig == "SELL": 
                             self.log(f"🚨 SELL SIGNAL: {reas}", "TRADE")
                             await self.execute_trade("SELL", price, reas)
                         
                elif self.position["amount"] <= 0:
                     if self.df is not None:
                         # self.log(f"🔎 Checking Buy Signal...", "DEBUG")
                         sig, reas, _ = self.strategy_executor.check_signal(self.df)
                         if sig == "BUY": 
                             self.log(f"🚨 BUY SIGNAL: {reas}", "TRADE")
                             await self.execute_trade("BUY", price, reas)

        except Exception as e:
            # Avoid spamming errors on every tick
            if time.time() - getattr(self, 'last_err', 0) > 10:
                self.log(f"Tick Error: {e}", "ERROR")
                self.last_err = time.time()

    async def _update_dataframe(self, candle_data):
        """
        Updates self.df with the latest candle data.
        Handles both Binance (dict) and KuCoin (list) formats.
        """
        try:
            # Prepare new row data
            new_row = {}
            timestamp_ms = 0
            
            # Analyze format
            if isinstance(candle_data, dict) and 'c' in candle_data: 
                # Binance Kline
                timestamp_ms = int(candle_data['t'])
                new_row = {
                    'open': float(candle_data['o']),
                    'high': float(candle_data['h']),
                    'low': float(candle_data['l']),
                    'close': float(candle_data['c']),
                    'volume': float(candle_data['v'])
                }
            elif isinstance(candle_data, list) and len(candle_data) >= 6:
                # KuCoin Candle [time, open, close, high, low, volume, turnover]
                timestamp_ms = int(candle_data[0])
                new_row = {
                    'open': float(candle_data[1]),
                    'close': float(candle_data[2]),
                    'high': float(candle_data[3]),
                    'low': float(candle_data[4]),
                    'volume': float(candle_data[5])
                }
            else:
                return # Unknown format

            if self.df is None or self.df.empty:
                return

            # Convert to Pandas Timestamp
            new_ts = pd.to_datetime(timestamp_ms, unit='ms')
            
            # Get last timestamp from DF
            # Assuming 'timestamp' column exists as per fetch_market_data in LiveBotEngine
            last_ts = self.df['timestamp'].iloc[-1]
            
            # Add timestamp to new_row for appending
            new_row['timestamp'] = new_ts

            if new_ts > last_ts:
                # 🟢 New Candle: Append
                # Convert dict to DataFrame row
                row_df = pd.DataFrame([new_row])
                self.df = pd.concat([self.df, row_df], ignore_index=True)
                
                # Keep size manageable (e.g. 500 candles)
                if len(self.df) > 500:
                    self.df = self.df.iloc[-500:].reset_index(drop=True)
                    
                # Store update for debug
                # self.log(f"🕯️ New Candle: {new_ts}", "DEBUG")

            elif new_ts == last_ts:
                # 🟡 Same Candle: Update Last Row
                idx = self.df.index[-1]
                for col, val in new_row.items():
                    if col in self.df.columns:
                        self.df.at[idx, col] = val
            
            else:
                # Out of order packet? Ignore.
                pass
            
        except Exception as e:
            # self.log(f"DF Update Error: {e}", "ERROR")
            pass

    async def _user_data_stream_loop(self):
        """Wrapper for the user stream to handle it as a task."""
        # Reuse existing logic from LiveBotEngine, but modify to check self.is_running
        task_key = "DUMMY" # Generic key, we control loop via is_running
        
        # We need to override the while loop condition in _user_data_stream or just reimplement a simple one
        # Since _user_data_stream in LiveBotEngine checks redis task_key, we might need to patch that behavior
        # or overload it.
        
        # Simplified implementation of user stream taking bits from parent:
        self.log("🔗 Initializing Private User Stream...", "SYSTEM")
        while self.is_running:
            try:
                ws_url, ping_interval = await self._get_user_stream_url()
                if not ws_url:
                    await asyncio.sleep(10)
                    continue

                import websockets
                async with websockets.connect(ws_url) as ws:
                    last_alive = time.time()
                    while self.is_running:
                        try:
                            # 🛡️ Institutional-Grade Keep-Alive Logic (Binance)
                            if 'binance' in (self.bot.exchange or '').lower():
                                if time.time() - last_alive > 1800:
                                    try:
                                        if self.deployment_target == 'future' and hasattr(self.exchange, 'fapiPrivatePutListenKey'):
                                            await getattr(self.exchange, 'fapi_private_put_listen_key')()
                                        elif hasattr(self.exchange, 'privatePutUserDataStream'):
                                            await getattr(self.exchange, 'private_put_user_data_stream')({'listenKey': self.listen_key})
                                        last_alive = time.time()
                                        self.log("🔄 User Data Stream ListenKey refreshed successfully.", "SYSTEM")
                                    except Exception as refresh_err:
                                        self.log(f"⚠️ Failed to refresh ListenKey: {refresh_err}", "ERROR")

                            msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
                            await self._process_user_stream_message(msg)
                        
                        except asyncio.TimeoutError:
                            pass
                        except Exception:
                            break # Reconnect
            except Exception as e:
                # logger.error(f"User Stream Error: {e}")
                await asyncio.sleep(5)
