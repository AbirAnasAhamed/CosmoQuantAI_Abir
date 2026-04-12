from datetime import timedelta
from typing import List, Dict, Any
from .base import ExecutionStrategy
import math

class VWAPStrategy(ExecutionStrategy):
    """
    Volume-Weighted Average Price (VWAP) Strategy.
    Splits order based on historical volume profile (Simulated).
    """

    def calculate_schedule(
        self, 
        total_quantity: float, 
        start_time, 
        duration_minutes: int, 
        params: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        
        interval_minutes = params.get("interval_minutes", 5)
        min_order_size = params.get("min_order_size", 0.0)
        
        if duration_minutes <= 0:
            num_parts = 1
        else:
            num_parts = math.ceil(duration_minutes / interval_minutes)
            
        if num_parts < 1: num_parts = 1

        # SIMULATED VOLUME PROFILE
        # In a real system, we'd fetch historical volume avg for these time slots
        # Here we use a "U-shape" curve (typical market volume: high open/close, low mid)
        # or simple bell curve. Let's use a simplified list of weights.
        
        # We generate 'num_parts' weights. 
        # For simplicity, let's randomize slightly to mimic market or use a fixed pattern.
        # Fixed pattern: High start, low middle, high end.
        
        weights = []
        center = num_parts / 2
        for i in range(num_parts):
            # Distance from center (0 to 1 scale roughly)
            dist = abs(i - center) / (center + 0.1) 
            # Weight increases at edges
            weight = 1 + (dist * 0.5) 
            weights.append(weight)
            
        total_weight = sum(weights)
        normalized_weights = [w / total_weight for w in weights]
        
        schedule = []
        accumulated_qty = 0.0
        
        for i in range(num_parts):
            execution_time = start_time + timedelta(minutes=i * interval_minutes)
            
            # Percentage of total order for this slice
            slice_qty = total_quantity * normalized_weights[i]
            
            # Check min size constraint - if too small, carry over to next or handle?
            # For simplicity in this v1: we won't strictly merge small orders yet,
            # but we assume the user placed a large enough order.
            
            # Adjust last order
            if i == num_parts - 1:
                quantity = round(total_quantity - accumulated_qty, 8)
            else:
                quantity = round(slice_qty, 8)
            
            accumulated_qty += quantity

            schedule.append({
                "scheduled_time": execution_time,
                "quantity": quantity,
                "order_index": i + 1,
                "total_parts": num_parts
            })
            
        return schedule
