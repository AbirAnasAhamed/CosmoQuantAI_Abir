import random
from typing import List, Dict, Any

class OrderBookGenerator:
    """
    Generates a simulated Order Book (Depth Chart) based on current price and volatility.
    """
    @staticmethod
    def generate_snapshot(price: float, spread: float = 0.05, depth: int = 5) -> Dict[str, List[List[float]]]:
        """
        Generates a snapshot of the order book.
        
        Args:
            price: Current market price (mid-price).
            spread: The spread between the best bid and best ask (approximate).
            depth: Number of levels to generate for bids and asks.
            
        Returns:
            JSON-compatible dictionary: {"bids": [[price, size], ...], "asks": [[price, size], ...]}
        """
        bids = []
        asks = []
        
        # Base spread logic: 
        # Best Bid = Price - (Spread / 2) with some noise
        # Best Ask = Price + (Spread / 2) with some noise
        
        half_spread = spread / 2.0
        
        # Generate Bids (Below Price)
        current_bid = price - half_spread
        for i in range(depth):
            # Decrease price for next level
            step = random.uniform(0.01, 0.05) # Random step down
            current_bid -= step
            
            # Volume increases as we go deeper (typical order book shape)
            base_vol = (i + 1) * 100 
            vol_noise = random.randint(-20, 50)
            volume = max(10, base_vol + vol_noise)
            
            bids.append([round(current_bid, 2), volume])
            
        # Generate Asks (Above Price)
        current_ask = price + half_spread
        for i in range(depth):
            # Increase price for next level
            step = random.uniform(0.01, 0.05) # Random step up
            current_ask += step
            
            # Volume increases as we go deeper
            base_vol = (i + 1) * 100
            vol_noise = random.randint(-20, 50)
            volume = max(10, base_vol + vol_noise)
            
            asks.append([round(current_ask, 2), volume])
            
        return {
            "bids": bids,
            "asks": asks
        }
