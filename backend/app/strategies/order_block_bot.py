import asyncio
import json
import logging
import uuid
import time
from typing import Dict, Any, List, Optional
import ccxt.async_support as ccxt
from app.core.redis import redis_manager

logger = logging.getLogger(__name__)

class OrderBlockDetector:
    """
    Analyzes market depth (bids/asks) to detect dense concentrations of orders ("Smart Money" blocks).
    """
    def __init__(self, volume_threshold_multiplier: float = 3.0):
        # We look for price levels where volume is X times the average volume in the book
        self.volume_threshold_multiplier = volume_threshold_multiplier

    def detect_blocks(self, orderbook: Dict[str, Any], block_type: str = "bids") -> List[Dict[str, float]]:
        """
        Scans a side of the order book for order blocks.
        block_type: 'bids' (support) or 'asks' (resistance)
        Returns a list of detected blocks: [{"price": P, "volume": V}]
        """
        levels = orderbook.get(block_type, [])
        if not levels:
            return []

        # levels format from CCXT is usually [[price, volume], ...]
        # Calculate average volume
        total_volume = sum(level[1] for level in levels)
        avg_volume = total_volume / len(levels) if levels else 0

        # Threshold for considering a level an "Order Block"
        threshold = avg_volume * self.volume_threshold_multiplier

        detected_blocks = []
        for price, volume in levels:
            if volume >= threshold:
                detected_blocks.append({
                    "price": float(price),
                    "volume": float(volume),
                    "type": block_type
                })

        return detected_blocks

