from datetime import datetime
from typing import List, Dict, Any, Optional
from app.strategies.execution.twap import TWAPStrategy
from app.strategies.execution.vwap import VWAPStrategy
from app.strategies.execution.base import ExecutionStrategy

class SOREngine:
    """
    Smart Order Routing Engine.
    Orchestrates the splitting of large orders using various strategies.
    """
    
    STRATEGIES = {
        "TWAP": TWAPStrategy,
        "VWAP": VWAPStrategy
    }

    @classmethod
    def get_strategy(cls, strategy_name: str) -> ExecutionStrategy:
        strategy_class = cls.STRATEGIES.get(strategy_name.upper())
        if not strategy_class:
            raise ValueError(f"Strategy {strategy_name} not supported.")
        return strategy_class()

    @classmethod
    def route_order(
        cls,
        symbol: str,
        total_quantity: float,
        strategy_type: str,
        duration_minutes: int,
        start_time: Optional[datetime] = None,
        params: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Generates a schedule of child orders.

        Args:
            symbol: Trading pair (e.g., BTC/USDT).
            total_quantity: Total size to execute.
            strategy_type: 'TWAP' or 'VWAP'.
            duration_minutes: Duration of execution windown.
            start_time: Scheduled start time (default: now).
            params: Extra params (e.g., min_order_size, aggressiveness).
        
        Returns:
            List of child orders ready for scheduling.
        """
        if params is None:
            params = {}
            
        if start_time is None:
            start_time = datetime.now()

        # Instantiate Strategy
        strategy = cls.get_strategy(strategy_type)
        
        # Calculate Schedule
        schedule = strategy.calculate_schedule(
            total_quantity, 
            start_time, 
            duration_minutes, 
            params
        )
        
        # Post-Processing: Attach metadata
        final_schedule = []
        for child in schedule:
            child.update({
                "symbol": symbol,
                "strategy": strategy_type,
                "parent_id": "simulated_parent_id", # In real DB this would be parent order ID
                "status": "PENDING"
            })
            final_schedule.append(child)
            
        return final_schedule
