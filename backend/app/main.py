from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import logging
import asyncio
import json
import redis.asyncio as aioredis
from app.core.config import settings
from app.api.v1.api import api_router
from app.services.websocket_manager import manager
from app.utils import RedisLogHandler
import ccxt.async_support as ccxt
from datetime import datetime
from app.core.redis import redis_manager # ✅ Import RedisManager
from app.services.liquidation_service import liquidation_service # ✅ Import Liquidation Service
from app.services.block_trade_worker import block_trade_worker # ✅ Import Block Trade Worker
from app.services.block_trade_monitor import block_trade_monitor # ✅ Import Block Trade Monitor (needed for shutdown)
from app.services.orderbook_snapshot_service import orderbook_snapshot_service # ✅ Import Orderbook Snapshot Service
from app.services.binance_liq_stream import liquidation_stream # ✅ Import Binance Liquidation Stream
from app.services.portfolio_price_service import portfolio_price_service # ✅ Import Portfolio Price Service
from app.services.god_mode_liquidation_service import god_mode_service # ✅ Import God Mode Liquidation Service
from app.services import exchange_pool # ✅ Import Exchange Pool (ManualTradeModal fast-path)

# Logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    description="Developed by ABIR AHAMED",
    version="1.0.0"
)

# ✅ Register Global Exception Handlers
from fastapi.exceptions import RequestValidationError
from fastapi import HTTPException
from app.core.errors import http_exception_handler, validation_exception_handler, general_exception_handler

app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, general_exception_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.core.middleware import IPWhitelistMiddleware
app.add_middleware(IPWhitelistMiddleware)

app.include_router(api_router, prefix=settings.API_V1_STR)

# ✅ Global variable to hold references to background tasks
running_tasks = set()

# ✅ Initialize Bot Manager
from app.services.bot_manager import BotManager
bot_manager = BotManager()

# ✅ Mount Static Files
from fastapi.staticfiles import StaticFiles
import os
static_dir = os.path.join(os.getcwd(), "static")
if not os.path.exists(static_dir):
    os.makedirs(static_dir)
avatar_dir = os.path.join(static_dir, "avatars")
if not os.path.exists(avatar_dir):
    os.makedirs(avatar_dir)

app.mount("/static", StaticFiles(directory="static"), name="static")

class EndpointFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return record.getMessage().find("/api/backtest/status") == -1

# --- Background Tasks ---

async def subscribe_to_redis_logs():
    print("📡 Listening to Redis Log Stream...")
    redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    pubsub = redis.pubsub()
    await pubsub.subscribe("bot_logs")

    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                try:
                    payload = json.loads(message["data"])
                    target_channel = payload.get("channel")
                    log_data = payload.get("data")
                    
                    # 1. Worker Logs Forwarding
                    if target_channel and target_channel.startswith("logs_") and target_channel != "logs_backend":
                         await manager.broadcast_to_symbol(target_channel, log_data)
                    
                    # 2. Backend System Logs Forwarding
                    elif target_channel == "logs_backend":
                        for channel in list(manager.active_connections.keys()):
                            if channel.startswith("logs_"): 
                                await manager.broadcast_to_symbol(channel, log_data)

                except Exception as e:
                    print(f"Log Forward Error: {e}")
    except asyncio.CancelledError:
        print("Redis Subscriber Task Cancelled.")
    finally:
        await redis.close()

async def subscribe_to_task_updates():
    print("📡 Listening to Redis Task Updates...")
    redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    pubsub = redis.pubsub()
    await pubsub.subscribe("task_updates")

    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                try:
                    data = json.loads(message["data"])
                    # data expected format: { "task_type":..., "task_id":..., "status":..., "progress":..., "data":... }
                    await manager.broadcast_status(
                        task_type=data.get("task_type"),
                        task_id=data.get("task_id"),
                        status=data.get("status"),
                        progress=data.get("progress"),
                        data=data.get("data")
                    )
                except Exception as e:
                    print(f"Task Update Forward Error: {e}")
    except asyncio.CancelledError:
        print("Task Update Subscriber Cancelled.")
    finally:
        await redis.close()

async def subscribe_to_block_trades():
    print("📡 Listening to Block Trade Stream...")
    redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    pubsub = redis.pubsub()
    await pubsub.subscribe("block_trade_stream")

    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                try:
                    data = json.loads(message["data"])
                    # Directly broadcast to "block_trades" channel
                    # Frontend will subscribe to this channel via /ws/block_trades endpoint
                    await manager.broadcast(data, "block_trades")
                except Exception as e:
                    print(f"Block Trade Forward Error: {e}")
    except asyncio.CancelledError:
        print("Block Trade Subscriber Cancelled.")
    finally:
        await redis.close()


