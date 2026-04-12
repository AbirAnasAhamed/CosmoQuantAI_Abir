from typing import Dict, List, Optional
from datetime import datetime
from .events import FillEvent

class Portfolio:
    """
    Tracks the portfolio state (Cash + Holdings) for the simulation engine.
    """
    def __init__(self, initial_cash: float = 10000.0):
        self.initial_cash = initial_cash
        self.current_cash = initial_cash
        self.holdings: Dict[str, float] = {} # Symbol -> Quantity
        self.realized_pnl = 0.0
        self.equity_curve: List[Dict] = [] # History of equity values

    def update_fill(self, fill: FillEvent):
        """
        Updates portfolio based on a FillEvent.
        """
        # Update Holdings
        if fill.symbol not in self.holdings:
            self.holdings[fill.symbol] = 0.0
            
        if fill.direction == "BUY":
            self.holdings[fill.symbol] += fill.quantity
            cost = fill.quantity * fill.fill_cost
            self.current_cash -= cost
        elif fill.direction == "SELL":
            self.holdings[fill.symbol] -= fill.quantity
            revenue = fill.quantity * fill.fill_cost
            self.current_cash += revenue
            
        # Deduct Commission
        self.current_cash -= fill.commission

    def calculate_total_equity(self, current_prices: Dict[str, float]) -> float:
        """
        Calculates total equity = Cash + Sum(Holdings * Current Price)
        """
        holdings_value = 0.0
        for symbol, quantity in self.holdings.items():
            if symbol in current_prices:
                holdings_value += quantity * current_prices[symbol]
                
        return self.current_cash + holdings_value
