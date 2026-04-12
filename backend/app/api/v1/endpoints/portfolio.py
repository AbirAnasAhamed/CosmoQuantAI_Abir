from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api import deps
from app import crud, models
from app.core import security
from app.services.websocket_manager import manager
from app.services.portfolio_price_service import portfolio_price_service
import ccxt.async_support as ccxt
import logging
import asyncio
from fastapi import WebSocket, WebSocketDisconnect

from typing import Dict, Any

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/balances")
async def get_portfolio_balances(
    current_user: models.User = Depends(deps.get_current_user),
    db: Session = Depends(deps.get_db)
):
    api_keys = crud.get_user_api_keys(db=db, user_id=current_user.id)
    
    if not api_keys:
        return {"assets": [], "total_portfolio_value": 0.0}

    assets: Dict[str, Dict[str, Any]] = {}
    
    for key_record in api_keys:
        exchange_id = key_record.exchange.lower()
        if exchange_id not in ccxt.exchanges:
            logger.warning(f"Exchange {exchange_id} not supported by CCXT")
            continue
            
        exchange_class = getattr(ccxt, exchange_id)
        
        try:
            # Decrypt credentials
            decrypted_api_key = security.decrypt_key(key_record.api_key)
            decrypted_secret = security.decrypt_key(key_record.secret_key)
            decrypted_passphrase = None
            if key_record.passphrase:
                decrypted_passphrase = security.decrypt_key(key_record.passphrase)

            exchange_config = {
                'apiKey': decrypted_api_key,
                'secret': decrypted_secret,
                'enableRateLimit': True,
                'options': {
                    'adjustForTimeDifference': True,
                    'recvWindow': 60000 if exchange_id == 'mexc' else 10000
                }
            }
            
            api = exchange_class(exchange_config)
        except Exception as decrypt_error:
            logger.error(f"Failed to decrypt keys for {exchange_id}: {decrypt_error}")
            continue
        
        try:
            balance = await api.fetch_balance()
            total = balance.get('total', {})
            
            for symbol, amount in total.items():
                if amount and amount > 0:
                    if symbol not in assets:
                        assets[symbol] = {
                            "id": symbol,
                            "symbol": symbol,
                            "name": symbol, # Default to symbol as name
                            "amount": 0.0,
                            "value": 0.0,
                            "price": 0.0,
                            "price24h": 0.0,
                            "history": [],
                            "allocations": []
                        }
                    assets[symbol]["amount"] += amount
                    assets[symbol]["allocations"].append({
                        "exchange": exchange_id,
                        "amount": amount
                    })
        except Exception as e:
            logger.error(f"Error fetching balance from {exchange_id} for user {current_user.id}: {e}")
        finally:
            await api.close()
            
    # Fetch prices to calculate value
    if assets:
        binance = ccxt.binance({'enableRateLimit': True})
        try:
            tickers = await binance.fetch_tickers()
            for symbol in assets:
                ticker_symbol = f"{symbol}/USDT"
                price = 0.0
                price24h = 0.0
                
                if ticker_symbol in tickers:
                    price = tickers[ticker_symbol].get('last', 0.0) or 0.0
                    open_price = tickers[ticker_symbol].get('open', 0.0) or price
                    price24h = open_price # mock 24h price as open price
                elif symbol in ['USDT', 'USDC', 'DAI', 'BUSD']:
                    price = 1.0
                    price24h = 1.0
                
                assets[symbol]["price"] = price
                assets[symbol]["price24h"] = price24h
                assets[symbol]["value"] = assets[symbol]["amount"] * price
                
                # Create a simple mock history to make sparklines work
                assets[symbol]["history"] = [
                    {"time": "24h ago", "value": assets[symbol]["amount"] * price24h},
                    {"time": "12h ago", "value": assets[symbol]["amount"] * ((price + price24h)/2)},
                    {"time": "Now", "value": assets[symbol]["amount"] * price}
                ]
                
        except Exception as e:
            logger.error(f"Error fetching tickers for pricing: {e}")
        finally:
            await binance.close()

    total_portfolio_value = sum(item["value"] for item in assets.values())
    
    # Sort assets by value descending
    sorted_assets = sorted(assets.values(), key=lambda x: x["value"], reverse=True)
    
    return {
        "status": "success",
        "total_portfolio_value": round(total_portfolio_value, 2),
        "assets": list(assets.values())
    }