async def subscribe_to_system_alerts():
    """Listens to 'system_alerts' Redis channel published by log_monitor_service.
    Broadcasts each alert to all frontend clients connected to /ws/system-alerts.
    """
    print("🚨 Listening to System Alert Stream...")
    redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    pubsub = redis.pubsub()
    await pubsub.subscribe("system_alerts")

    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                try:
                    data = json.loads(message["data"])
                    await manager.broadcast(data, "system_alerts")
                except Exception as e:
                    print(f"System Alert Forward Error: {e}")
    except asyncio.CancelledError:
        print("System Alert Subscriber Cancelled.")
    finally:
        await redis.close()


async def subscribe_to_container_logs():
    """Listens to 'container_logs' Redis channel published by log_monitor_service.
    Broadcasts each log batch to all frontend clients connected to /ws/container-logs.
    """
    print("📜 Listening to Container Log Stream...")
    redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    pubsub = redis.pubsub()
    await pubsub.subscribe("container_logs")

    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                try:
                    data = json.loads(message["data"])
                    await manager.broadcast(data, "container_logs")
                except Exception as e:
                    print(f"Container Log Forward Error: {e}")
    except asyncio.CancelledError:
        print("Container Log Subscriber Cancelled.")
    finally:
        await redis.close()

async def fetch_market_data_background():
    local_exchange_client = None
    print("🚀 Background Market Data Task Started")
    
    try:
        local_exchange_client = ccxt.binance({'enableRateLimit': True, 'options': {'adjustForTimeDifference': True},})
        await local_exchange_client.load_markets()
    except Exception as e:
        print(f"⚠️ Failed to initialize exchange client: {e}")

    # Rate limiting control
    last_depth_update = {}
    last_overview_update = 0  
    
    # We will fetch Top 50 dynamically, so no hardcoded list needed here.
    import random

    while True:
        try:
            active_symbols = list(manager.active_connections.keys())
            
            # Ensure we have a client
            if not local_exchange_client:
                 try:
                    local_exchange_client = ccxt.binance({'enableRateLimit': True, 'options': {'adjustForTimeDifference': True},})
                    await local_exchange_client.load_markets()
                 except Exception as e:
                    print(f"⚠️ Re-init client failed: {e}")
                    await asyncio.sleep(5)
                    continue

            # --- 1. Process Individual Subscriptions (Existing Logic) ---
            if active_symbols:
                # Internal pub-sub channels — never treat as market symbols
                NON_MARKET_CHANNELS = {
                    "general", "backtest", "block_trades", "system_alerts", "container_logs",
                }
                for symbol in active_symbols:
                    if (
                        symbol in NON_MARKET_CHANNELS
                        or symbol.startswith("logs_")
                        or symbol.startswith("status_")
                        or symbol.startswith("godmode_")
                    ):
                        continue
                    
                    # Normalize symbol (BTCUSDT -> BTC/USDT)
                    target_symbol = symbol
                    if "/" not in symbol and local_exchange_client.markets:
                         for m_symbol, m_info in local_exchange_client.markets.items():
                            if m_info.get('id') == symbol:
                                target_symbol = m_symbol
                                break
                    
                    try:
                        ticker = await local_exchange_client.fetch_ticker(target_symbol)
                        
                        def safe_float(val):
                            try: return float(val) if val is not None else 0.0
                            except: return 0.0

                        ticker_data = {
                            "symbol": symbol,
                            "price": safe_float(ticker.get('last')),
                            "change": safe_float(ticker.get('change')),
                            "changePercent": safe_float(ticker.get('percentage')),
                            "high": safe_float(ticker.get('high')),
                            "low": safe_float(ticker.get('low')),
                            "volume": safe_float(ticker.get('baseVolume')), 
                            "timestamp": datetime.utcnow().isoformat()
                        }
                        await manager.broadcast_market_data(symbol, "ticker", ticker_data)

                        # Recent Trades
                        trades = await local_exchange_client.fetch_trades(target_symbol, limit=20)
                        formatted_trades = []
                        for t in trades:
                            try:
                                formatted_trades.append({
                                    "id": t.get('id'),
                                    "time": datetime.fromtimestamp(t.get('timestamp')/1000).strftime('%H:%M:%S'),
                                    "price": t.get('price'),
                                    "amount": t.get('amount'),
                                    "type": t.get('side'),
                                })
                            except: pass
                        
                        if formatted_trades:
                            await manager.broadcast_market_data(symbol, "trade", formatted_trades)

                        # Order Book
                        now = asyncio.get_event_loop().time()
                        if symbol not in last_depth_update or (now - last_depth_update[symbol]) > 2:
                            orderbook = await local_exchange_client.fetch_order_book(target_symbol, limit=20)
                            depth_data = {
                                "bids": [{"price": b[0], "amount": b[1], "total": 0} for b in orderbook.get('bids', [])],
                                "asks": [{"price": a[0], "amount": a[1], "total": 0} for a in orderbook.get('asks', [])]
                            }
                            await manager.broadcast_market_data(symbol, "depth", depth_data)
                            last_depth_update[symbol] = now

                    except Exception as e:
                        # print(f"Error for {symbol}: {e}")
                        pass
            
            # --- 2. Market Overview Broadcast (Dynamic Top 50) ---
            # Run this every ~5 seconds (fetching all tickers is heavy)
            now = asyncio.get_event_loop().time()
            if now - last_overview_update > 5:
                try:
                    # Fetch ALL tickers
                    all_tickers = await local_exchange_client.fetch_tickers()
                    
                    # Process: Filter USDT pairs, Sort by Volume, Pick Top 50
                    processed_tickers = []
                    for sym, ticker in all_tickers.items():
                        if "/USDT" in sym and not sym.startswith("UP/") and not sym.startswith("DOWN/"): # Filter out leveraged tokens if needed
                            processed_tickers.append(ticker)
                    
                    # Sort by quoteVolume (descending)
                    processed_tickers.sort(key=lambda x: float(x.get('quoteVolume') or 0), reverse=True)
                    
                    # Take Top 50
                    top_50 = processed_tickers[:50]
                    
                    # random.shuffle(top_50)  <-- Removed to prevent ticker jumping/glitching on update
                    
                    overview_data = []
                    for ticker in top_50:
                        def safe_float(val):
                            try: return float(val) if val is not None else 0.0
                            except: return 0.0
                            
                        overview_data.append({
                            "symbol": ticker['symbol'], 
                            "price": safe_float(ticker.get('last')),
                            "changePercent": safe_float(ticker.get('percentage')),
                            "volume": safe_float(ticker.get('quoteVolume')),
                            "high": safe_float(ticker.get('high')),
                            "low": safe_float(ticker.get('low')),
                        })
                    
                    if overview_data:
                        payload = {
                            "type": "market_overview",
                            "data": overview_data
                        }
                        await manager.broadcast_to_symbol("general", payload)
                        last_overview_update = now
                        
                except Exception as e:
                    print(f"⚠️ Market Overview Error: {e}")

            await asyncio.sleep(1) # Global Loop Interval
        except asyncio.CancelledError:
            print("Market Data Task Cancelled.")
            if local_exchange_client: await local_exchange_client.close()
            break
        except Exception as e:
            print(f"Background Task Error: {e}")
            await asyncio.sleep(5)

