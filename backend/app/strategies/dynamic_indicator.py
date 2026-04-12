import backtrader as bt

class DynamicIndicatorStrategy(bt.Strategy):
    """
    This strategy dynamically loads an indicator based on database configuration.
    It buys when price crosses over the indicator and sells when it crosses under.
    (This is a basic logic wrapper for testing indicators)
    """
    params = (
        ('indicator_type', 'SMA'),  # SMA, RSI, BB, etc.
        ('params', {}),             # Dict of params like {'period': 14}
        ('stop_loss', 0.0),
        ('take_profit', 0.0),
    )

    def __init__(self):
        self.dataclose = self.datas[0].close
        self.indicator = None
        
        # Map DB 'base_type' to Backtrader Indicators
        # Note: Params keys must match Backtrader's expected args (e.g., 'period')
        ind_type = self.params.indicator_type.upper()
        p = self.params.params

        if ind_type == 'SMA' or ind_type == 'SIMPLE MOVING AVERAGE':
            period = int(p.get('period', p.get('length', 20)))
            self.indicator = bt.indicators.SimpleMovingAverage(
                self.datas[0], period=period
            )
        
        elif ind_type == 'RSI' or ind_type == 'RELATIVE STRENGTH INDEX':
            period = int(p.get('period', p.get('length', 14)))
            self.indicator = bt.indicators.RSI(
                self.datas[0], period=period
            )
            
        elif ind_type == 'EMA':
            period = int(p.get('period', p.get('length', 20)))
            self.indicator = bt.indicators.ExponentialMovingAverage(
                self.datas[0], period=period
            )

        # Add more mappings here as needed (MACD, Bollinger, etc.)

    def next(self):
        if not self.indicator:
            return

        if not self.position:
            # Basic Logic: Price > SMA -> Buy
            # For RSI: RSI < 30 -> Buy
            
            signal = False
            if self.params.indicator_type == 'RSI':
                if self.indicator[0] < 30:
                    signal = True
            else:
                # Default for Moving Averages
                if self.dataclose[0] > self.indicator[0]:
                    signal = True
            
            if signal:
                self.buy()
        else:
            # Exit Logic
            signal = False
            if self.params.indicator_type == 'RSI':
                if self.indicator[0] > 70:
                    signal = True
            else:
                if self.dataclose[0] < self.indicator[0]:
                    signal = True
            
            if signal:
                self.close()
