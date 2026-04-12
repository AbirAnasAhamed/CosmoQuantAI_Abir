from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from typing import List
import shutil
import os
import ccxt

# ✅ ফিক্স: deps কে 'app.api' থেকে ইম্পোর্ট করা হয়েছে
from app import models
from app.api import deps  
from app.services.market_service import MarketService
from app.services.websocket_manager import manager

from app.services.ccxt_service import CcxtService

router = APIRouter()
market_service = MarketService()

# ✅ 1. সব এক্সচেঞ্জের লিস্ট
@router.get("/exchanges", response_model=List[str])
def get_exchanges():
    try:
        # Use curated list of popular reliable exchanges from ccxt_service
        return CcxtService.POPULAR_EXCHANGES
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ✅ 2. নির্দিষ্ট এক্সচেঞ্জের সব পেয়ার (আপডেটেড কোড)
# মনে রাখবেন: এখানে 'async' যোগ করা হয়েছে কারণ market_service.get_exchange_markets একটি async ফাংশন
@router.get("/markets/{exchange_id}")
async def get_markets(exchange_id: str):
    try:
        # সরাসরি ccxt ব্যবহার না করে market_service ব্যবহার করুন
        # কারণ market_service.py ফাইলে ইতিমধ্যে API Key লোড করার লজিক লেখা আছে
        symbols = await market_service.get_exchange_markets(exchange_id)
        
        if not symbols:
            raise HTTPException(status_code=404, detail=f"Markets not found for {exchange_id}. Check API Keys in .env")

        return symbols

    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

# ✅ 3. নির্দিষ্ট এক্সচেঞ্জের সব পেয়ার (BotLab এর জন্য)
@router.get("/pairs/{exchange_id}")
async def get_exchange_pairs(exchange_id: str):
    return await get_markets(exchange_id)

# ✅ 4. ডাটা সিঙ্ক
@router.post("/sync")
async def sync_market_data(
    symbol: str = "BTC/USDT", 
    timeframe: str = "1h", 
    start_date: str = None,
    end_date: str = None,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    result = await market_service.fetch_and_store_candles(db, symbol, timeframe, start_date, end_date)
    return result

# ✅ 5. ডাটা রিড
@router.get("/")
def get_market_data(
    symbol: str = "BTC/USDT", 
    timeframe: str = "1h", 
    db: Session = Depends(deps.get_db)
):
    candles = market_service.get_candles_from_db(db, symbol, timeframe)
    formatted_data = []
    for c in candles:
        formatted_data.append({
            "time": c[0].isoformat(),
            "open": c[1],
            "high": c[2],
            "low": c[3],
            "close": c[4],
            "volume": c[5]
        })
    return formatted_data

# ✅ 6. ফাইল আপলোড
@router.post("/upload")
async def upload_market_data(file: UploadFile = File(...), current_user: models.User = Depends(deps.get_current_user)):
    file_location = f"{DATA_FEED_DIR}/{file.filename}"
    try:
        with open(file_location, "wb+") as file_object:
            shutil.copyfileobj(file.file, file_object)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save data file: {str(e)}")
        
    return {
        "filename": file.filename,
        "message": "Data file uploaded successfully."
    }

@router.get("/timeframes/{exchange_id}")
async def get_timeframes(exchange_id: str):
    try:
        timeframes = await market_service.get_exchange_timeframes(exchange_id)
        if not timeframes:
            return ["1m", "5m", "15m", "1h", "4h", "1d"]
        return timeframes
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/exchange-credentials")
async def get_exchange_credentials():
    try:
        return await market_service.get_exchange_credentials_info()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/common-pairs")
async def get_common_pairs(exchange_a: str, exchange_b: str):
    try:
        # Fetch markets for both exchanges
        markets_a = await market_service.get_exchange_markets(exchange_a)
        markets_b = await market_service.get_exchange_markets(exchange_b)
        
        # Find intersection
        set_a = set(markets_a)
        set_b = set(markets_b)
        common_pairs = list(set_a.intersection(set_b))
        
        # Sort for better UX
        common_pairs.sort()
        
        return common_pairs
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ✅ 7. Direct Klines Endpoint for Frontend Chart
@router.get("/klines")
async def get_klines(
    symbol: str,
    interval: str = "1h",
    limit: int = 500,
    exchange: str = "binance"
):
    try:
        # We use a temporary CCXT instance or the market_service wrapper
        # For speed/simplicity, let's use market_service to fetch OHLCV directly
        # Use async ccxt for performance
        import ccxt.async_support as ccxt_async
        
        if exchange == 'binance':
            options = {}
            if ':' in symbol:
                options['options'] = {'defaultType': 'future'}
            ex = ccxt_async.binance(options)
        elif exchange == 'kucoin' and ':' in symbol:
            ex = ccxt_async.kucoinfutures()
        elif exchange == 'kraken' and ':' in symbol:
            ex = ccxt_async.krakenfutures()
        else:
            ex = getattr(ccxt_async, exchange)()
            
        try:
            # CCXT returns list of [timestamp, open, high, low, close, volume]
            ohlcv = await ex.fetch_ohlcv(symbol, interval, limit=limit)
            return ohlcv
        except Exception as e:
            error_str = str(e).lower()
            if 'badsymbol' in error_str or 'does not exist' in error_str or 'does not have market symbol' in error_str or 'bad symbol' in error_str:
                 raise HTTPException(status_code=400, detail=f"Symbol {symbol} not found or invalid.")
            raise HTTPException(status_code=500, detail=f"Error fetching klines: {str(e)}")
        finally:
            await ex.close()

    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch klines: {str(e)}")

# ✅ 8. WebSocket for Real-Time Candle Updates (Polling Simulation)
@router.websocket("/ws/candle")
async def websocket_candle(
    websocket: WebSocket,
    symbol: str = "BTC/USDT",
    interval: str = "1h",
    exchange: str = "binance"
):
    await websocket.accept()
    import ccxt.async_support as ccxt_async
    import asyncio

    ex = None
    try:
        # Initialize Exchange
        if exchange == 'binance':
            ex = ccxt_async.binance()
        else:
             # Fallback or dynamic
             ex = getattr(ccxt_async, exchange)()
        
        while True:
            try:
                # Fetch only the last candle for efficiency
                # limit=2 to ensure we get the latest open one + previous one if needed
                ohlcv = await ex.fetch_ohlcv(symbol, interval, limit=2)
                
                if ohlcv:
                    latest = ohlcv[-1]
                    # Format: [time, open, high, low, close, volume]
                    data = {
                        "time": latest[0],
                        "open": latest[1],
                        "high": latest[2],
                        "low": latest[3],
                        "close": latest[4],
                        "volume": latest[5],
                        "symbol": symbol
                    }
                    await websocket.send_json(data)
                
                # Poll interval (2 seconds is decent for "realtime" feel without hitting rate limits)
                await asyncio.sleep(2)
                
            except Exception as inner_e:
                err_msg = str(inner_e)
                if "closed" in err_msg.lower() or "close message" in err_msg.lower():
                    print("WS Closed, stopping loop.")
                    break
                print(f"WS Fetch Error: {inner_e}")
                # Don't break loop immediately for network blips, but stop if closed
                await asyncio.sleep(5)

    except WebSocketDisconnect:
        print("Client disconnected from Candle WS")
    except Exception as e:
        print(f"WS Error: {e}")
    finally:
        if ex:
            await ex.close()
