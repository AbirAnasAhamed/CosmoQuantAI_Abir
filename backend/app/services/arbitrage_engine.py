import asyncio
import ccxt.async_support as ccxt
import json
import time
from redis import asyncio as aioredis
from app.core.config import settings
from app.services.notification import NotificationService
from app.db.session import SessionLocal
from app.services.trading import execute_large_order

class ArbitrageBotInstance:
    def __init__(self, user_id: int, config: dict):
        self.user_id = user_id
        self.config = config
        self.is_running = False
        self.redis = None
        self.exchange_a = None
        self.exchange_b = None
        
        # Paper Trading State
        # Strict user choice: defaults to False (Real) only if expicitly set, otherwise be careful.
        # Actually proper logic: default to Paper if not specified, but respect config["is_paper_trading"] if present.
        self.is_paper_trading = config.get("is_paper_trading", True) 
        self.paper_balance = 1000.0 # Virtual $1000 USDT to start
        
        # Panic Key
        self.panic_key = f"GLOBAL_KILL_SWITCH:{self.user_id}"

        # Trailing Stop Loss State
        self.trailing_stop_percentage = float(config.get("trailing_stop_percentage", 0.0))
        self.highest_price = 0.0

    async def _log(self, message: str, type: str = "info"):
        """Redis Pub/Sub এর মাধ্যমে ফ্রন্টএন্ডে লগ পাঠানো"""
        if not self.redis:
            self.redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        
        log_entry = {
            "timestamp": time.strftime("%H:%M:%S"),
            "message": message,
            "type": type
        }
        await self.redis.publish(f"arbitrage:logs:{self.user_id}", json.dumps(log_entry))
        
        # Also print to backend terminal (stdout)
        print(f"[{type.upper()}] {message}", flush=True)

    async def _init_exchanges(self):
        """ডাইনামিকালি এক্সচেঞ্জ কানেক্ট করা"""
        ex_a_name = self.config.get("exchange_a", "binance").lower()
        ex_b_name = self.config.get("exchange_b", "kraken").lower()
        
        # CCXT ক্লাস লোড করা
        ex_class_a = getattr(ccxt, ex_a_name)
        ex_class_b = getattr(ccxt, ex_b_name)

        # Paper Trading হলে API Key ছাড়াই লোড হবে (Public Data Only)
        if self.is_paper_trading:
            self.exchange_a = ex_class_a({'enableRateLimit': True, 'options': {'adjustForTimeDifference': True},})
            self.exchange_b = ex_class_b({'enableRateLimit': True, 'options': {'adjustForTimeDifference': True},})
            await self._log(f"🧪 Paper Trading Mode Active. Using Public Data for {ex_a_name} & {ex_b_name}.", "warning")
        else:
            # Real Trading (API Keys required)
            self.exchange_a = ex_class_a({
                'apiKey': self.config.get("apiKeyA_public"),
                'secret': self.config.get("apiKeyA_secret"),
                'enableRateLimit': True, 'options': {'adjustForTimeDifference': True},
            })
            self.exchange_b = ex_class_b({
                'apiKey': self.config.get("apiKeyB_public"),
                'secret': self.config.get("apiKeyB_secret"),
                'enableRateLimit': True, 'options': {'adjustForTimeDifference': True},
            })

    async def _perform_initial_balancing(self):
        """Auto-Balancing Logic: Ensure we have enough Base Asset on both exchanges"""
        if not self.config.get("auto_balance", False):
            return

        pair = self.config.get('pair', 'BTC/USDT')
        base_currency, quote_currency = pair.split('/')
        
        await self._log(f"⚖️ performing Initial Balance Check for {base_currency}...", "info")

        if self.is_paper_trading:
             # Simulation Logic
             await self._log("🧪 Auto-Balance (Paper): Simulating 50% Portfolio Rebalance...", "warning")
             await asyncio.sleep(1)
             return

        # --- REAL TRADING LOGIC ---
        try:
            exchanges = [
                ('A', self.exchange_a),
                ('B', self.exchange_b)
            ]
            
            for label, exchange in exchanges:
                try:
                    balance = await exchange.fetch_balance()
                    base_bal = balance.get(base_currency, {}).get('free', 0.0)
                    quote_bal = balance.get(quote_currency, {}).get('free', 0.0)
                    
                    # Fetch current price to estimate value
                    ticker = await exchange.fetch_ticker(pair)
                    current_price = ticker['last']
                    base_value_usd = base_bal * current_price
                    
                    await self._log(f"🏦 Exchange {label} Balances: {base_bal:.4f} {base_currency} (${base_value_usd:.2f}) | {quote_bal:.2f} {quote_currency}", "info")
                    
                    # Threshold: If < $10 worth of Base Asset
                    if base_value_usd < 10.0:
                         await self._log(f"⚠️ Low {base_currency} on Exchange {label} (<$10). Triggering Auto-Rebalance...", "warning")
                         
                         # Action: Buy with 50% of available USDT
                         if quote_bal > 10.0: # Ensure we have at least $10 USDT
                             amount_to_spend = quote_bal * 0.50
                             amount_in_base = amount_to_spend / current_price
                             
                             await self._log(f"⚖️ Auto-Buying {amount_in_base:.4f} {base_currency} (${amount_to_spend:.2f}) on {label}...", "warning")
                             
                             order = await exchange.create_market_buy_order(pair, amount_in_base)
                             await self._log(f"✅ Auto-Balance SUCCESS: Bought {amount_in_base:.4f} {base_currency}. Order ID: {order['id']}", "success")
                             
                             # Wait for settlement
                             await asyncio.sleep(3)
                         else:
                             await self._log(f"❌ Cannot Auto-Balance on {label}: Insufficient {quote_currency} (${quote_bal:.2f})", "error")

                except Exception as ex:
                     await self._log(f"❌ Auto-Balance Error on {label}: {str(ex)}", "error")

        except Exception as e:
            await self._log(f"🔥 Critical Auto-Balance Failure: {str(e)}", "error")

    async def start(self):
        self.is_running = True
        await self._init_exchanges()
        
        # 0. Initial Auto-Balancing
        await self._perform_initial_balancing()
        
        pair = self.config.get('pair', 'BTC/USDT')
        min_spread = float(self.config.get('min_spread', 0.5))

        await self._log(f"🚀 Engine Started: Monitoring {pair}...", "success")

        # Notification: Bot Started
        try:
            with SessionLocal() as db:
                mode_str = "🧪 Paper Trading" if self.is_paper_trading else "🔥 REAL TRADING"
                msg = f"🚀 Arbitrage Bot Started!\n\nMode: {mode_str}\nPair: {pair}"
                await NotificationService.send_message(db, self.user_id, msg)
        except Exception as e:
            print(f"Failed to send start notification: {e}")

        try:
            while self.is_running:
                # 0. Panic Check
                if self.redis:
                    panic_status = await self.redis.get(self.panic_key)
                    if panic_status == "true":
                        await self._log("🚨 PANIC BUTTON ACTIVATED! Engine Stopping Immediately.", "error")
                        break

                # ১. প্যারালাল প্রাইস ফেচিং (Real Market Data)
                tasks = [
                    self.exchange_a.fetch_ticker(pair),
                    self.exchange_b.fetch_ticker(pair)
                ]
                results = await asyncio.gather(*tasks, return_exceptions=True)
                
                # এরর হ্যান্ডলিং
                if isinstance(results[0], Exception) or isinstance(results[1], Exception):
                    await self._log("⚠️ Error fetching prices. Retrying...", "error")
                    await asyncio.sleep(2)
                    continue

                ticker_a = results[0]
                ticker_b = results[1]
                
                price_a = ticker_a['last'] # Buy Price
                price_b = ticker_b['last'] # Sell Price

                # ২. স্প্রেড ক্যালকুলেশন
                # ধরি A তে কিনে B তে বেচব
                diff = price_b - price_a
                spread_percent = (diff / price_a) * 100

                # Heartbeat Log (Every 3 seconds)
                log_msg = f"💓 Heartbeat: {self.exchange_a.id}(${price_a}) vs {self.exchange_b.id}(${price_b}) | Spread: {spread_percent:.4f}%"
                await self._log(log_msg, "info")

                # --- TRAILING STOP LOSS CHECK ---
                if self.trailing_stop_percentage > 0:
                    # Track Highest Price (using Sell Price from Exchange B as reference)
                    if price_b > self.highest_price:
                        self.highest_price = price_b
                        # Optional: Log new high? Too spammy.
                    
                    # Check Drop
                    drop_threshold = self.highest_price * (1 - (self.trailing_stop_percentage / 100))
                    
                    if price_b < drop_threshold:
                         await self._log(f"🛑 TRAILING STOP TRIGGERED! Price ${price_b} dropped below ${drop_threshold:.2f} (High: ${self.highest_price})", "error")
                         await self._trigger_panic_sell(pair, price_b)
                         break # Stop Engine after Panic Sell

                # ৩. সুযোগ পেলে ট্রেড এক্সিকিউশন (Virtual or Real)
                if spread_percent >= min_spread:
                    if self.config.get('mode') == 'auto':
                        await self._execute_trade(pair, price_a, price_b, spread_percent)
                    else:
                        await self._log(f"🔔 Opportunity! Spread {spread_percent:.2f}% found. Waiting for confirmation.", "warning")

                await asyncio.sleep(3) 

        except Exception as e:
            await self._log(f"🔥 Critical Error: {str(e)}", "error")
        finally:
            await self.stop()

    async def _execute_trade(self, pair, buy_price, sell_price, spread):
        """ট্রেড এক্সিকিউশন লজিক (Paper vs Real)"""
        trade_amount = float(self.config.get('trade_amount', 100)) # Trade size in USD

        if self.is_paper_trading:
            # --- SIMULATION LOGIC ---
            # ফি ধরা যাক 0.1% প্রতি এক্সচেঞ্জে
            fees = trade_amount * 0.002 
            gross_profit = (trade_amount * (spread / 100))
            net_profit = gross_profit - fees
            
            self.paper_balance += net_profit
            
            msg = (
                f"🧪 PAPER TRADE: Buy {pair} @ {buy_price} -> Sell @ {sell_price}\n"
                f"   Spread: {spread:.2f}% | Profit: ${net_profit:.2f} | Virtual Balance: ${self.paper_balance:.2f}"
            )
            await self._log(msg, "success")

            # Notification Trigger (Paper)
            try:
                with SessionLocal() as db:
                     await NotificationService.send_message(db, self.user_id, msg)
            except Exception as e:
                print(f"Failed to send notification: {e}")
        
        else:
            # --- REAL EXECUTION LOGIC (Use with Caution!) ---
            try:
                # 0. Balance Check
                # Before checking balance, ensure we have the latest payload or just call fetch_balance
                # Optimize: We can do a quick check on the specific currency.
                # Assuming 'BTC/USDT', we need USDT on Exchange A and BTC on Exchange B (if we already held it).
                # But arbitrage usually implies:
                # 1. Buy Low at A (Needs USDT)
                # 2. Sell High at B (Needs Base Asset e.g., BTC, OR we are doing parallel arb where we hold both)
                
                # For this simple "Triangular/ Spatial" Arbitrage where we move funds (slow),
                # Or standard where we assume we hold USDT on A and Asset on B.
                # Let's assume standard "Buy at A, Sell at B" flow.
                
                base_currency, quote_currency = pair.split('/')
                
                # Check USDT balance on A
                balance_a = await self.exchange_a.fetch_balance()
                usdt_balance_a = balance_a.get(quote_currency, {}).get('free', 0.0)
                
                required_usdt = trade_amount  # Approx
                
                if usdt_balance_a < required_usdt:
                     raise Exception(f"Insufficient {quote_currency} balance on {self.exchange_a.id}. Has {usdt_balance_a}, Needs {required_usdt}")

                # 1. Buy at Exchange A (Low Price)
                await self._log(f"Executing REAL BUY on {self.exchange_a.id}...", "info")
                
                # Check for SOR
                sor_threshold = float(self.config.get('sor_threshold', 1000.0))
                is_sor_enabled = self.config.get('sor_enabled', False)
                amount_in_base = trade_amount / buy_price
                
                if is_sor_enabled and trade_amount > sor_threshold:
                    await self._log(f"⚡ Large Order Detected (${trade_amount} > ${sor_threshold}). Engaging Smart Order Routing (SOR)...", "warning")
                    
                    # BUY via SOR
                    buy_orders = await execute_large_order(self.exchange_a, pair, amount_in_base, 'buy')
                    
                    # Aggregate results
                    total_filled = sum([o.get('amount', 0) for o in buy_orders])
                    avg_price = sum([o.get('price', buy_price) * o.get('amount', 0) for o in buy_orders]) / total_filled if total_filled > 0 else buy_price
                    
                    buy_order = {
                        'id': f"SOR-GROUP-{buy_orders[0]['id']}",
                        'price': avg_price,
                        'amount': total_filled
                    }
                    await self._log(f"🔵 SOR BUY COMPLETE: {total_filled} {pair} avg @ {avg_price}", "success")
                    
                else:
                    # Normal Buy
                    buy_order = await self.exchange_a.create_market_buy_order(pair, amount_in_base)
                    await self._log(f"🔵 REAL BOUGHT {pair} on {self.exchange_a.id}. ID: {buy_order['id']} Price: {buy_order.get('price', buy_price)} Amount: {buy_order.get('amount', amount_in_base)}", "success")

                # 2. Sell at Exchange B (High Price)
                try:
                    sell_amount = buy_order.get('amount', amount_in_base)
                    
                    if is_sor_enabled and trade_amount > sor_threshold:
                        await self._log(f"⚡ SOR Selling on {self.exchange_b.id}...", "warning")
                         # SELL via SOR
                        sell_orders = await execute_large_order(self.exchange_b, pair, sell_amount, 'sell')
                        
                        total_sold = sum([o.get('amount', 0) for o in sell_orders])
                        avg_sell_price = sum([o.get('price', sell_price) * o.get('amount', 0) for o in sell_orders]) / total_sold if total_sold > 0 else sell_price
                        
                        sell_order = {
                            'id': f"SOR-GROUP-{sell_orders[0]['id']}",
                            'price': avg_sell_price
                        } 
                        await self._log(f"🟢 SOR SELL COMPLETE: {total_sold} {pair} avg @ {avg_sell_price}", "success")
                        
                    else:
                        # Normal Sell
                        sell_order = await self.exchange_b.create_market_sell_order(pair, sell_amount)
                        await self._log(f"🟢 REAL SOLD {pair} on {self.exchange_b.id}. ID: {sell_order['id']} Price: {sell_order.get('price', sell_price)}", "success")

                    # Notification Trigger (Real)
                    try:
                        with SessionLocal() as db:
                             notify_msg = f"🚀 REAL TRADE EXECUTED!\n\n🔵 Buy {pair} on {self.exchange_a.id} @ {buy_order.get('price', buy_price)}\n🟢 Sell on {self.exchange_b.id} @ {sell_order.get('price', sell_price)}"
                             await NotificationService.send_message(db, self.user_id, notify_msg)
                    except Exception as e:
                        print(f"Failed to send real trade notification: {e}")
                    
                except Exception as sell_err:
                     # CRITICAL: Bought but failed to sell
                     await self._log(f"🔥 CRITICAL ERROR: BOUGHT on {self.exchange_a.id} but FAILED to SELL on {self.exchange_b.id}: {str(sell_err)}", "error")
                     # TODO: Trigger Emergency Stop or Retry Logic
                     # raise sell_err # Re-raise to catch in outer

                # 3. Save Trade to Database (Optional)
                # self.save_trade_to_db(...)

            except Exception as e:
                # If Buy fails, or general error
                await self._log(f"🔴 TRADE FAILED: {str(e)}", "error")

    async def stop(self):
        # Stop Log
        if self.is_running:
            await self._log("🛑 Engine Stopped via User Request.", "warning")
            
            # Notification: Bot Stopped
            try:
                with SessionLocal() as db:
                    msg = "🛑 Arbitrage Bot Stopped."
                    await NotificationService.send_message(db, self.user_id, msg)
            except Exception as e:
                print(f"Failed to send stop notification: {e}")
            
        self.is_running = False
        if self.exchange_a:
            await self.exchange_a.close()
        if self.exchange_b:
            await self.exchange_b.close()
        if self.redis:
            await self.redis.close()

    async def _trigger_panic_sell(self, pair, current_price):
        """Emergency Sell Logic when Stop Loss is triggered"""
        await self._log("🚨 EXECUTING PANIC SELL...", "error")
        
        if self.is_paper_trading:
            # Paper Panic Sell
            # Assuming we are "long" the asset (based on trade_amount? Or just closing hypothetical position)
            # Since this is an arbitrage bot, 'position' is ambiguous unless we track inventory.
            # We will simulate selling the 'trade_amount' we usually trade.
             trade_amount = float(self.config.get('trade_amount', 100))
             estimated_value = trade_amount # Roughly
             
             msg = f"🧪 PAPER PANIC SELL: Sold ${trade_amount} worth of {pair} @ {current_price}. STOP LOSS EXECUTED."
             await self._log(msg, "warning")
             
             try:
                with SessionLocal() as db:
                     await NotificationService.send_message(db, self.user_id, msg)
             except Exception:
                 pass

        else:
            # Real Panic Sell
            try:
                # Sell ALL available Balance of Base Asset on Exchange B (and A?)
                # Usually we dump on the liquid exchange.
                base_currency = pair.split('/')[0]
                
                # Check Balance on B
                bal_b = await self.exchange_b.fetch_balance()
                amount_b = bal_b.get(base_currency, {}).get('free', 0.0)
                
                if amount_b > 0:
                     order = await self.exchange_b.create_market_sell_order(pair, amount_b)
                     await self._log(f"🔴 REAL PANIC SELL on {self.exchange_b.id}: Sold {amount_b} {base_currency}", "success")
                else:
                     await self._log(f"⚠️ No balance to panic sell on {self.exchange_b.id}", "warning")

            except Exception as e:
                await self._log(f"🔥 PANIC SELL FAILED: {str(e)}", "error")

# গ্লোবাল ভেরিয়েবল যা রানিং বটগুলোকে মেমোরিতে ধরে রাখবে
# { user_id: ArbitrageBotInstance }
running_arbitrage_bots = {}
