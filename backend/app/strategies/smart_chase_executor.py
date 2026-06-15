import asyncio
import logging

logger = logging.getLogger(__name__)

async def execute_smart_chase(
    engine,
    public_exchange,
    symbol: str,
    exit_side: str,
    sell_amount_raw: float,
    current_price: float,
    original_sl: float,
    max_deviation_pct: float = 1.0,
    chase_delay_ms: int = 1500,
    max_attempts: int = 15,
    exchange_id: str = "binance",
    is_futures: bool = False,
    is_paper_trading: bool = False
) -> dict:
    """
    Executes a Smart Chase Limit logic to exit a position using Post-Only maker orders.
    If the market price moves beyond the max_deviation_pct from the original SL,
    it triggers a Circuit Breaker and sweeps the remaining amount at Market (Taker).
    
    Returns:
        The final order response dict, or None if failed.
    """
    chase_delay_sec = chase_delay_ms / 1000.0
    
    logger.info(f"🛡️ Executing Smart Chase Limit SL for {symbol} ({exit_side.upper()}). Max Deviation: {max_deviation_pct}%")
    
    max_chase_price = original_sl * (1 - (max_deviation_pct / 100)) if exit_side == "sell" else original_sl * (1 + (max_deviation_pct / 100))
    
    chase_active = True
    attempts = 0
    final_res = None
    remaining_amount = sell_amount_raw
    
    while chase_active:
        if max_attempts > 0 and attempts >= max_attempts:
            break
            
        attempts += 1
        
        # 1. Fetch best maker price from orderbook
        try:
            # Try to use market_depth_service if available, otherwise fallback to standard fetch
            try:
                from app.services.market_depth_service import market_depth_service
                limit_size = market_depth_service._normalize_order_book_limit(exchange_id, 5) if hasattr(market_depth_service, '_normalize_order_book_limit') else 5
            except Exception:
                limit_size = 5
                
            ob = await public_exchange.fetch_order_book(symbol, limit=limit_size)
            best_bid = ob['bids'][0][0] if ob.get('bids') else current_price
            best_ask = ob['asks'][0][0] if ob.get('asks') else current_price
        except Exception as e:
            logger.warning(f"Could not fetch precise order book for Smart Chase, falling back to current_price: {e}")
            best_bid = current_price
            best_ask = current_price
            
        # Target Maker Price: Place Sell order at best Ask, Buy order at best Bid to guarantee it rests on the book
        target_maker_price = best_ask if exit_side == "sell" else best_bid
        
        # Add a tiny tick adjustment to improve fill probability while staying maker
        try:
            mkt = public_exchange.markets.get(symbol, {})
            tick = mkt.get('precision', {}).get('price')
            if tick and float(tick) > 0:
                tick_val = float(tick)
                # If selling, we can try to front-run the ask by 1 tick (if it doesn't cross bid)
                # If buying, we can try to front-run the bid by 1 tick (if it doesn't cross ask)
                if exit_side == "sell" and (best_ask - tick_val) > best_bid:
                    target_maker_price = best_ask - tick_val
                elif exit_side == "buy" and (best_bid + tick_val) < best_ask:
                    target_maker_price = best_bid + tick_val
        except Exception:
            pass
            
        if hasattr(public_exchange, 'price_to_precision'):
            try:
                target_maker_price = float(public_exchange.price_to_precision(symbol, target_maker_price))
            except Exception:
                pass
        
        # 2. Check Circuit Breaker (Max Deviation)
        circuit_breaker_hit = False
        if exit_side == "sell" and target_maker_price < max_chase_price:
            circuit_breaker_hit = True
        elif exit_side == "buy" and target_maker_price > max_chase_price:
            circuit_breaker_hit = True
            
        if circuit_breaker_hit:
            logger.warning(f"🚨 Circuit Breaker hit! Target price {target_maker_price} breached max chase boundary {max_chase_price}. Sweeping Market!")
            params = {'reduceOnly': True} if is_futures else {}
            final_res = await engine.execute_trade(exit_side, remaining_amount, target_maker_price, order_type="market", params=params)
            break
            
        # 3. Place Post-Only Order
        logger.info(f"⚡ Smart Chase (Attempt {attempts}/{max_attempts}): Placing Post-Only {exit_side.upper()} at {target_maker_price}")
        params = {'postOnly': True}
        if is_futures:
            params['reduceOnly'] = True
            
        chase_res = await engine.execute_trade(exit_side, remaining_amount, target_maker_price, order_type="limit", params=params)
        
        if chase_res and chase_res.get('id'):
            order_id = chase_res['id']
            # 4. Wait & Check
            await asyncio.sleep(chase_delay_sec)
            
            try:
                if is_paper_trading:
                    chk = {'status': 'closed', 'id': order_id, 'filled': remaining_amount}
                else:
                    chk = await engine.exchange.fetch_order(order_id, symbol)
                status = chk.get('status')
                
                if status in ['closed', 'filled']:
                    logger.info("✅ Smart Chase Limit Order filled successfully (Maker Fee)!")
                    final_res = chk
                    break
                else:
                    logger.info(f"⏳ Chase Order {order_id} status is '{status}'. Cancelling to recalculate...")
                    if not is_paper_trading:
                        await engine.cancel_order(order_id)
                    await asyncio.sleep(0.3)
                    
                    # Check partial fill after cancel
                    if is_paper_trading:
                        cancel_chk = {'status': 'canceled', 'id': order_id, 'filled': 0.0}
                    else:
                        cancel_chk = await engine.exchange.fetch_order(order_id, symbol)
                    filled = cancel_chk.get('filled', 0.0)
                    if filled > 0:
                        logger.info(f"🔄 Partial fill detected: {filled}. Adjusting remaining amount.")
                        
                        filled_proper = filled
                        if hasattr(engine.exchange, 'amount_to_precision'):
                            try:
                                filled_proper = float(engine.exchange.amount_to_precision(symbol, filled))
                            except Exception:
                                pass
                                
                        remaining_amount = max(0.0, remaining_amount - filled_proper)
                        if remaining_amount <= 0:
                            logger.info("✅ Smart Chase fully closed position via partial fills.")
                            final_res = cancel_chk
                            break
            except Exception as e:
                logger.error(f"Error checking/cancelling chase order: {e}")
        else:
            # Failed to place post-only (e.g. order would be taker immediately).
            # EARLY EXIT: Check if position is actually 0 to prevent ghost chasing
            if attempts == 1 and not is_paper_trading:
                try:
                    positions = await engine.exchange.fetch_positions([symbol])
                    has_pos = False
                    for p in positions:
                        if float(p.get('contracts', 0) or 0) > 0:
                            has_pos = True
                            break
                    if not has_pos:
                        logger.info("✅ Smart Chase aborted: Position already closed natively!")
                        break
                except Exception as e:
                    pass

            logger.debug("Post-Only order rejected (likely crossed the spread). Retrying after delay...")
            await asyncio.sleep(chase_delay_sec)
            
    # 5. Fallback if max attempts reached without filling
    if final_res is None and remaining_amount > 0:
        logger.warning(f"⚠️ Smart Chase reached max attempts ({max_attempts}) without full fill. Forcing Market Sweep!")
        params = {'reduceOnly': True} if is_futures else {}
        final_res = await engine.execute_trade(exit_side, remaining_amount, current_price, order_type="market", params=params)
        
    return final_res
