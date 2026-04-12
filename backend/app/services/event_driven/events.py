from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any

class EventType(Enum):
    MARKET = 'MARKET'
    SIGNAL = 'SIGNAL'
    ORDER = 'ORDER'
    FILL = 'FILL'

class Event:
    """
    Base class for all events.
    """
    def __init__(self, event_type: EventType):
        self.type = event_type
        self.timestamp = datetime.utcnow()

class MarketEvent(Event):
    """
    Handles the event of receiving a new market update with corresponding bars.
    """
    def __init__(self, symbol: str, date: datetime, open_price: float, high: float, low: float, close: float, volume: float):
        super().__init__(EventType.MARKET)
        self.symbol = symbol
        self.date = date
        self.open = open_price
        self.high = high
        self.low = low
        self.close = close
        self.volume = volume

    def __str__(self):
        return f"MarketEvent: {self.symbol} @ {self.date} | O:{self.open} H:{self.high} L:{self.low} C:{self.close} V:{self.volume}"

class SignalEvent(Event):
    """
    Handles the event of sending a Signal from a Strategy object.
    This is received by a Portfolio object and acted upon.
    """
    def __init__(self, strategy_id: str, symbol: str, datetime: datetime, signal_type: str, strength: float = 1.0):
        super().__init__(EventType.SIGNAL)
        self.strategy_id = strategy_id
        self.symbol = symbol
        self.datetime = datetime
        self.signal_type = signal_type  # 'LONG' or 'SHORT' or 'EXIT'
        self.strength = strength

    def __str__(self):
        return f"SignalEvent: {self.symbol} - {self.signal_type} (Strength: {self.strength})"

class OrderEvent(Event):
    """
    Handles the event of sending an Order to an execution system.
    The order contains a symbol (e.g. GOOG), a type (market or limit),
    quantity and a direction.
    """
    def __init__(self, symbol: str, order_type: str, quantity: int, direction: str):
        super().__init__(EventType.ORDER)
        self.symbol = symbol
        self.order_type = order_type  # 'MKT' or 'LMT'
        self.quantity = quantity
        self.direction = direction  # 'BUY' or 'SELL'

    def print_order(self):
        print(f"Order: Symbol={self.symbol}, Type={self.order_type}, Quantity={self.quantity}, Direction={self.direction}")

    def __str__(self):
        return f"OrderEvent: {self.direction} {self.quantity} {self.symbol} @ {self.order_type}"

class FillEvent(Event):
    """
    Encapsulates the notion of a Filled Order, as returned
    from a brokerage. Stores the quantity of an instrument
    actually filled and at what price. In addition, stores
    the commission of the trade from the brokerage.
    """
    def __init__(self, timestamp: datetime, symbol: str, exchange: str, quantity: int,
                 direction: str, fill_cost: float, commission: Optional[float] = None):
        super().__init__(EventType.FILL)
        self.timestamp = timestamp
        self.symbol = symbol
        self.exchange = exchange
        self.quantity = quantity
        self.direction = direction
        self.fill_cost = fill_cost

        # Calculate commission
        if commission is None:
            self.commission = self.calculate_ib_commission()
        else:
            self.commission = commission

    def calculate_ib_commission(self):
        """
        Calculates the fees of trading based on an Interactive Brokers
        fee structure for API, in USD.
        This does not include exchange or ECN fees.
        Based on "US API Directed Orders":
        https://www.interactivebrokers.com/en/index.php?f=commission&p=stocks2
        """
        full_cost = 1.3
        if self.quantity <= 500:
            full_cost = max(1.3, 0.013 * self.quantity)
        else:
            full_cost = max(1.3, 0.008 * self.quantity)
        return full_cost

    def __str__(self):
        return f"FillEvent: {self.direction} {self.quantity} {self.symbol} @ {self.fill_cost} (Comm: {self.commission})"
