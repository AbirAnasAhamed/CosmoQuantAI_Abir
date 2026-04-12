# CCXT এবং Backtrader এর জন্য ভ্যালিড টাইমফ্রেম লিস্ট
VALID_TIMEFRAMES = [
    # Seconds
    "1s", "5s", "10s", "15s", "30s", "45s",
    
    # Minutes
    "1m", "3m", "5m", "15m", "30m", "45m",
    
    # Hours
    "1h", "2h", "3h", "4h", "6h", "8h", "12h",
    
    # Days & Weeks & Months
    "1d", "3d", "1w", "1M"
]

# --- Standard Strategy Parameters Metadata ---
STANDARD_STRATEGY_PARAMS = {
    "RSI Crossover": {
        "rsi_period": {
            "type": "int", "default": 14, "min": 5, "max": 50, "step": 1, "label": "RSI Period"
        },
        "rsi_upper": {
            "type": "int", "default": 70, "min": 50, "max": 95, "step": 1, "label": "Overbought Level"
        },
        "rsi_lower": {
            "type": "int", "default": 30, "min": 5, "max": 50, "step": 1, "label": "Oversold Level"
        }
    },
    "MACD": {
        "fast_period": {
            "type": "int", "default": 12, "min": 2, "max": 50, "step": 1, "label": "Fast Period"
        },
        "slow_period": {
            "type": "int", "default": 26, "min": 10, "max": 100, "step": 1, "label": "Slow Period"
        },
        "signal_period": {
            "type": "int", "default": 9, "min": 2, "max": 20, "step": 1, "label": "Signal Period"
        }
    },
    "Bollinger Bands": {
        "period": {
            "type": "int", "default": 20, "min": 5, "max": 100, "step": 1, "label": "Period"
        },
        "std_dev": {
            "type": "float", "default": 2.0, "min": 1.0, "max": 4.0, "step": 0.1, "label": "Std Deviation"
        }
    },
    "SMA Crossover": {
        "fast_period": {
            "type": "int", "default": 50, "min": 5, "max": 100, "step": 1, "label": "Fast SMA Period"
        },
        "slow_period": {
            "type": "int", "default": 200, "min": 50, "max": 500, "step": 1, "label": "Slow SMA Period"
        }
    }
}

# --- GLOBAL STRATEGY CATALOG ---
STRATEGY_CATALOG = {
    "Trend Following": [
        {"name": "SMA Crossover", "ind": "SMA", "type": "crossover", "desc": "Simple Moving Average crossover. Good for long-term trends."},
        {"name": "EMA Crossover", "ind": "EMA", "type": "crossover", "desc": "Exponential Moving Average. Reacts faster to price changes."},
        {"name": "MACD Trend", "ind": "MACD", "type": "signal", "desc": "Moving Average Convergence Divergence. The king of trend indicators."},
        {"name": "Parabolic SAR", "ind": "ParabolicSAR", "type": "signal", "desc": "Stop and Reverse system. Excellent for trailing stops."},
        {"name": "ADX Trend", "ind": "ADX", "type": "signal", "desc": "Average Directional Index. Measures trend strength, not direction."},
        {"name": "Ichimoku Cloud", "ind": "Ichimoku", "type": "custom", "desc": "Comprehensive indicator that defines support, resistance, and trend."},
        {"name": "SuperTrend", "ind": "SuperTrend", "type": "signal", "desc": "Trend-following indicator similar to Moving Averages but simpler."}
    ],
    "Momentum & Oscillators": [
        {"name": "RSI Strategy", "ind": "RSI", "type": "oscillator", "desc": "Relative Strength Index. Best for spotting Overbought/Oversold levels."},
        {"name": "Stochastic", "ind": "Stochastic", "type": "oscillator", "desc": "Compares closing price to a price range. Great for entry signals."},
        {"name": "CCI Strategy", "ind": "CCI", "type": "oscillator", "desc": "Commodity Channel Index. Finds cyclical trends in asset prices."},
        {"name": "Williams %R", "ind": "WilliamsR", "type": "oscillator", "desc": "Momentum indicator determining overbought and oversold levels."},
        {"name": "Momentum", "ind": "Momentum", "type": "signal", "desc": "Measures the rate of change of closing prices."},
        {"name": "ROC (Rate of Change)", "ind": "ROC", "type": "signal", "desc": "Percentage change in price between current and past periods."}
    ],
    "Volatility": [
        {"name": "Bollinger Bands", "ind": "BollingerBands", "type": "custom", "desc": "Uses standard deviation to define high and low price ranges."},
        {"name": "ATR Breakout", "ind": "ATR", "type": "signal", "desc": "Average True Range. Measures market volatility for breakouts."},
        {"name": "Keltner Channels", "ind": "Keltner", "type": "custom", "desc": "Volatility-based envelopes set above and below an EMA."},
    ],
    "Volume": [
        {"name": "OBV (On Balance Volume)", "ind": "OBV", "type": "signal", "desc": "Uses volume flow to predict changes in stock price."},
        {"name": "Chaikin Oscillator", "ind": "Chaikin", "type": "oscillator", "desc": "Monitors the accumulation-distribution line of MACD."},
        {"name": "MFI (Money Flow)", "ind": "MFI", "type": "oscillator", "desc": "Volume-weighted RSI. Shows buying and selling pressure."}
    ]
}