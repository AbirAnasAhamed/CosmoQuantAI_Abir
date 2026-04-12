from datetime import timedelta
from typing import List, Dict, Any
from .base import ExecutionStrategy
import math

class TWAPStrategy(ExecutionStrategy):
    """
    Time-Weighted Average Price (TWAP) Strategy.
    Splits order into equal parts executed at regular intervals.
    """

    def calculate_schedule(
        self, 
        total_quantity: float, 
        start_time, 
        duration_minutes: int, 
        params: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        
        # Default to 5-minute intervals if not specified, but at least 2 parts
        interval_minutes = params.get("interval_minutes", 5)
        min_order_size = params.get("min_order_size", 0.0)

        # Calculate number of parts
        # If duration is 60 mins and interval is 5 mins -> 12 parts
        # If duration is shorter than interval, force at least 1 part (immediate)
        if duration_minutes <= 0:
            num_parts = 1
        else:
            num_parts = math.ceil(duration_minutes / interval_minutes)
        
        if num_parts < 1: 
            num_parts = 1

        # Calculate base size per order
        base_size = total_quantity / num_parts
        
        # Check specific constraints (Mock check, real check in Engine)
        # If base_size < min_order_size, we might need to reduce parts
        if min_order_size > 0 and base_size < min_order_size:
            # Re-calculate max possible parts
            num_parts = math.floor(total_quantity / min_order_size)
            if num_parts < 1:
                num_parts = 1 # Cannot split, execute all at once
            base_size = total_quantity / num_parts

        schedule = []
        for i in range(num_parts):
            execution_time = start_time + timedelta(minutes=i * interval_minutes)
            
            # Adjust last order to fix rounding errors
            if i == num_parts - 1:
                current_sum = sum(o['quantity'] for o in schedule)
                quantity = round(total_quantity - current_sum, 8)
            else:
                quantity = round(base_size, 8)

            schedule.append({
                "scheduled_time": execution_time,
                "quantity": quantity,
                "order_index": i + 1,
                "total_parts": num_parts
            })
            
        return schedule
