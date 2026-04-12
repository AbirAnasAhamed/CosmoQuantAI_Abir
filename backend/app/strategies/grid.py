import asyncio
import ccxt.async_support as ccxt
import time
import json
import logging
from redis import asyncio as aioredis
from typing import List, Optional, Tuple
from sqlalchemy.orm import Session
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.grid import GridBot, GridOrder

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class GridTradingBot:
    def __init__(self, bot_id: int, config: dict):
        self.bot_id = bot_id
        self.config = config
        self.user_id = config.get("user_id")
        self.is_running = False
        self.redis = None
        self.exchange = None
        self.db: Session = SessionLocal()
        
        # Dual Mode Flag
        self.is_paper = config.get("is_paper_trading", True)

    async def _log(self, message: str, type: str = "info"):
        if not self.redis:
            self.redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        
        log_entry = {
            "timestamp": time.strftime("%H:%M:%S"),
            "message": message,
            "type": type,
            "bot_id": self.bot_id
        }
        try:
            await self.redis.publish(f"gridbot:logs:{self.bot_id}", json.dumps(log_entry))
            print(f"[GRID {self.bot_id}][{'PAPER' if self.is_paper else 'REAL'}] {message}", flush=True)
        except Exception as e:
            print(f"Redis logging failed: {e}")

    async def _init_exchange(self):
        ex_name = self.config.get("exchange", "binance").lower()
        ex_class = getattr(ccxt, ex_name)
        
        exchange_config = {
            'enableRateLimit': True, 'options': {'adjustForTimeDifference': True},
            'options': {'defaultType': 'spot'}
        }

        if not self.is_paper:
            exchange_config.update({
                'apiKey': self.config.get("apiKey"),
                'secret': self.config.get("apiSecret"),
            })
            await self._log(f"🔐 Real Trading Active on {ex_name}.", "warning")
        else:
            await self._log(f"🧪 Paper Trading Active on {ex_name}.", "warning")
            
        self.exchange = ex_class(exchange_config)
        # Even in paper mode, we use exchange for ticker price

    # --- Dual Mode Abstraction Methods ---

    async def _get_balance(self, quote_currency: str) -> float:
        """
        Returns the User's Quote Asset Balance.
        - Paper: From Database `paper_balance_current`
        - Real: From Exchange Wallet
        """
        if self.is_paper:
            # Refresh bot status to get latest balance
            bot = self.db.query(GridBot).filter(GridBot.id == self.bot_id).first()
            if bot:
                return bot.paper_balance_current
            return 0.0
        else:
            try:
                balance = await self.exchange.fetch_balance()
                return balance.get(quote_currency, {}).get('free', 0.0)
            except Exception as e:
                await self._log(f"Failed to fetch real balance: {e}", "error")
                return 0.0

    async def _place_order_dual(self, side: str, price: float, quantity: float) -> Optional[GridOrder]:
        """
        Unified Order Placement
        """
        pair = self.config.get("pair")
        order_id = f"sim_{side}_{int(time.time()*100000)}" # default fake ID
        status = "open"
        
        if self.is_paper:
            # Simulate Fee Deduction immediately? No, usually on Fill.
            await self._log(f"🧪 Placing Paper {side.upper()} @ {price:.2f} (Qty: {quantity})", "info")
            pass
        else:
            try:
                # Real Order
                market = self.exchange.market(pair)
                price = self.exchange.price_to_precision(pair, price)
                quantity = self.exchange.amount_to_precision(pair, quantity)

                if side == 'buy':
                    order = await self.exchange.create_limit_buy_order(pair, quantity, price)
                else:
                    order = await self.exchange.create_limit_sell_order(pair, quantity, price)
                
                order_id = str(order['id'])
                await self._log(f"📢 Placed Real {side.upper()} @ {price} (ID: {order_id})", "info")
            except Exception as e:
                await self._log(f"❌ Real Order Failed: {e}", "error")
                return None

        # Save to DB (Unified for both modes)
        new_order = GridOrder(
            bot_id=self.bot_id,
            order_id=order_id,
            price=price,
            quantity=quantity,
            side=side,
            status=status
        )
        self.db.add(new_order)
        self.db.commit()
        return new_order

    async def _check_order_status_dual(self, open_orders: List[GridOrder], current_price: float):
        """
        Syncs order status.
        - Paper: Checks if Price crossed Limit Price.
        - Real: Fetches status from Exchange.
        """
        pair = self.config.get("pair")
        
        for order in open_orders:
            is_filled = False
            
            if self.is_paper:
                # Simulation Logic
                # BUY filled if Market Price <= Order Price
                # SELL filled if Market Price >= Order Price
                if order.side == 'buy' and current_price <= order.price:
                    is_filled = True
                elif order.side == 'sell' and current_price >= order.price:
                    is_filled = True
            
            else:
                # Real Logic
                try:
                    ex_order = await self.exchange.fetch_order(order.order_id, pair)
                    status = ex_order['status']
                    if status == 'closed':
                        is_filled = True
                        # Update actual filled price/qty if slightly different?
                    elif status == 'canceled' or status == 'expired':
                        order.status = 'cancelled'
                        self.db.commit()
                except Exception as e:
                    logger.error(f"Sync Error for {order.order_id}: {e}")

            if is_filled:
                order.status = 'filled'
                self.db.commit()
                await self._handle_filled_order(order)


    async def _handle_filled_order(self, order: GridOrder):
        """
        Core Grid Logic: Place Counter-Order & Update Metrics (Paper & Real)
        """
        fee_rate = 0.001 
        bot = self.db.query(GridBot).filter(GridBot.id == self.bot_id).first()
        
        # 1. Update Paper Wallet if Paper Mode
        if self.is_paper and bot:
            cost = order.price * order.quantity
            fee = cost * fee_rate
            
            if order.side == 'buy':
                # Spent Quote, Gained Base
                bot.paper_balance_current -= cost # In paper we assume we had the quote logic valid
                bot.paper_asset_quantity += (order.quantity * (1 - fee_rate))
            else:
                # Sold Base, Gained Quote
                revenue = cost * (1 - fee_rate)
                bot.paper_balance_current += revenue
                bot.paper_asset_quantity -= order.quantity
            
            self.db.commit()

        # 2. Calculate Next Grid Step
        lower = float(self.config["lower_limit"])
        upper = float(self.config["upper_limit"])
        count = int(self.config["grid_count"])
        step = (upper - lower) / count
        
        if order.side == 'buy':
            # Place Sell Higher
            sell_price = order.price + step
            # Qty: Sell what we bought (minus fees if removed from qty)
            # Simplified: Sell same qty
            qty = order.quantity 
            
            await self._log(f"✅ BUY Filled @ {order.price}. Placing Sell @ {sell_price:.2f}", "success")
            await self._place_order_dual('sell', sell_price, qty)
            
        elif order.side == 'sell':
            # Place Buy Lower
            buy_price = order.price - step
            qty = order.quantity # Rebuy same amount of base? Or same quote value?
            # Standard Grid: Keep Base Qty constant often, or Quote Qty constant.
            # Let's keep Quote Value constant roughly:
            quote_val = float(self.config["amount_per_grid"])
            qty = quote_val / buy_price
            
            # Profit Calc (Approx per grid cycle)
            profit = (step * order.quantity) - (order.price * order.quantity * fee_rate * 2) # approx 2x fees
            if bot:
                bot.total_profit += max(0, profit)
                bot.current_cycle_count += 1
                self.db.commit()
            
            await self._log(f"✅ SELL Filled @ {order.price}. Profit: ~${profit:.2f}. Placing Buy @ {buy_price:.2f}", "success")
            await self._place_order_dual('buy', buy_price, qty)


    def _calculate_grids(self, current_price):
        lower = float(self.config["lower_limit"])
        upper = float(self.config["upper_limit"])
        count = int(self.config["grid_count"])
        step = (upper - lower) / count
        grids = []
        for i in range(count + 1):
            price = lower + (i * step)
            if price < current_price:
                grids.append({"price": price, "type": "buy"})
            elif price > current_price:
                grids.append({"price": price, "type": "sell"})
        return grids

    async def start(self):
        self.is_running = True
        pair = self.config.get("pair")
        base, quote = pair.split('/') # e.g. BTC/USDT -> BTC, USDT
        
        try:
            await self._init_exchange()
            if not self.is_paper:
                await self.exchange.load_markets() # Important for precision

            await self._log(f"🚀 {'PAPER' if self.is_paper else 'REAL'} Bot Starting on {pair}...", "success")
            
            # 1. Check Initial Balance
            balance = await self._get_balance(quote)
            req_per_grid = float(self.config.get("amount_per_grid", 10.0))
            
            if balance < req_per_grid:
                await self._log(f"❌ Insufficient {quote} Balance: {balance:.2f}. Need > {req_per_grid}", "error")
                if not self.is_paper:
                    # For paper, maybe we allow negative if not initialized? 
                    # But better to enforce valid paper balance.
                    pass
            else:
                 await self._log(f"💰 Balance: {balance:.2f} {quote}", "info")


            # 2. Reconcile / Initialize
            existing_orders = self.db.query(GridOrder).filter(GridOrder.bot_id == self.bot_id, GridOrder.status == 'open').all()
            
            if existing_orders:
                 # Already running: Just sync status
                 # To get current price for paper sync
                 ticker = await self.exchange.fetch_ticker(pair)
                 current_price = ticker['last']
                 await self._check_order_status_dual(existing_orders, current_price)
                 await self._log(f"Resumed with {len(existing_orders)} open orders.")
            else:
                 # New Start
                 ticker = await self.exchange.fetch_ticker(pair)
                 current_price = ticker['last']
                 await self._log(f"Market Price: {current_price}")
                 
                 planned_grids = self._calculate_grids(current_price)
                 await self._log(f"Initializing {len(planned_grids)} grid levels...")
                 
                 for g in planned_grids:
                     # Calculate Qty based on amount_per_grid (Quote Value)
                     # Qty = QuoteAmt / Price
                     qty = req_per_grid / g['price']
                     await self._place_order_dual(g['type'], g['price'], qty)
                     await asyncio.sleep(0.1) 

            # 3. Main Loop
            while self.is_running:
                try:
                    # 1. Fetch Price
                    ticker = await self.exchange.fetch_ticker(pair)
                    current_price = ticker['last']
                    
                    # 2. Check Open Orders
                    # Optimization: Don't load all if too many. But for <100 grids ok.
                    open_orders = self.db.query(GridOrder).filter(GridOrder.bot_id == self.bot_id, GridOrder.status == 'open').all()
                    
                    if not open_orders:
                         # Maybe market moved out of range? 
                         # Optional: Dynamic grid adjustment could go here.
                         await asyncio.sleep(5)
                         continue
                         
                    await self._check_order_status_dual(open_orders, current_price)
                    
                    await asyncio.sleep(3) # Loop Delay

                except Exception as e:
                    await self._log(f"Loop Error: {e}", "error")
                    await asyncio.sleep(5)

        except Exception as e:
            await self._log(f"🔥 Critical Failure: {e}", "error")
            # Update DB status
            bot = self.db.query(GridBot).filter(GridBot.id == self.bot_id).first()
            if bot:
                bot.status_reason = str(e)
                # bot.is_active = False # Optional: Auto-stop on critical error
                self.db.commit()
        finally:
            await self.stop()

    async def stop(self):
        self.is_running = False
        
        # Log BEFORE closing connections
        await self._log("🛑 Bot Stopping...", "warning")

        if self.exchange:
            try:
                await self.exchange.close()
            except Exception as e:
                print(f"Error closing exchange: {e}")
        
        if self.redis:
            try:
                await self.redis.close()
            except Exception as e:
                print(f"Error closing redis: {e}")
            self.redis = None
            
        if self.db:
            try:
                self.db.close()
            except Exception as e:
                print(f"Error closing db: {e}")