# --- Lifecycle Events ---

@app.on_event("startup")
async def startup_event():
    # 0. Schema Auto-Patch
    try:
        from app.db.session import engine
        from sqlalchemy import text
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS alert_active_config_dump BOOLEAN DEFAULT TRUE;"))
        print("✅ Database schema auto-patched successfully.")
    except Exception as e:
        print(f"⚠️ Database schema patch failed (safe to ignore if exists): {e}")

    # 1. Initialize Redis Pool
    await redis_manager.init_redis()
    app.state.redis = redis_manager.get_redis() # ✅ Store in app.state for easy access
    
    # 1. Logging Setup
    logging.getLogger("uvicorn.access").addFilter(EndpointFilter())
    
    redis_handler = RedisLogHandler()
    redis_handler.setFormatter(logging.Formatter('%(message)s'))
    
    # Hook Uvicorn Loggers
    for logger_name in ["uvicorn", "uvicorn.access", "uvicorn.error", "fastapi"]:
        log = logging.getLogger(logger_name)
        log.addHandler(redis_handler)
        log.setLevel(logging.INFO)

    print("✅ Backend System Logging attached to Redis.")

    # 2. Start & Track Background Tasks
    # Bot Manager Startup
    bot_manager.start_service()
    app.state.bot_manager = bot_manager
    
    # Task A: Market Data
    market_task = asyncio.create_task(fetch_market_data_background())
    running_tasks.add(market_task)
    market_task.add_done_callback(running_tasks.discard) # শেষ হলে সেট থেকে মুছে যাবে

    # Task B: Redis Logs
    log_task = asyncio.create_task(subscribe_to_redis_logs())
    running_tasks.add(log_task)
    log_task.add_done_callback(running_tasks.discard)

    # Task C: Task Updates (Unified WebSocket)
    task_update_task = asyncio.create_task(subscribe_to_task_updates())
    running_tasks.add(task_update_task)
    task_update_task.add_done_callback(running_tasks.discard)

    # Task E: Liquidation Service
    liquidation_task = asyncio.create_task(liquidation_service.start())
    running_tasks.add(liquidation_task)
    liquidation_task.add_done_callback(running_tasks.discard)

    # Task F: Block Trade Worker & Subscriber
    # 1. Start Worker (Now triggered on-demand via WebSocket)
    # asyncio.create_task(block_trade_worker.start()) 
    
    # 2. Start Redis Listener (This can stay running or be on-demand too, but keeping it running is safer for now)
    block_trade_task = asyncio.create_task(subscribe_to_block_trades())
    running_tasks.add(block_trade_task)
    block_trade_task.add_done_callback(running_tasks.discard)

    # Task J: System Alert Subscriber (Docker Log Monitor → Frontend WebSocket)
    system_alert_task = asyncio.create_task(subscribe_to_system_alerts())
    running_tasks.add(system_alert_task)
    system_alert_task.add_done_callback(running_tasks.discard)

    # Task K: Container Log Stream Subscriber (All logs → Frontend terminal widget)
    container_log_task = asyncio.create_task(subscribe_to_container_logs())
    running_tasks.add(container_log_task)
    container_log_task.add_done_callback(running_tasks.discard)

    # Task G: Historical Orderbook Snapshot Loop
    snapshot_task = asyncio.create_task(orderbook_snapshot_service.start_recording_loop())
    running_tasks.add(snapshot_task)
    snapshot_task.add_done_callback(running_tasks.discard)

    # Task H: Binance Real-time Liquidation Stream
    binance_liq_task = asyncio.create_task(liquidation_stream.start())
    running_tasks.add(binance_liq_task)
    binance_liq_task.add_done_callback(running_tasks.discard)

    # Task I: Portfolio Price Service (Started on demand via WS, but we can pre-init)
    # Actually, it's started in the websocket_prices endpoint in portfolio.py

    # Task D: Active Bot PnL Broadcast
    async def broadcast_active_bot_pnl():
        print("💰 Starting Active Bot PnL Broadcast...")
        while True:
            try:
                if not hasattr(app.state, 'bot_manager'):
                    await asyncio.sleep(1)
                    continue

                active_bots = app.state.bot_manager.active_bots
                if not active_bots:
                    await asyncio.sleep(1)
                    continue

                for bot_id, bot_instance in active_bots.items():
                    try:
                        # Get current state
                        last_price = getattr(bot_instance, 'last_known_price', 0)
                        position = getattr(bot_instance, 'position', {'amount': 0, 'entry_price': 0})
                        
                        amount = float(position.get('amount', 0))
                        entry_price = float(position.get('entry_price', 0))
                        
                        pnl = 0.0
                        pnl_percent = 0.0

                        if amount > 0 and last_price > 0:
                            # Long Position PnL
                            # Value = Amount * Price
                            current_value = amount * last_price
                            entry_value = amount * entry_price
                            pnl = current_value - entry_value
                            if entry_value > 0:
                                pnl_percent = (pnl / entry_value) * 100
                        
                        # Prepare Status Update Payload
                        status_payload = {
                            "id": str(bot_id),
                            "status": bot_instance.bot.status if hasattr(bot_instance, 'bot') else "active",
                            "pnl": round(pnl, 4),
                            "pnl_percent": round(pnl_percent, 2),
                            "price": last_price,
                            "position": amount > 0
                        }

                        # Broadcast to specific bot channel
                        await manager.broadcast_to_symbol(f"status_{bot_id}", status_payload)
                        
                    except Exception as e:
                        # print(f"PnL Calc Error for {bot_id}: {e}")
                        pass
                
                await asyncio.sleep(1) # Update every second

            except asyncio.CancelledError:
                print("PnL Broadcast Task Cancelled.")
                break
            except Exception as e:
                print(f"PnL Broadcast Error: {e}")
                await asyncio.sleep(5)

    pnl_task = asyncio.create_task(broadcast_active_bot_pnl())
    running_tasks.add(pnl_task)
    pnl_task.add_done_callback(running_tasks.discard)

