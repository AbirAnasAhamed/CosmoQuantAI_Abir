import asyncio
import queue
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Callable, Any
from .events import Event, EventType, MarketEvent, SignalEvent, OrderEvent, FillEvent
from .portfolio import Portfolio
from .market_maker import OrderBookGenerator
from fastapi import WebSocket

class DataHandler:
    """
    Simulates a live market feed by dripping historical data.
    For this implementation, we will generate synthetic random walk data
    to verify the event loop.
    """
    def __init__(self, symbol: str, events: asyncio.Queue):
        self.symbol = symbol
        self.events = events
        self.continue_backtest = True
        self.current_time = datetime.now() # Start time

    async def stream_data(self):
        """
        Generates synthetic market data and puts it into the queue.
        """
        price = 100.0
        import random
        
        # Simulate 100 bars for testing
        for i in range(100):
            if not self.continue_backtest:
                break
                
            # Simulate time passing (1 second per event)
            self.current_time += timedelta(seconds=1)
            
            # Random Walk
            move = random.uniform(-1.0, 1.0)
            price += move
            
            # Create Market Event
            event = MarketEvent(
                symbol=self.symbol,
                date=self.current_time,
                open_price=price,
                high=price + 0.5,
                low=price - 0.5,
                close=price + 0.1,
                volume=random.randint(100, 1000)
            )
            
            await self.events.put(event)
            # No sleep here! Speed is controlled by the Engine.

class SimulationStrategy:
    """
    A simple strategy for the simulation engine that supports hot-reloading parameters.
    """
    def __init__(self):
        # Default Parameters
        self.params = {
            "stop_loss": 0.01,   # 1%
            "take_profit": 0.02, # 2%
            "buy_probability": 0.2 # 20% chance to buy on signal check
        }
        print(f"Strategy Initialized with: {self.params}", flush=True)

    def update_parameters(self, new_params: dict):
        """
        Updates parameters safely.
        """
        for key, value in new_params.items():
            if key in self.params:
                # Basic validation (e.g. correct type)
                try:
                    # Convert to float if it's a number
                    if isinstance(self.params[key], float):
                        self.params[key] = float(value)
                    else:
                        self.params[key] = value
                    print(f"Updated {key} to {self.params[key]}", flush=True)
                except ValueError:
                    print(f"Invalid value for {key}: {value}", flush=True)
            else:
                print(f"Ignoring unknown parameter: {key}", flush=True)

    def calculate_signal(self, event: MarketEvent) -> Optional[SignalEvent]:
        """
        Determines if a signal should be generated based on current market data and parameters.
        """
        import random
        
        # Simple Logic: Randomly generate signal based on buy_probability
        # in a real strategy, this would check indicators
        if random.random() < self.params["buy_probability"]:
            signal_type = "LONG" if random.random() > 0.5 else "SHORT"
            
            return SignalEvent(
                strategy_id="SimHotReload",
                symbol=event.symbol,
                datetime=datetime.now(),
                signal_type=signal_type,
                strength=1.0
            )
        return None

