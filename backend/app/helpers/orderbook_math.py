import math
from typing import List, Dict, Union

def calculate_dynamic_wall_threshold(bids: List[Dict[str, float]], asks: List[Dict[str, float]]) -> float:
    """
    Calculate a dynamic wall threshold based on the mean and standard deviation
    of order sizes in the current order book snapshot.
    """
    sizes = [order["size"] for order in bids] + [order["size"] for order in asks]
    
    if not sizes:
        return 0.0
        
    n = len(sizes)
    mean_size = sum(sizes) / n
    
    if n < 2:
        return mean_size
        
    variance = sum((x - mean_size) ** 2 for x in sizes) / n
    std_dev = math.sqrt(variance)
    
    # Dynamic threshold is 1.5 standard deviations above the mean to catch significant relative spikes without being overly strict
    threshold = mean_size + (1.5 * std_dev)
    
    return threshold
