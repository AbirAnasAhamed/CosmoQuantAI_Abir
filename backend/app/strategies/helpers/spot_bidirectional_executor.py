import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

class SpotBiDirectionalExecutor:
    """
    Manages the logic for Bi-directional Spot Auto mode.
    It decides whether to prioritize the Buy Wall or Sell Wall based on ML predictions,
    and validates if sufficient Base or Quote balance exists before triggering a trade.
    """
    def __init__(self, bot_instance):
        self.bot = bot_instance

    async def evaluate_walls(self, current_walls: Dict[float, Dict[str, Any]], orderbook: Dict[str, Any], mid_price: float) -> Dict[float, Dict[str, Any]]:
        """
        Evaluates detected walls. If both buy and sell walls exist in 'auto' mode,
        it uses the ML predictor to prioritize one, or keeps both if neutral.
        """
        if getattr(self.bot, 'trading_mode', 'spot') != 'spot' or getattr(self.bot, 'strategy_mode', 'long') != 'auto':
            return current_walls

        buy_walls = {p: w for p, w in current_walls.items() if w['type'] == 'buy'}
        sell_walls = {p: w for p, w in current_walls.items() if w['type'] == 'sell'}

        if buy_walls and sell_walls:
            # Both walls detected. Check ML Prediction if available
            ml_pred = None
            if getattr(self.bot, 'enable_ml_filter', False) and getattr(self.bot, 'ml_predictor', None):
                try:
                    ml_pred = self.bot.ml_predictor.predict(orderbook)
                except Exception as e:
                    self.bot.logger.warning(f"ML Predictor error in Bi-directional mode: {e}")

            if ml_pred:
                prob = ml_pred.get('probability', 0.5)
                bullish_threshold = getattr(self.bot, 'ml_bullish_threshold', 0.5)
                bearish_threshold = getattr(self.bot, 'ml_bearish_threshold', 0.5)

                if prob >= bullish_threshold:
                    self.bot.logger.info(f"🧠 [Spot Auto] ML is Bullish (prob: {prob:.2f}). Prioritizing BUY WALLs, ignoring SELL WALLs.")
                    return buy_walls
                elif prob <= bearish_threshold:
                    self.bot.logger.info(f"🧠 [Spot Auto] ML is Bearish (prob: {prob:.2f}). Prioritizing SELL WALLs, ignoring BUY WALLs.")
                    return sell_walls
                else:
                    self.bot.logger.info(f"🧠 [Spot Auto] ML is Neutral (prob: {prob:.2f}). Keeping both walls (Dynamic Grid).")
                    return current_walls
            else:
                # Use debug to avoid log spam when both walls are present but ML is off or unavailable
                self.bot.logger.debug("🔄 [Spot Auto] Keeping both walls (Dynamic Grid).")
                return current_walls
        
        # If we only have one type of wall, just return it
        return current_walls

        return current_walls

    async def validate_balance_for_side(self, target_side: str) -> bool:
        """
        Checks if the bot has sufficient balance for the intended side.
        target_side == 'buy' -> check Quote balance (USDT)
        target_side == 'sell' -> check Base balance (Token)
        """
        if getattr(self.bot, 'trading_mode', 'spot') != 'spot':
            return True # Futures relies on margin, handled elsewhere
            
        if getattr(self.bot, 'is_paper_trading', False):
            return True # Bypass balance check for paper trading

        try:
            if not getattr(self.bot, 'exchange', None):
                return True
                
            balances = await self.bot.exchange.fetch_balance()
            parts = self.bot.symbol.split('/')
            if len(parts) != 2:
                return True 
                
            base_asset = parts[0]
            quote_asset = parts[1]

            amount_per_trade = getattr(self.bot.engine, 'config', {}).get("amount_per_trade", 0)

            if target_side == 'buy':
                quote_free = balances.get(quote_asset, {}).get('free', 0.0)
                if quote_free < amount_per_trade:
                    self.bot.logger.warning(f"⚠️ [Spot Auto] Insufficient {quote_asset} balance to execute BUY. Required: {amount_per_trade}, Available: {quote_free}")
                    return False
            elif target_side == 'sell':
                base_free = balances.get(base_asset, {}).get('free', 0.0)
                if base_free <= 0.00000001:
                    self.bot.logger.warning(f"⚠️ [Spot Auto] Insufficient {base_asset} balance to execute SELL. Available: {base_free}")
                    return False
            
            return True
        except Exception as e:
            self.bot.logger.error(f"Error fetching balance in Bi-directional validation: {e}")
            return True # Fail-open so we don't break the bot if API hiccups
