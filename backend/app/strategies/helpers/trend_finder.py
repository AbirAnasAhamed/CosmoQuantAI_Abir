import numpy as np
import logging

logger = logging.getLogger(__name__)

class AdaptiveTrendFinder:
    def __init__(self, lookback=200, threshold='Strong'):
        """
        lookback: amount of candles to look back
        threshold: minimum confidence level required to allow trades
        """
        self.lookback = lookback
        self.threshold = threshold
        
        # Confidence mapping for numerical comparison
        self.confidence_levels = {
            'Extremely Weak': 0.0,
            'Very Weak': 0.2,
            'Weak': 0.3,
            'Mostly Weak': 0.4,
            'Somewhat Weak': 0.5,
            'Moderately Weak': 0.6,
            'Moderate': 0.7,
            'Moderately Strong': 0.8,
            'Mostly Strong': 0.9,
            'Strong': 0.92,
            'Very Strong': 0.94,
            'Exceptionally Strong': 0.96,
            'Ultra Strong': 0.98
        }
        
    def _get_periods(self):
        return [self.lookback]
            
    def _get_confidence(self, pearson_r):
        p = abs(pearson_r)
        if p < 0.2: return 'Extremely Weak'
        if p < 0.3: return 'Very Weak'
        if p < 0.4: return 'Weak'
        if p < 0.5: return 'Mostly Weak'
        if p < 0.6: return 'Somewhat Weak'
        if p < 0.7: return 'Moderately Weak'
        if p < 0.8: return 'Moderate'
        if p < 0.9: return 'Moderately Strong'
        if p < 0.92: return 'Mostly Strong'
        if p < 0.94: return 'Strong'
        if p < 0.96: return 'Very Strong'
        if p < 0.98: return 'Exceptionally Strong'
        return 'Ultra Strong'

    def analyze_trend(self, close_prices: list):
        """
        Calculates the best-fitting logarithmic trend channel for the given close prices.
        close_prices should be ordered chronologically (oldest to newest).
        """
        if not close_prices or len(close_prices) < 20:
            return None
            
        periods = self._get_periods()
        max_period = max(periods)
        
        # Optimize by slicing only the max data needed
        prices = close_prices[-max_period:] if len(close_prices) > max_period else close_prices
        
        # Precompute log prices
        log_prices = np.log(prices)
        n_prices = len(log_prices)
        
        best_pearson_r = -1
        best_period = periods[0]
        detected_slope = 0
        actual_pearson = 0
        
        for length in periods:
            if n_prices < length:
                continue
                
            # Take the last `length` elements
            slice_log = log_prices[-length:]
            
            # Pine Script x-axis logic goes backwards. i=1 is the newest candle.
            # So reversed_log element 0 is the newest candle.
            reversed_log = slice_log[::-1]
            x = np.arange(1, length + 1)
            
            sumX = np.sum(x)
            sumXX = np.sum(x * x)
            sumY = np.sum(reversed_log)
            sumYX = np.sum(x * reversed_log)
            
            denominator = (length * sumXX - sumX * sumX)
            if denominator == 0:
                continue
                
            slope = (length * sumYX - sumX * sumY) / denominator
            average = sumY / length
            intercept = average - slope * sumX / length + slope
            
            period_1 = length - 1
            regres = intercept + slope * period_1 * 0.5
            
            sumSlp = intercept
            sumDxx = 0
            sumDyy = 0
            sumDyx = 0
            sumDev = 0
            
            for i in range(period_1 + 1):
                lSrc = reversed_log[i]
                dxt = lSrc - average
                dyt = sumSlp - regres
                
                lSrc = lSrc - sumSlp
                sumSlp += slope
                
                sumDxx += dxt * dxt
                sumDyy += dyt * dyt
                sumDyx += dxt * dyt
                sumDev += lSrc * lSrc
                
            divisor = sumDxx * sumDyy
            if divisor == 0:
                pearsonR = 0
            else:
                pearsonR = sumDyx / np.sqrt(divisor)
                
            # We want the highest absolute correlation
            if best_pearson_r == -1 or abs(pearsonR) > best_pearson_r:
                best_pearson_r = abs(pearsonR)
                actual_pearson = pearsonR
                best_period = length
                detected_slope = slope
                
        if best_pearson_r == -1:
            return None
            
        confidence = self._get_confidence(best_pearson_r)
        
        # In PineScript math context, if slope > 0, older bars had higher log prices
        # (because `x` increases backwards), which means the trend goes DOWN over time (bearish).
        trend_direction = 'bearish' if detected_slope > 0 else 'bullish' if detected_slope < 0 else 'neutral'
        
        return {
            'period': best_period,
            'pearson_r': actual_pearson,
            'abs_pearson_r': best_pearson_r,
            'slope': detected_slope,
            'confidence': confidence,
            'direction': trend_direction
        }
        
    def is_trend_acceptable(self, trend_result, trade_side):
        """
        Validates if the current trend is strong enough and aligns with the trade direction.
        
        Args:
            trend_result: Output from analyze_trend
            trade_side: 'buy' for LONG, 'sell' for SHORT
            
        Returns:
            tuple: (is_acceptable: bool, reason: str)
        """
        if not trend_result:
            return False, "Insufficient data or weak correlation"
            
        # Check Confidence Level
        req_level = self.confidence_levels.get(self.threshold, 0)
        curr_level = self.confidence_levels.get(trend_result['confidence'], 0)
        
        # Only check direction if the trend is at least Moderate
        if curr_level >= self.confidence_levels['Moderate']:
            target_direction = 'bullish' if trade_side == 'buy' else 'bearish'
            
            # Reject if there is a strong trend against our target direction
            if trend_result['direction'] != target_direction:
                # We are trying to buy in a bearish trend, or sell in a bullish trend.
                # If the trend against us is very strong, we reject the trade.
                if curr_level >= req_level:
                    return False, f"Rejected: Strong opposing {trend_result['direction']} trend ({trend_result['confidence']})"
                else:
                    return True, "Accepted (Weak opposing trend allowed)"
        
            # If the trend aligns with us, check if it meets the minimum threshold
            if curr_level >= req_level:
                return True, f"Accepted: Confirmed {trend_result['confidence']} {trend_result['direction']} trend"
            else:
                return False, f"Rejected: Trend too weak ({trend_result['confidence']} < {self.threshold})"
                
        else:
             # Very weak or chopping market, maybe we just allow sideways scalping if user sets threshold very low
             if req_level == 0:
                 return True, "Accepted: Choppy/Neutral market (Low Threshold)"
             return False, f"Rejected: No clear trend ({trend_result['confidence']})"
