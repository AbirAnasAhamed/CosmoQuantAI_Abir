import logging
import time
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
        self.last_live_price = None
        self._is_first_evaluation = True
        
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
        
        # 1. Use Swing High/Low detection (Left=1, Right=1) to prevent generic ranging candles from forming false levels
        candidate_res = []
        candidate_sup = []
        
        for i in range(1, len(klines) - 1):
            h = float(klines[i]['high'])
            if h > float(klines[i-1]['high']) and h > float(klines[i+1]['high']):
                candidate_res.append(h)
                
            l = float(klines[i]['low'])
            if l < float(klines[i-1]['low']) and l < float(klines[i+1]['low']):
                candidate_sup.append(l)
            
        def extract_clusters(pivots, is_resistance):
            clusters = []
            for p in pivots:
                found = False
                for c in clusters:
                    if abs(c['avgPrice'] - p) <= tolerance:
                        c['pCount'] += 1
                        c['avgPrice'] = c['avgPrice'] + (p - c['avgPrice']) / c['pCount']
                        found = True
                        break
                if not found:
                    clusters.append({
                        'avgPrice': p,
                        'pCount': 1,
                        'touches': 0,
                        'isResistance': is_resistance,
                        'isBroken': False
                    })
            return clusters

        res_clusters = extract_clusters(candidate_res, True)
        sup_clusters = extract_clusters(candidate_sup, False)
        
        all_clusters = res_clusters + sup_clusters
        
        # 2. Count REAL touches for each cluster based on candlestick interaction
        for c in all_clusters:
            top_zone = c['avgPrice'] + tolerance
            bottom_zone = c['avgPrice'] - tolerance
            touches = 0
            
            for k in klines:
                h = float(k['high'])
                l = float(k['low'])
                close_price = float(k['close'])
                
                if c['isResistance']:
                    # Resistance touch: High tested the zone, but candle failed to close strongly above it
                    if h >= bottom_zone and close_price <= top_zone + (tolerance * 0.5):
                        touches += 1
                else:
                    # Support touch: Low tested the zone, but candle failed to close strongly below it
                    if l <= top_zone and close_price >= bottom_zone - (tolerance * 0.5):
                        touches += 1
                        
            c['touches'] = touches
            
        # 3. Filter using the user's min_touches parameter
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
                    'candles_since_break': 0,
                    'last_price_state': None, # tracks if price was above, below, or inside
                    'is_valid_resting': False # allows continuous 5m triggers if already validated
                })

        self.levels = new_levels
        # Log purely on first detection for diagnostics
        if self.levels:
            logger.debug(f"[WickSR] Active Tracking {len(self.levels)} levels. ATR: {current_atr:.4f}, Tolerance: {tolerance:.4f}")
            
        return self.levels

    def get_signals(self, latest_close: float) -> List[Dict[str, Any]]:
        """
        Evaluate live execution signals against the actively tracked zones.
        Uses stateful tracking to ensure price approaches from the correct direction.
        """
        signals = []
        
        if self._is_first_evaluation:
            self._is_first_evaluation = False
            self.last_live_price = latest_close
            # Skip evaluation on the very first tick to prevent blind startup triggers
            for level in self.levels:
                if latest_close > level['top_band']:
                    level['last_price_state'] = 'above'
                elif latest_close < level['bottom_band']:
                    level['last_price_state'] = 'below'
                else:
                    level['last_price_state'] = 'inside'
            return signals

        self.last_live_price = latest_close
        
        for level in self.levels:
            # Determine current state
            current_state = 'inside'
            if latest_close > level['top_band']:
                current_state = 'above'
            elif latest_close < level['bottom_band']:
                current_state = 'below'
                
            last_state = level.get('last_price_state')
            level['last_price_state'] = current_state
            
            if last_state is None:
                continue # Safety skip if state wasn't initialized
                
            if level['status'] == 'ACTIVE':
                if current_state == 'inside':
                    # Validate directional entry
                    valid_entry = False
                    if level['type'] == 'resistance' and last_state == 'below':
                        valid_entry = True
                    elif level['type'] == 'support' and last_state == 'above':
                        valid_entry = True
                        
                    if valid_entry or level.get('is_valid_resting'):
                        now = time.time()
                        # 5-minute cooldown to prevent endless entries while resting in the same S/R zone
                        if now - level.get('last_trigger_time', 0) > 300:
                            signals.append({
                                'mode': 'bounce',
                                'side': 'short' if level['type'] == 'resistance' else 'long',
                                'price': level['price']
                            })
                            level['last_trigger_time'] = now
                            level['is_valid_resting'] = True
                else:
                    level['is_valid_resting'] = False # Reset resting status once it leaves the zone
                
                # Check for live breakout
                if level['type'] == 'resistance' and current_state == 'above' and last_state in ['inside', 'below']:
                    now = time.time()
                    if now - level.get('last_trigger_time', 0) > 300:
                        signals.append({
                            'mode': 'breakout',
                            'side': 'long',  # Breakout above resistance means go LONG
                            'price': level['price']
                        })
                        level['last_trigger_time'] = now
                    level['status'] = 'BROKEN_SWEEP_WATCH'
                    level['candles_since_break'] = 0
                    level['is_valid_resting'] = False
                elif level['type'] == 'support' and current_state == 'below' and last_state in ['inside', 'above']:
                    now = time.time()
                    if now - level.get('last_trigger_time', 0) > 300:
                        signals.append({
                            'mode': 'breakout',
                            'side': 'short', # Breakout below support means go SHORT
                            'price': level['price']
                        })
                        level['last_trigger_time'] = now
                    level['status'] = 'BROKEN_SWEEP_WATCH'
                    level['candles_since_break'] = 0
                    level['is_valid_resting'] = False
                    
            elif level['status'] == 'BROKEN_SWEEP_WATCH':
                level['candles_since_break'] += 1
                
                recovered = False
                if level['original_type'] == 'resistance' and current_state == 'inside' and last_state == 'above':
                    recovered = True
                elif level['original_type'] == 'support' and current_state == 'inside' and last_state == 'below':
                    recovered = True
                    
                if recovered:
                    now = time.time()
                    if now - level.get('last_trigger_time', 0) > 300:
                        signals.append({
                            'mode': 'sweep',
                            'side': 'short' if level['original_type'] == 'resistance' else 'long',
                            'price': level['price']
                        })
                        level['last_trigger_time'] = now
                    level['status'] = 'ACTIVE'
                    level['candles_since_break'] = 0
                    level['is_valid_resting'] = True
                elif level['candles_since_break'] >= self.sweep_threshold_candles:
                    level['status'] = 'BROKEN_RETEST'
                    level['type'] = 'support' if level['original_type'] == 'resistance' else 'resistance'
                    
            elif level['status'] == 'BROKEN_RETEST':
                if current_state == 'inside':
                    valid_retest = False
                    if level['type'] == 'resistance' and last_state == 'below':
                        valid_retest = True
                    elif level['type'] == 'support' and last_state == 'above':
                        valid_retest = True
                        
                    if valid_retest or level.get('is_valid_resting'):
                        now = time.time()
                        if now - level.get('last_trigger_time', 0) > 300:
                            signals.append({
                                'mode': 'retest',
                                'side': 'short' if level['type'] == 'resistance' else 'long',
                                'price': level['price']
                            })
                            level['last_trigger_time'] = now
                            level['is_valid_resting'] = True
                else:
                    level['is_valid_resting'] = False
                    
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
