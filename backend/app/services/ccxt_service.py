import ccxt.async_support as ccxt
import json
import logging
from typing import List, Dict, Any
from app.core.redis import redis_manager

logger = logging.getLogger(__name__)

class CcxtService:
    """
    Service to handle dynamic asset and exchange discovery using CCXT.
    Implements caching using Redis to avoid rate limits.
    """
    
    POPULAR_EXCHANGES = [
        'binance', 'kraken', 'coinbase', 'kucoin', 'bybit', 'okx', 'bitstamp', 
        'gateio', 'htx', 'mexc', 'bitget', 'gemini'
    ]

    def __init__(self):
        pass

    async def get_exchanges(self) -> List[Dict[str, str]]:
        cache_key = "market_discovery:exchanges"
        
        redis = redis_manager.get_redis()
        if redis:
            cached_data = await redis.get(cache_key)
            if cached_data:
                return json.loads(cached_data)
        
        exchanges_list = []
        for exchange_id in ccxt.exchanges:
            if exchange_id in self.POPULAR_EXCHANGES:
                exchanges_list.append({
                    "id": exchange_id,
                    "name": exchange_id.title(),
                    "popular": True
                })
        
        exchanges_list.sort(key=lambda x: x['id'])
        
        if redis:
            await redis.setex(cache_key, 86400, json.dumps(exchanges_list))
            
        return exchanges_list

    async def get_pairs(self, exchange_id: str) -> List[str]:
        exchange_id = exchange_id.lower()
        cache_key = f"market_discovery:pairs:{exchange_id}"
        
        redis = redis_manager.get_redis()
        if redis:
            cached_data = await redis.get(cache_key)
            if cached_data:
                return json.loads(cached_data)

        if exchange_id not in ccxt.exchanges:
            raise ValueError(f"Exchange '{exchange_id}' not found in CCXT.")

        api = None
        try:
            exchange_class = getattr(ccxt, exchange_id)
            api = exchange_class({
                'enableRateLimit': True,
                'options': {
                    'adjustForTimeDifference': True,
                    'recvWindow': 60000 if exchange_id == 'mexc' else 10000
                }
            })
            
            markets = await api.load_markets()
            
            pairs = []
            for symbol, market in markets.items():
                if market.get('active', True):
                    pairs.append(symbol)
            
            pairs.sort()
            
            if redis:
                await redis.setex(cache_key, 3600, json.dumps(pairs))
            
            return pairs
            
        except Exception as e:
            logger.error(f"Error fetching pairs for {exchange_id}: {e}")
            raise e
        finally:
            if api:
                await api.close()

    # --- NEW FUTURES & EXECUTION HELPERS ---
    
    def format_futures_symbol(self, symbol: str, exchange_id: str) -> str:
        """
        Converts a Spot symbol (e.g. BTC/USDT) to a Futures symbol (e.g. BTC/USDT:USDT)
        based on the exchange's CCXT formatting rules.
        """
        exchange_id = exchange_id.lower()
        if exchange_id in ['binance', 'bybit', 'okx', 'mexc', 'kucoin']:
            if ":" not in symbol and "/" in symbol:
                quote = symbol.split('/')[1]
                return f"{symbol}:{quote}"
        return symbol

    def setup_paper_trading(self, api: Any, is_paper: bool):
        """
        Enables testnet/sandbox mode if paper trading is ON.
        """
        if is_paper:
            api.set_sandbox_mode(True)
            logger.info(f"Testnet/Sandbox mode ENABLED for {api.id}")
        return api

    async def set_leverage(self, api: Any, leverage: int, symbol: str):
        """Set futures leverage dynamically via authenticated API instance"""
        try:
            if hasattr(api, 'set_leverage'):
                response = await api.set_leverage(leverage, symbol)
                logger.info(f"Leverage set to {leverage}x for {symbol}")
                return response
            else:
                logger.warning(f"Exchange {api.id} does not support set_leverage directly.")
        except Exception as e:
            logger.error(f"Error setting leverage: {e}")
            raise e

    async def set_margin_mode(self, api: Any, margin_mode: str, symbol: str):
        """Set margin mode: 'cross' or 'isolated' via authenticated API instance"""
        try:
            if hasattr(api, 'set_margin_mode'):
                response = await api.set_margin_mode(margin_mode.lower(), symbol)
                logger.info(f"Margin mode set to {margin_mode} for {symbol}")
                return response
        except Exception as e:
            if "No need to change" in str(e) or "already" in str(e).lower():
                logger.info("Margin type is already set correctly.")
            else:
                logger.error(f"Error setting margin mode: {e}")
                raise e

ccxt_service = CcxtService()