class OrderBlockExecutionEngine:
    """
    Handles trading execution securely. Segregates Real (CCXT) and Paper trading.
    """
    def __init__(self, config: Dict[str, Any], exchange=None, logger=None, bot_id: int = None):
        self.bot_id = bot_id or config.get("bot_id")
        self.is_paper_trading = config.get("is_paper_trading", True)
        self.exchange_id = config.get("exchange", "binance").lower()
        self.trading_mode = config.get("trading_mode", "spot")
        self.leverage = config.get("leverage", 1)
        self.exchange = exchange
        self.config = config # store for reference
        self.pair = config.get("pair") or config.get("symbol")
        self.is_hedge_mode = config.get("is_hedge_mode", False) # ডাইনামিক মোড
        self.logger = logger if logger else logging.getLogger(__name__)
        
        # Ensure exchange_id is accurate if an instance is provided
        if self.exchange and hasattr(self.exchange, 'id'):
            self.exchange_id = self.exchange.id.lower()
        elif config.get("exchange"):
            self.exchange_id = config.get("exchange").lower()
            
        self.trading_mode = config.get("trading_mode", "spot").lower()
        self.strategy_mode = config.get("strategy_mode", "long").lower()
        self.margin_mode = config.get("margin_mode", "cross").lower()
        
        # Paper trading state
        self.paper_balance_quote = config.get("paper_balance_initial", 10000.0)
        self.paper_balance_base = 0.0
        self.paper_open_positions = [] # Track multiple if needed, but usually 1
        self.active_position = None 

    async def execute_trade(self, side: str, amount: float, price: float, order_type: str = "market", params: dict = None) -> Optional[Dict[str, Any]]:
        """
        Executes a trade, routing to either Paper or Real logic.
        """
        if self.is_paper_trading:
            return await self._execute_paper(side, amount, price, order_type)
        else:
            return await self._execute_real(side, amount, price, order_type, params)

    async def _execute_paper(self, side: str, amount: float, price: float, order_type: str = "market") -> Optional[Dict[str, Any]]:
        trade_id = f"paper_{uuid.uuid4().hex[:8]}"
        timestamp = time.time()
        
        cost = amount * price
        required_margin = cost / self.leverage
        
        if order_type.lower() == "limit":
            logger.debug(f"[PAPER] Placed LIMIT {side.upper()} order for {amount} {self.pair} at {price}.")
            return {
                "id": trade_id,
                "side": side,
                "amount": amount,
                "price": price,
                "timestamp": timestamp,
                "status": "open"
            }
        
        if self.trading_mode == "futures":
            # Futures Paper Logic: Both Buy/Sell use Quote as margin
            if side == "buy": # Open Long or Close Short
                if self.active_position and self.active_position['side'] == 'short':
                    # Closing Short
                    pnl = (self.active_position['entry_price'] - price) * amount
                    self.paper_balance_quote += pnl
                    self.active_position = None
                    logger.debug(f"[PAPER-FUTURES] Closed SHORT at {price}. PnL: {pnl}")
                else:
                    # Opening Long
                    if self.paper_balance_quote >= required_margin:
                        self.active_position = {"side": "long", "entry_price": price, "amount": amount}
                        logger.debug(f"[PAPER-FUTURES] Opened LONG at {price}. Cost: {cost}, Margin: {required_margin}")
                    else:
                        logger.warning(f"[PAPER-FUTURES] Insufficient quote for LONG. Need {required_margin}, have {self.paper_balance_quote}")
                        return None
            else: # side == "sell" -> Open Short or Close Long
                if self.active_position and self.active_position['side'] == 'long':
                    # Closing Long
                    pnl = (price - self.active_position['entry_price']) * amount
                    self.paper_balance_quote += pnl
                    self.active_position = None
                    logger.debug(f"[PAPER-FUTURES] Closed LONG at {price}. PnL: {pnl}")
                else:
                    # Opening Short
                    if self.paper_balance_quote >= required_margin:
                        self.active_position = {"side": "short", "entry_price": price, "amount": amount}
                        logger.debug(f"[PAPER-FUTURES] Opened SHORT at {price}. Cost: {cost}, Margin: {required_margin}")
                    else:
                        logger.warning(f"[PAPER-FUTURES] Insufficient quote for SHORT. Need {required_margin}, have {self.paper_balance_quote}")
                        return None
        else:
            # Spot Paper Logic
            strategy_mode = getattr(self, 'strategy_mode', 'long')
            
            if strategy_mode == 'short':
                if side == "sell":
                    # Entry for Accumulation Mode
                    if not self.active_position:
                        # Auto-fund base asset from quote asset for the first trade simulation
                        if self.paper_balance_base < amount:
                            logger.info(f"[PAPER-SPOT] Auto-funding {amount} base asset for Accumulation Mode.")
                            cost_to_fund = amount * price
                            self.paper_balance_quote -= cost_to_fund
                            self.paper_balance_base += amount
                            
                    if self.paper_balance_base >= amount:
                        self.paper_balance_base -= amount
                        self.paper_balance_quote += cost
                        self.active_position = {"side": "short", "entry_price": price, "amount": amount}
                        logger.debug(f"[PAPER-SPOT] Sold {amount} {self.pair} at {price}. Value: {cost}")
                    else:
                        logger.warning(f"[PAPER-SPOT] Insufficient base balance for SELL. Need {amount}, have {self.paper_balance_base}")
                        return None
                elif side == "buy":
                    # Exit for Accumulation Mode
                    if self.paper_balance_quote >= cost:
                        self.paper_balance_quote -= cost
                        self.paper_balance_base += amount
                        self.active_position = None
                        logger.debug(f"[PAPER-SPOT] Bought {amount} {self.pair} at {price}. Cost: {cost}")
                    else:
                        logger.warning(f"[PAPER-SPOT] Insufficient balance for BUY. Need {cost}, have {self.paper_balance_quote}")
                        return None
            else:
                # Normal Long Mode
                if side == "buy":
                    if self.paper_balance_quote >= cost:
                        self.paper_balance_quote -= cost
                        self.paper_balance_base += amount
                        self.active_position = {"side": "long", "entry_price": price, "amount": amount}
                        logger.debug(f"[PAPER-SPOT] Bought {amount} {self.pair} at {price}. Cost: {cost}")
                    else:
                        logger.warning(f"[PAPER-SPOT] Insufficient balance for BUY. Need {cost}, have {self.paper_balance_quote}")
                        return None
                elif side == "sell":
                     if self.paper_balance_base >= amount:
                         self.paper_balance_base -= amount
                         self.paper_balance_quote += cost
                         self.active_position = None
                         logger.debug(f"[PAPER-SPOT] Sold {amount} {self.pair} at {price}. Value: {cost}")
                     else:
                         logger.warning(f"[PAPER-SPOT] Insufficient base balance for SELL. Need {amount}, have {self.paper_balance_base}")
                         return None
                 
        return {
            "id": trade_id,
            "side": side,
            "amount": amount,
            "price": price,
            "timestamp": timestamp,
            "status": "closed"
        }

    async def _execute_real(self, side: str, amount: float, price: float, order_type: str = "market", params: dict = None) -> Optional[Dict[str, Any]]:
        if not self.exchange:
            self.logger.error("[REAL] Missing exchange instance with API credentials.")
            return None
            
        try:
            # 1. Handle MEXC Market Order Restriction (Error 30041)
            # MEXC Spot often rejects MARKET orders via API. We convert them to "Marketable Limit Orders".
            final_order_type = order_type.lower()
            final_price = price
            
            if self.exchange_id == 'mexc' and final_order_type == 'market':
                self.logger.info(f"⚠️ [MEXC] Converting MARKET {side} to Marketable LIMIT to bypass 30041 error.")
                final_order_type = 'limit'
                # Use configured slippage buffer (default 1.0%)
                buffer_pct = self.config.get("limit_buffer", 1.0) / 100.0
                if side.lower() == 'buy':
                    final_price = price * (1 + buffer_pct)
                else:
                    final_price = price * (1 - buffer_pct)
            
            # 2. Precision Handling
            # Ensure amount and price meet exchange-specific decimal requirements
            symbol = self.pair
            try:
                if hasattr(self.exchange, 'amount_to_precision'):
                    amount = float(self.exchange.amount_to_precision(symbol, amount))
                if final_order_type == 'limit' and hasattr(self.exchange, 'price_to_precision'):
                    final_price = float(self.exchange.price_to_precision(symbol, final_price))
            except Exception as prec_e:
                self.logger.warning(f"Precision handling failed (normal if markets not loaded): {prec_e}")

            self.logger.info(f"[REAL] Executing {final_order_type.upper()} {side} order on {self.exchange_id} for {amount} {symbol} at {final_price if final_order_type == 'limit' else 'Market'}")
            
            order_params = params or {}
            
            # --- Inject Bot-Specific Client Order ID for Isolation ---
            if self.bot_id:
                # Generate a unique ID with bot-specific prefix
                # Format: WH_{bot_id}_{uuid_short}
                unique_ref = uuid.uuid4().hex[:12]
                client_id = f"WH_{self.bot_id}_{unique_ref}"
                
                # Exchange-specific parameter mapping
                if self.exchange_id in ['binance', 'binanceusdm', 'binancecoinm']:
                    order_params['newClientOrderId'] = client_id
                elif self.exchange_id in ['kucoin', 'kucoinfutures']:
                    order_params['clientOid'] = client_id
                else:
                    # Default for many others
                    order_params['clientOrderId'] = client_id
                    
                self.logger.info(f"[REAL] Tagging order with clientOrderId: {client_id}")
            
            # --- Kucoin Futures: marginMode is required ---
            if self.trading_mode == 'futures' and self.exchange_id in ['kucoin', 'kucoinfutures'] and 'marginMode' not in order_params:
                order_params['marginMode'] = self.margin_mode.upper()
            
            # --- Binance Futures Hedge Mode (Error -4061) Fix ---
            # In Hedge Mode, every order MUST have positionSide = LONG or SHORT.
            # In One-Way Mode, positionSide MUST be omitted.
            if (
                self.trading_mode == 'futures'
                and self.exchange_id in ['binance', 'binanceusdm', 'binancecoinm']
                and self.is_hedge_mode  # কেবল হেজ মোড অন থাকলে ইনজেক্ট হবে
                and 'positionSide' not in order_params
            ):
                # Determine positionSide from strategy context
                # BUY side: opening LONG or closing SHORT
                # SELL side: opening SHORT or closing LONG
                strategy_mode = getattr(self, 'strategy_mode', 'long').lower()
                reduce_only = order_params.get('reduceOnly', False)
                
                if reduce_only:
                    # This is a close/exit order — positionSide is opposite of side
                    # e.g. sell to close LONG → positionSide = LONG
                    # e.g. buy to close SHORT → positionSide = SHORT
                    if side.lower() == 'sell':
                        order_params['positionSide'] = 'LONG'
                    else:
                        order_params['positionSide'] = 'SHORT'
                else:
                    # This is an entry order — positionSide matches intent
                    if side.lower() == 'buy':
                        order_params['positionSide'] = 'LONG'
                    else:
                        order_params['positionSide'] = 'SHORT'
                        
                self.logger.info(f"[REAL] Binance Hedge Mode: injecting positionSide={order_params['positionSide']} (reduceOnly={reduce_only})")
            
            order = await self.exchange.create_order(
                symbol=symbol,
                type=final_order_type,
                side=side.lower(),
                amount=amount,
                price=final_price if final_order_type in ['limit', 'stop'] else None,
                params=order_params
            )
            return order
        except Exception as e:
            self.logger.error(f"[REAL] Order execution failed for {side} {amount} {self.pair} at {price}: {e}")
            return None

    async def cancel_order(self, order_id: str) -> bool:
        """Cancels an existing limit order"""
        if self.is_paper_trading:
            self.logger.info(f"[PAPER] Cancelled order {order_id}")
            return True
            
        if not self.exchange:
            return False
            
        try:
            await self.exchange.cancel_order(order_id, self.pair)
            self.logger.info(f"[REAL] Cancelled order {order_id} on {self.exchange_id}")
            return True
        except Exception as e:
            self.logger.error(f"[REAL] Failed to cancel order {order_id}: {e}")
            return False

