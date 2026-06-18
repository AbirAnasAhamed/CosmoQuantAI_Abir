class ZeroToleranceTracker:
    """
    Modular tracker for the 0% SL Zero Tolerance Breakeven feature.
    If the initial stop loss is set to 0, this tracker enables an immediate 
    breakeven stop loss (with an optional tick buffer).
    """
    def __init__(self, enable_zero_tolerance: bool, zero_tolerance_ticks: int = 0):
        self.enable_zero_tolerance = enable_zero_tolerance
        self.zero_tolerance_ticks = max(0, zero_tolerance_ticks)
        self.trigger_price = None
        self.is_active = False
        
    def activate(self, entry_price: float, side: str, tick_size: float = 0.0):
        """
        Activates the tracker and calculates the breakeven trigger price.
        """
        if not self.enable_zero_tolerance:
            return
            
        self.is_active = True
        buffer_amount = self.zero_tolerance_ticks * tick_size
        
        if side.lower() == 'buy' or side.lower() == 'long':
            # For long, trigger if price drops below entry - buffer
            self.trigger_price = entry_price - buffer_amount
        else:
            # For short, trigger if price rises above entry + buffer
            self.trigger_price = entry_price + buffer_amount

    def check_trigger(self, current_price: float, side: str) -> bool:
        """
        Checks if the current price has breached the trigger price.
        Returns True if the zero-tolerance breakeven stop loss should be executed.
        """
        if not self.is_active or self.trigger_price is None:
            return False
            
        if side.lower() == 'buy' or side.lower() == 'long':
            return current_price <= self.trigger_price
        else:
            return current_price >= self.trigger_price
            
    def update_params(self, enable_zero_tolerance: bool, zero_tolerance_ticks: int):
        """
        Updates the configuration dynamically.
        """
        self.enable_zero_tolerance = enable_zero_tolerance
        self.zero_tolerance_ticks = max(0, zero_tolerance_ticks)
        if not self.enable_zero_tolerance:
            self.is_active = False
            self.trigger_price = None
