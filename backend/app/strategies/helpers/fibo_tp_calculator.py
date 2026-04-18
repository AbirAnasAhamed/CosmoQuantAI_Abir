def calculate_fibo_extension_tp(ohlcv_data: list, current_price: float, side: str, extension_level: float = 1.618) -> float:
    """
    Calculates the dynamic Fibonacci Extension Take Profit level based on recent swing highs/lows.
    
    Args:
        ohlcv_data: list of OHLCV candles (e.g., from ccxt fetch_ohlcv). 
                    Format: [timestamp, open, high, low, close, volume]
        current_price: The entry price of the trade.
        side: "buy" for long, "sell" for short.
        extension_level: The Fibonacci extension level (e.g., 1.272, 1.618, 2.618).
        
    Returns:
        float: The calculated Target Take Profit price. 
               Returns None if the data is insufficient.
    """
    if not ohlcv_data or len(ohlcv_data) < 2:
        return None

    # Extract all highs and lows from the provided timeframe window
    highs = [candle[2] for candle in ohlcv_data]
    lows = [candle[3] for candle in ohlcv_data]

    swing_high = max(highs)
    swing_low = min(lows)

    # In case the market has zero volatility (very rare)
    if swing_high == swing_low:
        return None

    swing_distance = swing_high - swing_low

    if side == "buy":
        # For long entries, we project upwards from the swing low.
        # Target = Swing Low + (Distance * 1.618)
        # Often traders might want to project from current_price if it's lower than swing_low,
        # but using the absolute local swing_low is mathematically correct for Fibo.
        base_low = min(swing_low, current_price) 
        target_tp = base_low + (swing_distance * extension_level)
        return target_tp
        
    elif side == "sell":
        # For short entries, we project downwards from the swing high.
        # Target = Swing High - (Distance * 1.618)
        base_high = max(swing_high, current_price)
        target_tp = base_high - (swing_distance * extension_level)
        return target_tp

    return None
