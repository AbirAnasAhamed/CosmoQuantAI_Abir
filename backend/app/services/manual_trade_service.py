import ccxt.async_support as ccxt
import logging
from sqlalchemy.orm import Session
from app import models
from app.core.security import decrypt_key
from fastapi import HTTPException

logger = logging.getLogger(__name__)

class ManualTradeService:
    @staticmethod
    async def initialize_exchange(api_key_record: models.ApiKey, is_futures: bool):
        try:
            exchange_class = getattr(ccxt, api_key_record.exchange, None)
            if not exchange_class:
                raise ValueError(f"Exchange {api_key_record.exchange} is not supported.")

            decrypted_secret = decrypt_key(api_key_record.secret_key)
            decrypted_api_key = decrypt_key(api_key_record.api_key)
            
            exchange_config = {
                'apiKey': decrypted_api_key,
                'secret': decrypted_secret,
                'enableRateLimit': True,
                'options': {
                    'adjustForTimeDifference': True,
                    'recvWindow': 60000 if api_key_record.exchange.lower() == 'mexc' else 10000
                }
            }
            
            if hasattr(api_key_record, 'passphrase') and api_key_record.passphrase:
                try:
                    exchange_config['password'] = decrypt_key(api_key_record.passphrase)
                except Exception:
                    exchange_config['password'] = api_key_record.passphrase

            if is_futures:
                exchange_config['options']['defaultType'] = 'swap'

            exchange = exchange_class(exchange_config)
            return exchange
        except Exception as e:
            logger.error(f"Failed to initialize exchange: {e}")
            raise ValueError(f"Exchange initialization failed: {str(e)}")

    @staticmethod
    async def get_fast_balance(db: Session, user_id: int, api_key_id: int, symbol: str) -> dict:
        """
        Fetches the free balance specifically for the requested symbol.
        """
        api_key_record = db.query(models.ApiKey).filter(
            models.ApiKey.id == api_key_id,
            models.ApiKey.user_id == user_id,
            models.ApiKey.is_enabled == True
        ).first()

        if not api_key_record:
            raise HTTPException(status_code=404, detail="API Key not found or inactive")

        is_futures = ':' in symbol
        exchange = None
        try:
            exchange = await ManualTradeService.initialize_exchange(api_key_record, is_futures)
            
            # Use fetch_balance
            balance = await exchange.fetch_balance()
            
            # Determine quote currency from symbol
            # For futures like BTC/USDT:USDT -> quote is USDT
            # For spot like DOGE/FDUSD -> quote is FDUSD
            parts = symbol.split('/')
            if len(parts) > 1:
                base_part = parts[0]
                quote_part = parts[1].split(':')[0]
            else:
                base_part = symbol
                quote_part = "USDT" # default fallback
                
            base_free = balance.get(base_part, {}).get('free')
            if base_free is None:
                base_free = 0.0
                
            quote_free = balance.get(quote_part, {}).get('free')
            if quote_free is None:
                quote_free = 0.0
            
            return {
                "base": base_part,
                "base_free": float(base_free),
                "quote": quote_part,
                "quote_free": float(quote_free),
                "is_futures": is_futures
            }
            
        except Exception as e:
            logger.error(f"Fast balance fetch failed: {e}")
            raise HTTPException(status_code=500, detail=f"Balance Error: {str(e)}")
        finally:
            if exchange:
                await exchange.close()

    @staticmethod
    async def place_manual_trade(
        db: Session, 
        user_id: int, 
        order_req
    ):
        """
        Places an order using the designated API Key. Applies leverage if futures.
        """
        # Find the specific API Key or fallback to first available for exchange
        query = db.query(models.ApiKey).filter(
            models.ApiKey.user_id == user_id,
            models.ApiKey.is_enabled == True
        )
        
        if getattr(order_req, 'api_key_id', None):
            query = query.filter(models.ApiKey.id == order_req.api_key_id)
        else:
            query = query.filter(models.ApiKey.exchange == order_req.exchange_id)
            
        api_key_record = query.first()

        if not api_key_record:
            raise HTTPException(status_code=404, detail="Applicable active API Key not found.")

        is_futures = ':' in order_req.symbol
        exchange = None

        try:
            exchange = await ManualTradeService.initialize_exchange(api_key_record, is_futures)
            
            # Set leverage if this is a futures pair and leverage is provided
            params = getattr(order_req, 'params', {}) or {}
            leverage = params.get('leverage')
            
            if is_futures and leverage:
                try:
                    await exchange.set_leverage(leverage, order_req.symbol)
                except Exception as lev_e:
                    logger.warning(f"Failed to set leverage: {lev_e}")
                    # Usually if leverage is already set, CCXT throws an error. We proceed.

            # Execute Trade
            if order_req.type.lower() == 'market':
                response = await exchange.create_market_order(order_req.symbol, order_req.side, order_req.amount)
            elif order_req.type.lower() == 'limit':
                if not getattr(order_req, 'price', None):
                    raise HTTPException(status_code=400, detail="Price is required for limit orders")
                response = await exchange.create_limit_order(order_req.symbol, order_req.side, order_req.amount, order_req.price)
            else:
                 raise HTTPException(status_code=400, detail="Invalid order type")

            return {
                "id": response.get('id'),
                "symbol": response.get('symbol'),
                "status": response.get('status', 'open'),
                "side": response.get('side'),
                "amount": response.get('amount'),
                "price": response.get('price') or response.get('average'),
                "message": "Order placed successfully"
            }

        except Exception as e:
            logger.error(f"Order placement failed: {e}")
            raise HTTPException(status_code=500, detail=f"Exchange Error: {str(e)}")
        finally:
            if exchange:
                await exchange.close()

manual_trade_service = ManualTradeService()