class EventDrivenEngine:
    def __init__(self, symbol: str, websocket: WebSocket = None):
        self.events = asyncio.Queue()
        self.symbol = symbol
        self.data_handler = DataHandler(symbol, self.events)
        self.websocket = websocket
        self.running = False
        self.speed_multiplier: Optional[float] = None # None or 0 means Max Speed
        self.last_event_time: Optional[datetime] = None
        self.data_task: Optional[asyncio.Task] = None
        
        # Pause & Step Control
        self.is_paused = False
        self.step_trigger = asyncio.Event()

        # Strategy Instance
        self.strategy = SimulationStrategy()

        # Latency Simulation
        self.latency_ms: float = 0.0
        self.pending_orders: List[Dict[str, Any]] = []

        # Slippage Simulation
        self.slippage_pct: float = 0.0

        # Fee Structure (Default: Maker 0.1%, Taker 0.2%)
        self.maker_fee: float = 0.001 
        self.taker_fee: float = 0.002

        # Partial Fill Logic
        self.volume_participation_rate: float = 1.0 # 1.0 = 100% of volume
        self.current_market_event: Optional[MarketEvent] = None
        self.waiting_for_volume_orders: List[OrderEvent] = []

        # Portfolio Management
        self.portfolio = Portfolio(initial_cash=10000.0)

    def set_speed(self, speed: float):
        """
        Updates the playback speed dynamically.
        0 or None means "Max Speed" (no delay).
        1.0 means Real-time (1 second in data = 1 second in reality).
        10.0 means 10x speed (1 second in data = 0.1 second in reality).
        """
        if speed <= 0:
            self.speed_multiplier = None
        else:
            self.speed_multiplier = speed
        print(f"Speed set to: {self.speed_multiplier if self.speed_multiplier else 'MAX'}", flush=True)

    async def process_command(self, command: Dict[str, Any]):
        """
        Handles commands from WebSocket or API.
        """
        cmd_type = command.get("type")
        
        if cmd_type == "UPDATE_SPEED":
            speed = float(command.get("speed", 0))
            self.set_speed(speed)
            await self._send({"type": "SYSTEM", "message": f"Speed set to {speed}x"})
            
        elif cmd_type == "PAUSE":
            self.pause()
            await self._send({"type": "SYSTEM", "message": "Simulation Paused"})
            
        elif cmd_type == "RESUME":
            self.resume()
            await self._send({"type": "SYSTEM", "message": "Simulation Resumed"})
            
        elif cmd_type == "STEP":
            self.step()

        elif cmd_type == "UPDATE_PARAMS":
            new_params = command.get("params", {})
            self.strategy.update_parameters(new_params)
            await self._send({"type": "SYSTEM", "message": f"Strategy Params Updated: {new_params}"})

        elif cmd_type == "UPDATE_LATENCY":
            self.latency_ms = float(command.get("latency", 0))
            await self._send({"type": "SYSTEM", "message": f"Network Latency set to {self.latency_ms}ms"})

        elif cmd_type == "UPDATE_SLIPPAGE":
            self.slippage_pct = float(command.get("slippage", 0))
            await self._send({"type": "SYSTEM", "message": f"Slippage Model set to {self.slippage_pct}%"})

        elif cmd_type == "UPDATE_FEES":
            self.maker_fee = float(command.get("maker", 0.001))
            self.taker_fee = float(command.get("taker", 0.002))
            await self._send({"type": "SYSTEM", "message": f"Fees Updated: Maker {(self.maker_fee*100):.2f}%, Taker {(self.taker_fee*100):.2f}%"})

        elif cmd_type == "UPDATE_PARTICIPATION":
            self.volume_participation_rate = float(command.get("rate", 1.0))
            await self._send({"type": "SYSTEM", "message": f"Volume Participation Rate set to {(self.volume_participation_rate*100):.1f}%"})

    async def _send(self, data: Dict[str, Any]):
        """Helper to send WebSocket messages safely."""
        if self.websocket:
            try:
                await self.websocket.send_json(data)
            except Exception as e:
                print(f"Error sending WS message: {e}", flush=True)

    def pause(self):
        self.is_paused = True

    def resume(self):
        self.is_paused = False
        self.step_trigger.set()

    def step(self):
        self.step_trigger.set()

    async def run(self):
        """
        Main Event Loop.
        """
        self.running = True
        self.last_event_time = None
        
        # Start Data Feed in background
        self.data_task = asyncio.create_task(self.data_handler.stream_data())
        
        print("Starting Event Loop...", flush=True)
        await self._send({"type": "SYSTEM", "message": "Simulation Started"})

        while self.running:
            # --- Pause Logic ---
            if self.is_paused:
                await self._send({"type": "PAUSED_STATE", "value": True}) # Notify UI
                await self.step_trigger.wait()
                self.step_trigger.clear()
                await self._send({"type": "PAUSED_STATE", "value": False}) 
            # -------------------

            try:
                # Check for new events
                # Use a timeout to allow checking for other things if needed, though get() is fine
                event = await self.events.get()
            except asyncio.QueueEmpty:
                continue

            if event is None:
                break
            
            # --- Throttle Logic ---
            if hasattr(event, 'date') and event.date:
                current_event_time = event.date
                
                if self.last_event_time and self.speed_multiplier:
                    # Calculate simulation time difference
                    sim_diff = (current_event_time - self.last_event_time).total_seconds()
                    
                    if sim_diff > 0:
                        # Calculate real sleep time
                        real_sleep = sim_diff / self.speed_multiplier
                        await asyncio.sleep(real_sleep)
                
                self.last_event_time = current_event_time
            
            # --- Latency Simulation Logic ---
            # Check if any pending orders are ready to be executed based on current simulated time
            if self.last_event_time and self.pending_orders:
                ready_orders = []
                remaining_orders = []
                
                for item in self.pending_orders:
                    if self.last_event_time >= item['execute_at']:
                        ready_orders.append(item)
                    else:
                        remaining_orders.append(item)
                
                self.pending_orders = remaining_orders
                
                for item in ready_orders:
                    await self._execute_order(item['order'])
            # --------------------------------

            if event.type == EventType.MARKET:
                await self.handle_market_event(event)
            elif event.type == EventType.SIGNAL:
                await self.handle_signal_event(event)

            elif event.type == EventType.ORDER:
                await self.handle_order_event(event)

            elif event.type == EventType.FILL:
                await self.handle_fill_event(event)

        print("Event Loop Finished.", flush=True)
        await self._send({"type": "SYSTEM", "message": "Simulation Finished"})

    # ... (handlers remain unchanged) ...

    def stop(self):
        print("Stopping Event Loop...", flush=True)
        self.running = False
        self.is_paused = False # Unpause to allow exit
        self.step_trigger.set() # Wake up if waiting
        
        if self.data_task:
            self.data_task.cancel()

        # Drain the queue to ensure immediate stop
        while not self.events.empty():
            try:
                self.events.get_nowait()
            except asyncio.QueueEmpty:
                break
                
        try:
            self.events.put_nowait(None)
        except asyncio.QueueFull:
            pass

    async def log_event(self, level: str, message: str, metadata: Optional[Dict[str, Any]] = None):
        """
        Structured logging for the simulation.
        Levels: INFO, SUCCESS, WARNING, ERROR
        """
        # Use simulation time if available, else real time
        timestamp = self.last_event_time.isoformat() if self.last_event_time else datetime.now().isoformat()
        
        payload = {
            "type": "system_log",
            "level": level,
            "message": message,
            "timestamp": timestamp,
            "metadata": metadata or {}
        }
        await self._send(payload)
        # Print to console for server-side debugging
        print(f"[{level}] {message}", flush=True)

    async def handle_market_event(self, event: MarketEvent):
        # 0. Store current market event for volume checks
        self.current_market_event = event

        # 0.5 Re-queue waiting orders
        if self.waiting_for_volume_orders:
            # Move them back to pending execution
            # We treat them as "newly arrived" for this bar, executing immediately (plus latency if we wanted, but let's say they are ready)
            
            # Use last known time or current event time
            current_time = event.date
            execute_at = current_time # Ready now
            
            for order in self.waiting_for_volume_orders:
                 self.pending_orders.append({
                     "order": order,
                     "execute_at": execute_at
                 })
            
            # Clear waiting queue
            self.waiting_for_volume_orders = []

        # 1. Send Market Data to Frontend
        await self._send({
            "type": "MARKET",
            "symbol": event.symbol,
            "open": event.open,
            "high": event.high,
            "low": event.low,
            "close": event.close,
            "volume": event.volume,
            "time": event.date.isoformat()
        })

        # 1.5 Calculate and Broadcast Equity
        current_equity = self.portfolio.calculate_total_equity({event.symbol: event.close})
        await self._send({
            "type": "EQUITY_UPDATE",
            "value": current_equity,
            "time": event.date.isoformat()
        })
            
        # 1.6 Generate and Broadcast Order Book Snapshot
        order_book = OrderBookGenerator.generate_snapshot(event.close)
        await self._send({
            "type": "ORDER_BOOK",
            "bids": order_book["bids"],
            "asks": order_book["asks"],
            "time": event.date.isoformat()
        })
            
        # 2. Simulate Strategy interacting via Strategy Class
        signal = self.strategy.calculate_signal(event)
        if signal:
             await self.events.put(signal)

    async def handle_signal_event(self, event: SignalEvent):
        await self.log_event("INFO", f"Signal Received: {event.signal_type} on {event.symbol}")
            
        # Simulate Portfolio Manager generating an Order
        # Use simple risk logic relative to current price or hardcoded
        # Here we just blindly follow signal
        order = OrderEvent(
            symbol=event.symbol,
            order_type="MKT",
            quantity=1, # Fixed qty
            direction="BUY" if event.signal_type == "LONG" else "SELL"
        )
        await self.events.put(order)

    async def handle_order_event(self, event: OrderEvent):
         await self.log_event("INFO", f"Order Placed (Buffering {self.latency_ms}ms): {event.direction} {event.quantity} {event.symbol}")
         
         # Calculate execution time
         current_time = self.last_event_time if self.last_event_time else datetime.now()
         execute_at = current_time + timedelta(milliseconds=self.latency_ms)
         
         self.pending_orders.append({
             "order": event,
             "execute_at": execute_at
         })

    def apply_slippage(self, price: float, direction: str) -> float:
        """
        Calculates execution price with slippage and random noise.
        """
        import random
        
        # Base Slippage (Always against the trader)
        # BUY -> Pay More (Price increases)
        # SELL -> Get Less (Price decreases)
        
        slippage_factor = 1 + (self.slippage_pct / 100.0) if direction == "BUY" else 1 - (self.slippage_pct / 100.0)
        
        # Add slight Gaussian noise for realism (0.01% volatility on the slippage itself)
        noise = random.gauss(0, price * 0.0001) 
        
        # New base execution price
        exec_price = price * slippage_factor + noise
        
        return exec_price

    async def _execute_order(self, event: OrderEvent):
         # Simulate Execution Handler filling the order immediately
         # In real life, this would go to a broker API
         
         # Use last known time
         fill_time = self.last_event_time if self.last_event_time else datetime.now()
         
         # Assuming execution at last known close price (placeholder 100.0 if not available)
         # In a real engine, we'd look up self.data_handler.last_price
         market_price = 100.0 # Placeholder
         current_volume = 0
         
         if self.current_market_event:
             market_price = self.current_market_event.close
             current_volume = self.current_market_event.volume
         
         # --- Partial Fill Logic ---
         fill_qty = event.quantity
         is_partial = False
         
         # If we have volume data and participation rate < 1.0 (100%)
         if self.current_market_event and self.volume_participation_rate < 1.0:
             max_fillable = int(current_volume * self.volume_participation_rate)
             
             # If max_fillable is 0 (e.g. very low volume), we can't fill anything this bar
             if max_fillable == 0:
                 # Re-queue for next bar
                 if event not in self.waiting_for_volume_orders:
                     self.waiting_for_volume_orders.append(event)
                 
                 await self.log_event("WARNING", f"Order Waiting: Low Volume ({current_volume}) for Participation {(self.volume_participation_rate*100):.1f}%")
                 return

             if event.quantity > max_fillable:
                 fill_qty = max_fillable
                 is_partial = True
         # --------------------------

         # Apply Slippage
         exec_price = self.apply_slippage(market_price, event.direction)
         
         slippage_cost = abs(exec_price - market_price) * fill_qty
         
         if slippage_cost > 0.01:
             await self.log_event("WARNING", f"⚠ Slippage Applied: ${slippage_cost:.2f} difference")

         # Calculate Commission
         # Rule: MKT -> Taker Fee, LMT -> Maker Fee
         fee_rate = self.taker_fee if event.order_type == 'MKT' else self.maker_fee
         commission = exec_price * fill_qty * fee_rate

         fill = FillEvent(
             timestamp=fill_time,
             symbol=event.symbol,
             exchange="SIM_EXCHANGE",
             quantity=fill_qty,
             direction=event.direction,
             fill_cost=exec_price, 
             commission=commission
         )
         await self.events.put(fill)

         # Handle Remaining Quantity for Partial Fills
         if is_partial:
             remaining_qty = event.quantity - fill_qty
             event.quantity = remaining_qty # Update the order object in place
             
             # Add to waiting queue for next bar
             self.waiting_for_volume_orders.append(event)
             
             await self.log_event("INFO", f"Partial Fill: {fill_qty} filled, {remaining_qty} remaining (Limit: {self.volume_participation_rate*100:.1f}% of Vol {current_volume})")
            
    async def handle_fill_event(self, event: FillEvent):
        # Update Portfolio
        self.portfolio.update_fill(event)
        
        await self._send({
            "type": "FILL",
            "symbol": event.symbol,
            "direction": event.direction,
            "quantity": event.quantity,
            "price": event.fill_cost,
            "commission": event.commission,
            "time": event.timestamp.isoformat()
        })
        
        await self.log_event(
            "SUCCESS", 
            f"Order Filled: {event.direction} {event.quantity} @ {event.fill_cost:.2f} (Comm: ${event.commission:.4f})",
            metadata={
                "type": "FILL",
                "symbol": event.symbol,
                "price": event.fill_cost,
                "commission": event.commission
            }
        )
            
    def stop(self):
        self.running = False
