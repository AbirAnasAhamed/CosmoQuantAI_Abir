import asyncio
import logging
import time
from sqlalchemy.orm import Session
from app.services.exchange_pool import get_or_create_exchange
from app.core.security import decrypt_key
from app.services.notification import NotificationService

logger = logging.getLogger(__name__)

class BracketOrderService:
    @staticmethod
    async def monitor_and_execute_tp(
        api_key_record,
        entry_order_id: str,
        symbol: str,
        side: str,  # This is the ENTRY side ('buy' or 'sell')
        amount: float,
        is_futures: bool,
        tp_config: dict,
        initial_entry_price: float
    ):
        """
        Background task:
        1. Monitors the entry order status for up to `timeout_mins`.
        2. Detects full or partial fills.
        3. Fires opposite Take-Profit order based on the config.
        """
        try:
            # Decrypt keys
            decrypted_api_key = decrypt_key(api_key_record.api_key)
            decrypted_secret = decrypt_key(api_key_record.secret_key)
            passphrase = decrypt_key(api_key_record.passphrase) if getattr(api_key_record, 'passphrase', None) else None
            
            exchange = await get_or_create_exchange(
                api_key_id=api_key_record.id,
                exchange_name=api_key_record.exchange,
                decrypted_api_key=decrypted_api_key,
                decrypted_secret=decrypted_secret,
                is_futures=is_futures,
                passphrase=passphrase
            )
            
            timeout_iters = int((tp_config.get('timeout_mins', 5) * 60) / 2)  # poll every 2 seconds
            
            logger.info(f"🛡️ Started Bracket Order Monitor for {entry_order_id} ({symbol}). Timeout: {tp_config.get('timeout_mins')} min")
            
            filled_amount = 0.0
            average_price = 0.0
            order_closed = False
            
            # Start polling
            for _ in range(timeout_iters):
                await asyncio.sleep(2)  # Polling interval
                
                try:
                    order_status = await exchange.fetch_order(entry_order_id, symbol)
                    status = order_status.get('status')
                    
                    if status in ['closed', 'filled']:
                        filled_amount = float(order_status.get('filled') or amount)
                        average_price = float(order_status.get('average') or order_status.get('price') or initial_entry_price)
                        order_closed = True
                        break
                        
                    elif status in ['canceled', 'cancelled', 'expired', 'rejected']:
                        filled = float(order_status.get('filled', 0.0))
                        if filled > 0:
                            filled_amount = filled
                            average_price = float(order_status.get('average') or order_status.get('price') or initial_entry_price)
                            order_closed = True
                        else:
                            logger.info(f"⚠️ Bracket Monitor: Entry order {entry_order_id} canceled with no fills. Aborting.")
                            return
                        break
                        
                    elif status in ['open', 'new']:
                        # Check partial fills
                        filled = float(order_status.get('filled', 0.0))
                        if filled >= amount * 0.99: # Basically fully filled
                            filled_amount = filled
                            average_price = float(order_status.get('average') or order_status.get('price') or initial_entry_price)
                            order_closed = True
                            break
                        
                except Exception as poll_e:
                    logger.debug(f"Bracket Monitor poll error (ignoring): {poll_e}")
                    
            if not order_closed and filled_amount == 0.0:
                logger.warning(f"⏰ Bracket Monitor: Entry order {entry_order_id} timed out after {tp_config.get('timeout_mins')} mins.")
                return
                
            # If we reached here, we have a fill to execute TP on
            logger.info(f"🎯 Bracket Monitor: Entry {entry_order_id} filled {filled_amount} at {average_price}. Spawning TP...")
            
            # Formulate Opposite Order
            tp_side = 'sell' if side.lower() == 'buy' else 'buy'
            tp_order_type = tp_config.get('order_type', 'limit').lower()
            mode = tp_config.get('mode', 'percentage') # 'percentage' or 'price'
            val = float(tp_config.get('value', 0))
            
            tp_price = average_price
            
            # Calculate TP Price
            if mode == 'percentage':
                pct = val / 100.0
                if tp_side == 'sell': # Long TP
                    tp_price = average_price * (1 + pct)
                else: # Short TP
                    tp_price = average_price * (1 - pct)
            elif mode == 'price':
                if tp_side == 'sell':
                    tp_price = average_price + val
                else:
                    tp_price = average_price - val
                    
            # Normalize precision natively using CCXT so exchange accepts it
            final_tp_price = float(exchange.price_to_precision(symbol, tp_price)) if hasattr(exchange, 'price_to_precision') else tp_price
            final_amount = float(exchange.amount_to_precision(symbol, filled_amount)) if hasattr(exchange, 'amount_to_precision') else filled_amount
            
            ex_params = {}
            if is_futures:
                ex_params['reduceOnly'] = True
                
            # Post Only Maker TP
            if tp_order_type == 'limit':
                ex_params['postOnly'] = True
                
            # Execute TP
            try:
                if tp_order_type == 'limit':
                    tp_res = await exchange.create_limit_order(symbol, tp_side, final_amount, final_tp_price, ex_params)
                else:
                    tp_res = await exchange.create_market_order(symbol, tp_side, final_amount, ex_params)
                    
                logger.info(f"✅ Bracket Monitor: TP Order successfully placed! ID: {tp_res.get('id')}")
                
            except Exception as ex_e:
                logger.error(f"❌ Bracket Monitor: Failed to place TP Order! {ex_e}")
                
        except Exception as main_e:
            logger.error(f"Bracket Monitor critical failure: {main_e}")

bracket_order_service = BracketOrderService()
