import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

class MLAdvancedSetupGenerator:
    """
    Generates dynamic Stop Loss, Take Profit, and Risk:Reward ratios 
    for the ML Predictor by combining its Confidence with the Bot's 
    existing Chart Structural Data (Wick S/R, ATR, Fibo).
    """
    def __init__(self, bot_instance):
        self.bot = bot_instance

    def generate_setup(self, current_price: float, side: str, confidence: float) -> Dict[str, Any]:
        """
        Generates the advanced setup parameters.
        side: 'long' or 'short'
        confidence: 0.0 to 1.0
        """
        # 1. Fetch current ATR (Bot usually calculates this in background)
        atr = getattr(self.bot, 'current_atr', 0.0)
        if atr <= 0.0:
            # Fallback micro-volatility based on price
            atr = current_price * 0.005 # 0.5% default fallback
            
        # Modifiers based on confidence
        # High confidence (e.g. 0.90) = tighter SL, wider TP
        # Low confidence (e.g. 0.60) = wider SL, tighter TP
        sl_modifier = 1.0
        tp_modifier = 1.5
        
        if confidence >= 0.85:
            sl_modifier = 0.5   # 50% of ATR
            tp_modifier = 3.0   # 300% of ATR
        elif confidence >= 0.70:
            sl_modifier = 1.0   # 100% of ATR
            tp_modifier = 2.0   # 200% of ATR
        else:
            sl_modifier = 1.5   # 150% of ATR
            tp_modifier = 1.0   # 100% of ATR

        # 2. Try to find Nearest Support / Resistance
        nearest_level = None
        wick_tracker = getattr(self.bot, 'wick_sr_tracker', None)
        if wick_tracker and hasattr(wick_tracker, 'levels'):
            # Filter levels by side
            levels = wick_tracker.levels
            if side.lower() in ('buy', 'long'):
                supports = [l for l in levels if l['type'] == 'support' and l['price'] < current_price]
                if supports:
                    nearest_level = max(supports, key=lambda x: x['price'])['price']
            else:
                resistances = [l for l in levels if l['type'] == 'resistance' and l['price'] > current_price]
                if resistances:
                    nearest_level = min(resistances, key=lambda x: x['price'])['price']

        # 3. Calculate Dynamic SL
        sl_price = 0.0
        if side.lower() in ('buy', 'long'):
            if nearest_level:
                # Place SL just below the nearest support
                sl_price = nearest_level - (atr * sl_modifier)
            else:
                sl_price = current_price - (atr * sl_modifier)
        else:
            if nearest_level:
                # Place SL just above the nearest resistance
                sl_price = nearest_level + (atr * sl_modifier)
            else:
                sl_price = current_price + (atr * sl_modifier)
                
        # 4. Calculate Dynamic TP (Fibo or ATR based)
        # Check if Fibo TP is enabled in Bot
        tp_price = 0.0
        if getattr(self.bot, 'enable_auto_fibo_tp', False) and hasattr(self.bot, 'auto_fibo_tp_price') and self.bot.auto_fibo_tp_price:
            tp_price = self.bot.auto_fibo_tp_price
            # If Confidence is very high, push for higher fibo manually (dynamic extension)
            if confidence >= 0.85:
                if side.lower() in ('buy', 'long'):
                    tp_price = tp_price + (atr * tp_modifier * 0.5)
                else:
                    tp_price = tp_price - (atr * tp_modifier * 0.5)
        else:
            # ATR Based Dynamic TP
            if side.lower() in ('buy', 'long'):
                tp_price = current_price + (atr * tp_modifier)
            else:
                tp_price = current_price - (atr * tp_modifier)

        # Sanity check: Ensure SL/TP are in correct direction and not too close to price
        if side.lower() in ('buy', 'long'):
            sl_price = min(sl_price, current_price * 0.999) # at least 0.1% away
            tp_price = max(tp_price, current_price * 1.001)
        else:
            sl_price = max(sl_price, current_price * 1.001)
            tp_price = min(tp_price, current_price * 0.999)

        # Calculate Risk:Reward Ratio
        risk = abs(current_price - sl_price)
        reward = abs(tp_price - current_price)
        rr_ratio = round((reward / risk) if risk > 0 else 0, 2)

        setup_data = {
            "is_valid": True,
            "sl_price": round(sl_price, 6),
            "tp_price": round(tp_price, 6),
            "rr_ratio": rr_ratio,
            "confidence": round(confidence, 4),
            "atr_used": round(atr, 6),
            "nearest_sr": nearest_level
        }

        # Publish WebSocket Event directly to Heatmap Channel for Frontend Visualization
        try:
            import json
            if hasattr(self.bot, 'redis') and self.bot.redis:
                event_payload = {
                    "type": "ML_ADVANCED_SETUP",
                    "symbol": getattr(self.bot, 'symbol', 'UNKNOWN'),
                    "side": side.lower(),
                    "sl_price": setup_data["sl_price"],
                    "tp_price": setup_data["tp_price"],
                    "rr_ratio": setup_data["rr_ratio"],
                    "confidence": setup_data["confidence"]
                }
                self.bot.redis.publish("heatmap_events", json.dumps(event_payload))
        except Exception as e:
            logger.error(f"Failed to publish ML_ADVANCED_SETUP event: {e}")

        return setup_data
