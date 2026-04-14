"""
Manual Trade Service
====================
ManualTradeModal এর জন্য ব্যাকএন্ড সার্ভিস।
Exchange Connection Pool ব্যবহার করে ultra-low latency order execution নিশ্চিত করে।
"""

import logging
import time
import asyncio
from sqlalchemy.orm import Session
from app import models
from app.core.security import decrypt_key
from app.services.exchange_pool import get_or_create_exchange
from app.services.notification import NotificationService
from app.services.bracket_order_service import bracket_order_service
from fastapi import HTTPException

logger = logging.getLogger(__name__)


class ManualTradeService:

    @staticmethod
    async def _get_exchange(api_key_record: models.ApiKey, is_futures: bool):
        """
        Exchange Pool থেকে একটি ready Exchange instance নিয়ে আসে।
        নতুন করে init করতে হয় না — cached থাকলে তাৎক্ষণিক রিটার্ন করে।
        """
        decrypted_secret = decrypt_key(api_key_record.secret_key)
        decrypted_api_key = decrypt_key(api_key_record.api_key)

        passphrase = None
        if hasattr(api_key_record, 'passphrase') and api_key_record.passphrase:
            try:
                passphrase = decrypt_key(api_key_record.passphrase)
            except Exception:
                passphrase = api_key_record.passphrase

        exchange = await get_or_create_exchange(
            api_key_id=api_key_record.id,
            exchange_name=api_key_record.exchange,
            decrypted_api_key=decrypted_api_key,
            decrypted_secret=decrypted_secret,
            is_futures=is_futures,
            passphrase=passphrase,
        )
        return exchange

    @staticmethod
    async def get_fast_balance(db: Session, user_id: int, api_key_id: int, symbol: str) -> dict:
        """
        Fetches the free balance for both the base and quote assets of the given symbol.
        Exchange Connection Pool ব্যবহার করে বলে প্রথমবারের পরে অনেক দ্রুত।
        """
        api_key_record = db.query(models.ApiKey).filter(
            models.ApiKey.id == api_key_id,
            models.ApiKey.user_id == user_id,
            models.ApiKey.is_enabled == True
        ).first()

        if not api_key_record:
            raise HTTPException(status_code=404, detail="API Key not found or inactive")

        is_futures = ':' in symbol
        try:
            exchange = await ManualTradeService._get_exchange(api_key_record, is_futures)
            
            parts = symbol.split('/')
            base_part = parts[0] if len(parts) > 1 else symbol
            quote_part = parts[1].split(':')[0] if len(parts) > 1 else "USDT"
            
            # Pass symbol constraints if the exchange supports lightweight fetching
            try:
                balance = await exchange.fetch_balance({'coin': quote_part})
            except:
                balance = await exchange.fetch_balance()

            # Symbol থেকে base এবং quote বের করা
            # Futures: DOGE/USDT:USDT → base=DOGE, quote=USDT
            # Spot:    DOGE/FDUSD    → base=DOGE, quote=FDUSD
            parts = symbol.split('/')
            if len(parts) > 1:
                base_part = parts[0]
                quote_part = parts[1].split(':')[0]
            else:
                base_part = symbol
                quote_part = "USDT"

            base_free = balance.get(base_part, {}).get('free') or 0.0
            quote_free = balance.get(quote_part, {}).get('free') or 0.0

            return {
                "base": base_part,
                "base_free": float(base_free),
                "quote": quote_part,
                "quote_free": float(quote_free),
                "is_futures": is_futures
            }

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Fast balance fetch failed: {api_key_record.exchange} {e}")
            raise HTTPException(status_code=500, detail=f"Balance Error: {str(e)}")

    @staticmethod
    async def get_active_position(db: Session, user_id: int, api_key_id: int, symbol: str) -> dict:
        """
        Fetches the current open position for the requested symbol.
        Used for calculating 'Reduce Only' percentages reliably.
        """
        api_key_record = db.query(models.ApiKey).filter(
            models.ApiKey.id == api_key_id,
            models.ApiKey.user_id == user_id,
            models.ApiKey.is_enabled == True
        ).first()

        if not api_key_record:
            raise HTTPException(status_code=404, detail="API Key not found or inactive")

        is_futures = ':' in symbol
        if not is_futures:
             # Spot markets don't have "positions", just balances.
             return {"amount": 0.0, "side": "none"}
            
        try:
            exchange = await ManualTradeService._get_exchange(api_key_record, is_futures)
            
            # Use fetch_positions for the specific symbol
            # CCXT usually returns a list of positions for the symbol (or all if omitted).
            positions = await exchange.fetch_positions([symbol])
            
            # Find the active position for this symbol
            active_pos = None
            for p in positions:
                 if p.get('symbol') == symbol and float(p.get('contracts', 0) or p.get('info', {}).get('positionAmt', 0)) != 0:
                     active_pos = p
                     break
            
            if not active_pos:
                 return {"amount": 0.0, "side": "none"}
                 
            # Extract position data consistently across exchanges
            # Binance uses 'positionAmt', CCXT standard uses 'contracts' and 'side' ('long' or 'short')
            raw_amt = float(active_pos.get('contracts', 0))
            if raw_amt == 0:
                 # Fallback for Binance/MEXC if contracts is missing
                 raw_amt = abs(float(active_pos.get('info', {}).get('positionAmt', 0)))
            
            side = active_pos.get('side', 'none').lower()
            if side == 'none':
                 # Infer from positionAmt sign if available
                 pos_amt = float(active_pos.get('info', {}).get('positionAmt', 0))
                 if pos_amt > 0: side = 'long'
                 elif pos_amt < 0: side = 'short'
            
            return {
                 "amount": float(raw_amt),
                 "side": side
            }

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Fast position fetch failed: {api_key_record.exchange} {e}")
            raise HTTPException(status_code=500, detail=f"Position Error: {str(e)}")

    @staticmethod
    async def place_manual_trade(db: Session, user_id: int, order_req) -> dict:
        """
        Exchange Connection Pool ব্যবহার করে ultra-fast order execution।
        প্রথম অর্ডারের পরে পরবর্তী সব অর্ডার ~100-200ms এ সম্পন্ন হয়।
        """
        # নির্দিষ্ট API Key খুঁজে বের করা
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

        try:
            # Pool থেকে Exchange নেওয়া — প্রথমবার ~800ms, পরে ~5ms
            exchange = await ManualTradeService._get_exchange(api_key_record, is_futures)

            # Leverage and Margin Mode (Futures)
            params = getattr(order_req, 'params', {}) or {}
            ex_params = {} # arguments passed to create_order

            if is_futures:
                leverage = params.get('leverage')
                margin_mode = params.get('marginMode')
                reduce_only = params.get('reduceOnly', False)
                
                if reduce_only:
                    ex_params['reduceOnly'] = True

                if margin_mode:
                    try:
                        await exchange.set_margin_mode(margin_mode, order_req.symbol)
                    except Exception as mm_e:
                        logger.warning(f"Margin mode set skipped (may already be set or unsupported): {mm_e}")

                if leverage:
                    try:
                        await exchange.set_leverage(leverage, order_req.symbol)
                    except Exception as lev_e:
                        logger.warning(f"Leverage set skipped (may already be set): {lev_e}")

            # Execute Trade
            if order_req.type.lower() == 'market':
                response = await exchange.create_market_order(
                    order_req.symbol, order_req.side, order_req.amount, ex_params
                )
            elif order_req.type.lower() == 'limit':
                if params.get('autoBestLimit'):
                    try:
                        ob = await exchange.fetch_order_book(order_req.symbol, limit=5)
                        if order_req.side.lower() == 'buy':
                            if not ob.get('bids'): raise ValueError("No bids found in orderbook.")
                            order_req.price = ob['bids'][0][0]
                        else:
                            if not ob.get('asks'): raise ValueError("No asks found in orderbook.")
                            order_req.price = ob['asks'][0][0]
                        ex_params['postOnly'] = True
                    except Exception as e:
                        logger.error(f"Failed to auto-detect best limit price: {e}")
                        raise HTTPException(status_code=500, detail=f"Failed to auto-fetch best limit price: {e}")

                if not getattr(order_req, 'price', None) or order_req.price <= 0:
                    raise HTTPException(status_code=400, detail="Price is required for limit orders")
                
                response = await exchange.create_limit_order(
                    order_req.symbol, order_req.side, order_req.amount, order_req.price, ex_params
                )
            else:
                raise HTTPException(status_code=400, detail="Invalid order type. Use 'market' or 'limit'.")

            # Calculate Latency (using backend perf_counter to eliminate PC-Server clock drift)
            latency_ms = 0
            if hasattr(order_req, '_backend_start_time'):
                latency_ms = int((time.perf_counter() - getattr(order_req, '_backend_start_time')) * 1000)
            else:
                # Fallback if somehow not set, just assume 0 or fast
                latency_ms = 0
            
            latency_msg = f"⏱ Execution Time: {latency_ms} ms ⚡\n"
            
            # Send Telegram Notification
            try:
                msg = (
                    f"🎯 *Manual Trade Executed!*\n"
                    f"Exchange: {api_key_record.exchange.capitalize()}\n"
                    f"Pair: {order_req.symbol}\n"
                    f"Side: {order_req.side.upper()}\n"
                    f"Amount: {order_req.amount}\n"
                    f"{latency_msg}"
                )
                asyncio.create_task(NotificationService.send_message(db, user_id, msg))
            except Exception as notify_err:
                logger.warning(f"Failed to trigger telegram notification: {notify_err}")

            # [Bracket Order Link]
            if getattr(order_req, 'attached_tp', None) and order_req.attached_tp.enabled:
                initial_price = response.get('price') or response.get('average') or getattr(order_req, 'price', 0.0)
                asyncio.create_task(
                    bracket_order_service.monitor_and_execute_tp(
                        api_key_record=api_key_record,
                        entry_order_id=response.get('id'),
                        symbol=order_req.symbol,
                        side=order_req.side,
                        amount=order_req.amount,
                        is_futures=is_futures,
                        tp_config=order_req.attached_tp.dict(),
                        initial_entry_price=float(initial_price) if initial_price else 0.0
                    )
                )

            return {
                "id": response.get('id'),
                "symbol": response.get('symbol'),
                "status": response.get('status', 'open'),
                "side": response.get('side'),
                "amount": response.get('amount'),
                "price": response.get('price') or response.get('average'),
                "message": "Order placed successfully"
            }

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Order placement failed: {e}")
            raise HTTPException(status_code=500, detail=f"Exchange Error: {str(e)}")


manual_trade_service = ManualTradeService()
