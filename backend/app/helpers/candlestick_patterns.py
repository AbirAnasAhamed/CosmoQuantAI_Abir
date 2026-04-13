import numpy as np
import talib
import logging

logger = logging.getLogger(__name__)

def attach_candlestick_patterns(ohlcv_data: list) -> list:
    """
    Given a list of OHLCV dictionaries, calculates candlestick patterns using TA-Lib 
    and appends a 'patterns' field to each dictionary.
    
    Expected format in ohlcv_data:
    [
        {"time": int, "open": float, "high": float, "low": float, "close": float, "volume": float},
        ...
    ]
    """
    if not ohlcv_data or len(ohlcv_data) < 10:
        # Not enough data to run TA-Lib efficiently
        return ohlcv_data

    try:
        # Extract numpy arrays for TA-Lib
        opens = np.array([c['open'] for c in ohlcv_data], dtype=np.float64)
        highs = np.array([c['high'] for c in ohlcv_data], dtype=np.float64)
        lows = np.array([c['low'] for c in ohlcv_data], dtype=np.float64)
        closes = np.array([c['close'] for c in ohlcv_data], dtype=np.float64)

        # Dictionary mapping mathematical pattern functions to readable names
        patterns_to_check = {
            'Doji': talib.CDLDOJI(opens, highs, lows, closes),
            'Hammer': talib.CDLHAMMER(opens, highs, lows, closes),
            'Morning Star': talib.CDLMORNINGSTAR(opens, highs, lows, closes),
            'Evening Star': talib.CDLEVENINGSTAR(opens, highs, lows, closes),
            'Engulfing': talib.CDLENGULFING(opens, highs, lows, closes),
            'Shooting Star': talib.CDLSHOOTINGSTAR(opens, highs, lows, closes),
            'Spinning Top': talib.CDLSPINNINGTOP(opens, highs, lows, closes),
            'Piercing Line': talib.CDLPIERCING(opens, highs, lows, closes),
            'Dark Cloud': talib.CDLDARKCLOUDCOVER(opens, highs, lows, closes),
            '3 White Soldiers': talib.CDL3WHITESOLDIERS(opens, highs, lows, closes),
            '3 Black Crows': talib.CDL3BLACKCROWS(opens, highs, lows, closes),
            'Harami': talib.CDLHARAMI(opens, highs, lows, closes),
            'Harami Cross': talib.CDLHARAMICROSS(opens, highs, lows, closes),
            'Marubozu': talib.CDLMARUBOZU(opens, highs, lows, closes),
            'Dragonfly Doji': talib.CDLDRAGONFLYDOJI(opens, highs, lows, closes),
            'Gravestone Doji': talib.CDLGRAVESTONEDOJI(opens, highs, lows, closes),
            'Hanging Man': talib.CDLHANGINGMAN(opens, highs, lows, closes),
            'Abandoned Baby': talib.CDLABANDONEDBABY(opens, highs, lows, closes),
            '3 Inside': talib.CDL3INSIDE(opens, highs, lows, closes),
            '3 Outside': talib.CDL3OUTSIDE(opens, highs, lows, closes),
            'Kicking': talib.CDLKICKING(opens, highs, lows, closes),
            'Belt-Hold': talib.CDLBELTHOLD(opens, highs, lows, closes)
        }

        # Initialize empty pattern lists
        for c in ohlcv_data:
            c['patterns'] = []

        # Populate patterns based on non-zero occurrences
        for i in range(len(ohlcv_data)):
            for name, result_array in patterns_to_check.items():
                value = result_array[i]
                if value != 0:
                    # Positive values indicate bullish, negative indicate bearish in TA-Lib
                    direction = 'bullish' if value > 0 else 'bearish'
                    ohlcv_data[i]['patterns'].append({
                        'name': name,
                        'direction': direction
                    })

    except Exception as e:
        logger.error(f"Error calculating candlestick patterns: {e}")

    return ohlcv_data