class OrderBlockBotTask:
    """
    The main asynchronous bot worker that ties Detection and Execution together.
    """
    def __init__(self, bot_id: int, config: Dict[str, Any]):
        self.bot_id = bot_id
        self.config = config
        self.pair = config.get("pair")
        self.exchange_id = config.get("exchange", "binance").lower()
        self.trade_amount = config.get("trade_amount", 0.01) # Base currency amount
        
        self.detector = OrderBlockDetector(volume_threshold_multiplier=config.get("threshold_multiplier", 3.0))
        self.engine = OrderBlockExecutionEngine(config)
        self.margin_mode = config.get("margin_mode", "cross").lower()
        
        self.running = False
        self._task: Optional[asyncio.Task] = None
        
        # We will use CCXT just to fetch public orderbook data rapidly for detection
        self._public_exchange = getattr(ccxt, self.exchange_id)({'enableRateLimit': True})

    async def start(self):
        self.running = True
        logger.info(f"Order Block Bot {self.bot_id} started for {self.pair}")
        await self._log(f"Bot started. Searching for order blocks on {self.pair}...")
        self._task = asyncio.create_task(self._run_loop())

    async def stop(self):
        self.running = False
        if self._task:
            self._task.cancel()
        await self._public_exchange.close()
        logger.info(f"Order Block Bot {self.bot_id} stopped.")
        await self._log("Bot stopped.")

    async def _log(self, message: str, level: str = "info", data: dict = None):
        """
        Broadcast logs to Redis so they stream to the frontend via WS.
        """
        redis = redis_manager.get_redis()
        if not redis: return
        
        log_payload = {
            "channel": f"logs_{self.bot_id}",
            "data": {
                "timestamp": time.time(),
                "level": level,
                "message": message,
                "data": data
            }
        }
        await redis.publish("bot_logs", json.dumps(log_payload))

    async def _run_loop(self):
        try:
            while self.running:
                # 1. Fetch live order book
                try:
                    orderbook = await self._public_exchange.fetch_order_book(self.pair, limit=50)
                except Exception as e:
                    await self._log(f"Error fetching order book: {e}", "error")
                    await asyncio.sleep(2)
                    continue

                # 2. Detect Smart Money Blocks
                support_blocks = self.detector.detect_blocks(orderbook, "bids")
                resistance_blocks = self.detector.detect_blocks(orderbook, "asks")

                all_blocks = support_blocks + resistance_blocks
                if all_blocks:
                    # Notify frontend visually
                    await self._log(f"Detected {len(all_blocks)} order block(s)", "info", {"blocks": all_blocks})

                # 3. Strategy Logic (Extremely basic for demonstration)
                # If we detect major support (big bid wall) near the current spread, go Long.
                # If we detect major resistance (big ask wall) near the spread, go Short/Sell.
                
                # Fetch current price briefly
                ticker = await self._public_exchange.fetch_ticker(self.pair)
                current_price = ticker.get('last')
                
                if current_price and not self.engine.active_position:
                    # Look for a support block close to current price (e.g. within 0.5%)
                    for b in support_blocks:
                        if (current_price - b['price']) / b['price'] < 0.005:
                            await self._log(f"Price approaching massive support wall at {b['price']}. Executing BUY.", "warn")
                            trade_res = await self.engine.execute_trade("buy", self.trade_amount, current_price)
                            if trade_res:
                                await self._log(f"BUY executed at {current_price}", "success", {"trade": trade_res})
                            break
                            
                elif current_price and self.engine.active_position:
                     entry = self.engine.active_position['entry_price']
                     # Exit logic: if we are near a resistance block, or simply taking 1% profit
                     for b in resistance_blocks:
                         if (b['price'] - current_price) / current_price < 0.005:
                             await self._log(f"Price approaching resistance block at {b['price']}. Executing SELL.", "warn")
                             trade_res = await self.engine.execute_trade("sell", self.trade_amount, current_price)
                             if trade_res:
                                 await self._log(f"SELL executed at {current_price}", "success", {"trade": trade_res})
                             break
                     
                     # Simple TP/SL
                     if (current_price - entry) / entry >= 0.01: # 1% TP
                         trade_res = await self.engine.execute_trade("sell", self.trade_amount, current_price)
                         await self._log(f"Take profit executed at {current_price}", "success", {"trade": trade_res})
                     elif (entry - current_price) / entry >= 0.01: # 1% SL
                         trade_res = await self.engine.execute_trade("sell", self.trade_amount, current_price)
                         await self._log(f"Stop loss executed at {current_price}", "error", {"trade": trade_res})

                # Poll interval
                await asyncio.sleep(2)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Bot Task crashed: {e}")
            await self._log(f"Bot crashed: {e}", "error")
