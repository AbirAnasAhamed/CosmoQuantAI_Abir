import logging
from typing import List, Dict, Optional, Any
import numpy as np

logger = logging.getLogger(__name__)

class WickSRTracker:
    def __init__(self, timeframe: str = '1m', atr_period: int = 14, atr_multiplier: float = 0.5, sweep_threshold_candles: int = 3, min_touches: int = 10):
        self.timeframe = timeframe
        self.atr_period = atr_period
        self.atr_multiplier = atr_multiplier
        self.sweep_threshold_candles = sweep_threshold_candles
        self.min_touches = min_touches
        
        self.levels = []
        
    def _calculate_rma(self, data: np.ndarray, period: int) -> np.ndarray:
        rma = np.zeros_like(data)
        if len(data) == 0:
            return rma
        rma[period-1] = np.mean(data[:period])
        alpha = 1.0 / period
        for i in range(period, len(data)):
            rma[i] = alpha * data[i] + (1 - alpha) * rma[i-1]
        return rma

    def _calculate_atr(self, klines: List[Dict[str, float]]) -> float:
        if len(klines) < self.atr_period + 1:
            return 0.0
            
        tr_list = []
        for i in range(1, len(klines)):
            high = float(klines[i]['high'])
            low = float(klines[i]['low'])
            prev_close = float(klines[i-1]['close'])
            
            tr = max(high - low, abs(high - prev_close), abs(low - prev_close))
            tr_list.append(tr)
            
        tr_array = np.array(tr_list)
        rma = self._calculate_rma(tr_array, self.atr_period)
        return rma[-1] if len(rma) > 0 else 0.0

    def update_levels(self, klines: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Calculates levels based on historical data. Returns list of detected levels.
        Ensures persistent state (Sweep Watch vs Active) over timeframe iterations.
        """
        if len(klines) < self.atr_period + 2:
            return []
            
        current_atr = self._calculate_atr(klines)
        if current_atr <= 0:
            return []
            
        tolerance = current_atr * self.atr_multiplier
        
        high_wicks = []
        low_wicks = []
        
        for k in klines:
            high_wicks.append(float(k['high']))
            low_wicks.append(float(k['low']))
            
        def extract_clusters(wicks, is_resistance):
            clusters = []
            for w in wicks:
                found = False
                for c in clusters:
                    if abs(c['avgPrice'] - w) <= tolerance:
                        c['touches'] += 1
                        c['avgPrice'] = c['avgPrice'] + (w - c['avgPrice']) / c['touches']
                        found = True
                        break
                if not found:
                    clusters.append({
                        'avgPrice': w,
                        'touches': 1,
                        'isResistance': is_resistance,
                        'isBroken': False
                    })
            return clusters

        res_clusters = extract_clusters(high_wicks, True)
        sup_clusters = extract_clusters(low_wicks, False)
        
        all_clusters = res_clusters + sup_clusters
        valid = [c for c in all_clusters if c['touches'] >= self.min_touches]
        
        latest_close = float(klines[-1]['close'])
        self.last_close = latest_close
        
        new_levels = []
        for v in valid:
            top_zone = v['avgPrice'] + tolerance
            bottom_zone = v['avgPrice'] - tolerance
            
            # Check existing state to persist sweep properties
            existing = None
            for e in self.levels:
                if abs(e['price'] - v['avgPrice']) <= tolerance and e['original_type'] == ('resistance' if v['isResistance'] else 'support'):
                    existing = e
                    break
                    
            if existing:
                # Merge touch count but keep state machine untouched
                existing['touches'] = max(existing['touches'], v['touches'])
                existing['price'] = v['avgPrice']
                existing['top_band'] = top_zone
                existing['bottom_band'] = bottom_zone
                new_levels.append(existing)
            else:
                is_broken = False
                if v['isResistance'] and latest_close > top_zone:
                    is_broken = True
                elif not v['isResistance'] and latest_close < bottom_zone:
                    is_broken = True
                    
                status = 'ACTIVE'
                if is_broken:
                    status = 'BROKEN_SWEEP_WATCH'
                    
                new_levels.append({
                    'price': v['avgPrice'],
                    'type': 'resistance' if v['isResistance'] else 'support',
                    'original_type': 'resistance' if v['isResistance'] else 'support',
                    'touches': v['touches'],
                    'top_band': top_zone,
                    'bottom_band': bottom_zone,
                    'status': status,
                    'candles_since_break': 0
                })

        self.levels = new_levels
        # Log purely on first detection for diagnostics
        if self.levels:
            logger.debug(f"[WickSR] Active Tracking {len(self.levels)} levels. ATR: {current_atr:.4f}, Tolerance: {tolerance:.4f}")
            
        return self.levels

    def get_signals(self, latest_close: float) -> List[Dict[str, Any]]:
        """
        Evaluate live execution signals against the actively tracked zones.
        """
        signals = []
        
        for level in self.levels:
            if level['status'] == 'ACTIVE':
                if level['bottom_band'] <= latest_close <= level['top_band']:
                    signals.append({
                        'mode': 'bounce',
                        'side': 'short' if level['type'] == 'resistance' else 'long',
                        'price': level['price']
                    })
                
                # Check for live breakout
                if level['type'] == 'resistance' and latest_close > level['top_band']:
                    signals.append({
                        'mode': 'breakout',
                        'side': 'long',  # Breakout above resistance means go LONG
                        'price': level['price']
                    })
                    level['status'] = 'BROKEN_SWEEP_WATCH'
                    level['candles_since_break'] = 0
                elif level['type'] == 'support' and latest_close < level['bottom_band']:
                    signals.append({
                        'mode': 'breakout',
                        'side': 'short', # Breakout below support means go SHORT
                        'price': level['price']
                    })
                    level['status'] = 'BROKEN_SWEEP_WATCH'
                    level['candles_since_break'] = 0
                    
            elif level['status'] == 'BROKEN_SWEEP_WATCH':
                level['candles_since_break'] += 1
                
                recovered = False
                if level['original_type'] == 'resistance' and latest_close <= level['top_band']:
                    recovered = True
                elif level['original_type'] == 'support' and latest_close >= level['bottom_band']:
                    recovered = True
                    
                if recovered:
                    signals.append({
                        'mode': 'sweep',
                        'side': 'short' if level['original_type'] == 'resistance' else 'long',
                        'price': level['price']
                    })
                    level['status'] = 'ACTIVE'
                    level['candles_since_break'] = 0
                elif level['candles_since_break'] >= self.sweep_threshold_candles:
                    level['status'] = 'BROKEN_RETEST'
                    level['type'] = 'support' if level['original_type'] == 'resistance' else 'resistance'
                    
            elif level['status'] == 'BROKEN_RETEST':
                if level['bottom_band'] <= latest_close <= level['top_band']:
                    signals.append({
                        'mode': 'retest',
                        'side': 'short' if level['type'] == 'resistance' else 'long',
                        'price': level['price']
                    })
                    
        return signals

    def get_dynamic_tp(self, side: str, entry_price: float, frontrun_pct: float = 0.0) -> Optional[float]:
        """
        Calculates the nearest Wick SR zone TP based on the entry side.
        Applies a frontrun percentage to take profit slightly before the absolute level to guarantee execution.
        """
        valid_targets = []
        for level in self.levels:
            if level['status'] != 'ACTIVE':
                continue
                
            if side == 'buy':
                # Long entry: looking for the NEXT Resistance ABOVE the entry price
                if level['type'] == 'resistance' and level['bottom_band'] > entry_price:
                    valid_targets.append(level['bottom_band'])
            elif side == 'sell':
                # Short entry: looking for the NEXT Support BELOW the entry price
                if level['type'] == 'support' and level['top_band'] < entry_price:
                    valid_targets.append(level['top_band'])
                    
        if not valid_targets:
            return None
            
        if side == 'buy':
            # Nearest resistance bottom band
            target_price = min(valid_targets)
            if frontrun_pct > 0:
                distance = target_price - entry_price
                if distance > 0:
                    # Frontrun by a percentage of the distance to the zone
                    target_price = target_price - (distance * (frontrun_pct / 100))
        else:
            # Nearest support top band
            target_price = max(valid_targets)
            if frontrun_pct > 0:
                distance = entry_price - target_price
                if distance > 0:
                    # Frontrun by a percentage of the distance to the zone
                    target_price = target_price + (distance * (frontrun_pct / 100))
                
        return target_price