@app.on_event("shutdown")
async def shutdown_event():
    print("🛑 Server Shutdown Initiated...")
    
    # 3. Graceful Shutdown (সব টাস্ক ক্যানসেল করা)
    # Stop Bot Manager
    await bot_manager.stop_service()
    
    # Close Redis Pool
    await redis_manager.close_redis()
    
    for task in running_tasks:
        task.cancel()
    
    # সব টাস্ক বন্ধ হওয়া পর্যন্ত অপেক্ষা করা
    if running_tasks:
        await asyncio.gather(*running_tasks, return_exceptions=True)
    
    # Stop Liquidation Service
    await liquidation_service.stop()

    # Stop Block Trade Worker
    await block_trade_worker.stop()
    try:
        await block_trade_monitor.close_exchanges()
    except Exception as e:
        logger.warning(f"[Shutdown] block_trade_monitor.close_exchanges() failed (non-fatal): {e}")

    # Stop Orderbook Snapshot Service
    await orderbook_snapshot_service.stop_recording_loop()

    # Stop Binance Liquidation Stream
    await liquidation_stream.stop()

    # Stop Portfolio Price Service
    await portfolio_price_service.stop()

    # Close all cached Exchange Connections (ManualTradeModal pool)
    await exchange_pool.close_all()

    print("✅ All background tasks stopped.")

