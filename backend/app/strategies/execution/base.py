from abc import ABC, abstractmethod
from typing import List, Dict, Any
from datetime import datetime

class ExecutionStrategy(ABC):
    """
    Abstract base class for execution strategies (SOR).
    """

    @abstractmethod
    def calculate_schedule(
        self, 
        total_quantity: float, 
        start_time: datetime, 
        duration_minutes: int, 
        params: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Calculates the schedule of child orders.

        Args:
            total_quantity: Total amount to trade.
            start_time: When to start the first order.
            duration_minutes: Total duration for the execution.
            params: Strategy specific parameters (e.g., aggressiveness, min_size).

        Returns:
            List of child orders. Each order is a dict:
            {
                "scheduled_time": datetime,
                "quantity": float,
                "order_index": int,
                "total_parts": int
            }
        """
        pass