@router.get("/fee/{key_id}")
async def get_fee(
    key_id: int,
    symbol: str,
    current_user: models.User = Depends(deps.get_current_user),
    db: Session = Depends(deps.get_db)
):
    key_record = crud.get_user_api_keys(db=db, user_id=current_user.id)
    key_data = next((k for k in key_record if k.id == key_id), None)
    
    if not key_data:
        raise HTTPException(status_code=404, detail="API Key not found")
        
    exchange_id = key_data.exchange.lower()
    if exchange_id not in ccxt.exchanges:
        raise HTTPException(status_code=400, detail=f"Exchange {exchange_id} not supported")
        
    exchange_class = getattr(ccxt, exchange_id)
    
    try:
        decrypted_api_key = security.decrypt_key(key_data.api_key)
        decrypted_secret = security.decrypt_key(key_data.secret_key)
        decrypted_passphrase = None
        if key_data.passphrase:
            decrypted_passphrase = security.decrypt_key(key_data.passphrase)

        exchange_config = {
            'apiKey': decrypted_api_key,
            'secret': decrypted_secret,
            'enableRateLimit': True,
        }
        if decrypted_passphrase:
            exchange_config['password'] = decrypted_passphrase
            
        api = exchange_class(exchange_config)
    except Exception as e:
        logger.error(f"Failed to decrypt keys or init exchange: {e}")
        raise HTTPException(status_code=500, detail="Failed to initialize exchange connection")

    try:
        await api.load_markets()
        
        # Determine base/quote
        parts = symbol.split('/')
        if len(parts) == 2:
            s_symbol = symbol
        else:
            s_symbol = f"{symbol}/USDT" # Fallback guess
            
        try:
            fee_info = await api.fetch_trading_fee(s_symbol)
            maker = fee_info.get('maker')
            taker = fee_info.get('taker')
            
            # Binance Promotional Zero-Fee Overrides
            if exchange_id == 'binance':
                # Binance currently has 0 Maker fee for FDUSD pairs
                if '/FDUSD' in s_symbol:
                    maker = 0.0
                    
            # If CCXT returns None, try to get from markets
            if maker is None or taker is None:
                if s_symbol in api.markets:
                    mkt = api.markets[s_symbol]
                    if maker is None: maker = mkt.get('maker')
                    if taker is None: taker = mkt.get('taker')
                    
            # Apply heuristics if STILL None (mostly for MEXC parsing failures)
            if maker is None or taker is None:
                if exchange_id == 'mexc':
                    maker = 0.0
                    taker = 0.0 if '/USDC' in s_symbol else 0.001
                else:
                    if maker is None: maker = 0.001
                    if taker is None: taker = 0.001
                    
            return {"maker": float(maker), "taker": float(taker)}
            
        except Exception as inner_e:
            logger.warning(f"fetch_trading_fee failed for {exchange_id}: {inner_e}")
            maker, taker = None, None
            if s_symbol in api.markets:
                market = api.markets[s_symbol]
                maker = market.get('maker')
                taker = market.get('taker')
                
            # Fallback heuristics
            if exchange_id == 'binance' and '/FDUSD' in s_symbol:
                maker = 0.0
                
            if maker is None or taker is None:
                if exchange_id == 'mexc':
                    maker = 0.0
                    taker = 0.0 if '/USDC' in s_symbol else 0.001
                else:
                    maker = maker if maker is not None else 0.001
                    taker = taker if taker is not None else 0.001
                    
            return {"maker": float(maker), "taker": float(taker)}
    except Exception as e:
        logger.error(f"Error fetching fee: {e}")
        return {"maker": 0.001, "taker": 0.001}
    finally:
        await api.close()

@router.websocket("/ws/prices")
async def portfolio_websocket_prices(websocket: WebSocket):
    await manager.connect(websocket, "portfolio_prices")
    try:
        # Start the price service if not already running
        await portfolio_price_service.start()
        
        while True:
            # Receive subscription message from frontend
            # Format: { "action": "subscribe", "exchanges": { "binance": ["BTC/USDT", "ETH/USDT"], "mexc": ["LINK/USDT"] } }
            data = await websocket.receive_json()
            if data.get("action") == "subscribe":
                exchanges = data.get("exchanges", {})
                portfolio_price_service.update_active_symbols(exchanges)
                logger.info(f"Updated portfolio price subscriptions: {exchanges}")
                
    except WebSocketDisconnect:
        manager.disconnect(websocket, "portfolio_prices")
        # Optional: We could stop the service if no one is listening, 
        # but for simplicity, let it run or rely on the manager check in the loop.
    except Exception as e:
        logger.error(f"WS Portfolio Price Error: {e}")
        manager.disconnect(websocket, "portfolio_prices")