# --- WebSocket Endpoints ---

@app.websocket("/ws/market-data/{symbol:path}")
async def websocket_endpoint(websocket: WebSocket, symbol: str):
    await manager.connect(websocket, symbol)
    try:
        while True: await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, symbol)

@app.websocket("/ws/logs/{bot_id}")
async def websocket_logs(websocket: WebSocket, bot_id: str):
    channel_id = f"logs_{bot_id}"
    await manager.connect(websocket, channel_id)
    try:
        while True: await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, channel_id)

@app.websocket("/ws")
async def websocket_general(websocket: WebSocket):
    await manager.connect(websocket, "general")
    try:
        while True: await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, "general")

@app.websocket("/ws/backtest")
async def websocket_backtest(websocket: WebSocket):
    await manager.connect(websocket, "backtest")
    try:
        while True: await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, "backtest")

@app.websocket("/ws/status/{bot_id}")
async def websocket_status(websocket: WebSocket, bot_id: str):
    channel_id = f"status_{bot_id}"
    await manager.connect(websocket, channel_id)
    try:
        while True: await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, channel_id)

@app.websocket("/ws/block_trades")
async def websocket_block_trades(websocket: WebSocket):
    await manager.connect(websocket, "block_trades")
    
    # ✅ Start Worker On-Demand
    if not block_trade_worker.running:
         asyncio.create_task(block_trade_worker.start())

    try:
        while True: await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, "block_trades")
        
        # ✅ Stop Worker if no one is listening
        if not manager.active_connections.get("block_trades"):
            await block_trade_worker.stop()

@app.websocket("/ws/system-alerts")
async def websocket_system_alerts(websocket: WebSocket):
    """Live Docker log alert stream. Frontend connects here to receive real-time
    ERROR and CRITICAL alerts from all backend containers.
    WARNING-level events are intentionally suppressed — only actionable issues appear."""
    await manager.connect(websocket, "system_alerts")
    try:
        while True: await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, "system_alerts")

@app.websocket("/ws/container-logs")
async def websocket_container_logs(websocket: WebSocket):
    """Live container log stream. Frontend connects here to receive all raw
    log lines from all backend containers, updated every 10 seconds."""
    await manager.connect(websocket, "container_logs")
    try:
        while True: await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, "container_logs")

@app.websocket("/ws/godmode/{symbol:path}")
async def websocket_godmode(websocket: WebSocket, symbol: str):
    """Live God Mode (Liquidation Heatmap) Data stream."""
    channel_id = f"godmode_{symbol}"
    await manager.connect(websocket, channel_id)
    
    async def state_callback(state: dict):
        # We broadcast the state to everyone connected to this symbol's godmode channel
        if channel_id in manager.active_connections:
            await manager.broadcast_to_symbol(channel_id, state)
            
    god_mode_service.register_callback(state_callback)
    
    # Start the service for this symbol in the background
    asyncio.create_task(god_mode_service.start(symbol))
    
    try:
        while True: 
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, channel_id)
        god_mode_service.remove_callback(state_callback)

