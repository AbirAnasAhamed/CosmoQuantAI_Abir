
import pandas as pd
import pandas_ta as ta
from app.strategies.live_strategies import BaseLiveStrategy
import logging

logger = logging.getLogger(__name__)

class DynamicStrategyExecutor(BaseLiveStrategy):
    """
    Executes a strategy based on a JSON configuration provided by the Visual Strategy Builder.
    """
    def __init__(self, config):
        self.config = config
        self.trigger_config = config.get('config', {}) # Nested config from bot.config['config']
        
        # Parse triggers and actions
        self.triggers = self.trigger_config.get('triggers', [])
        # self.actions = self.trigger_config.get('actions', [])
        # self.logic_map = self.trigger_config.get('logic_map', [])
        
        # For MVP, we assume 1 Trigger -> 1 Action mapping for simplicity
        # or we iterate through triggers and check if ANY match.
        
        logger.info(f"🧩 Dynamic Strategy Loaded with {len(self.triggers)} triggers")

    def check_signal(self, df: pd.DataFrame):
        current_price = df['close'].iloc[-1]
        
        try:
            # 1. Evaluate All Triggers
            vote_buy = False
            vote_sell = False
            reason = []

            for trigger in self.triggers:
                t_params = trigger.get('params', {})
                indicator = t_params.get('indicator') # RSI, SMA...
                operator = t_params.get('operator')   # <, >, =
                target_value = float(t_params.get('value', 0))
                
                # Check mapping to see what ACTION this trigger is connected to
                # We need the logic map
                logic_map = self.trigger_config.get('logic_map', [])
                connected_actions = [lm['action_id'] for lm in logic_map if lm['trigger_id'] == trigger['id']]
                
                if not connected_actions: continue
                
                # Retrieve Action Details
                all_actions = self.trigger_config.get('actions', [])
                actions_to_execute = [a for a in all_actions if a['id'] in connected_actions]
                
                if not actions_to_execute: continue
                
                # Calculate Indicator Series (Not just last value) to compare previous
                series = self._get_indicator_series(df, indicator, t_params)
                if series is None or len(series) < 2: continue
                
                current_value = series.iloc[-1]
                prev_value = series.iloc[-2]
                
                # Check Condition
                matched = False
                if operator == '<': matched = current_value < target_value
                elif operator == '>': matched = current_value > target_value
                elif operator == '=': matched = current_value == target_value
                elif operator == 'crosses_above': 
                    matched = (prev_value <= target_value) and (current_value > target_value)
                elif operator == 'crosses_below':
                    matched = (prev_value >= target_value) and (current_value < target_value) 
                
                if matched:
                    # Determine Signal from Actions
                    for act in actions_to_execute:
                        act_type = act.get('params', {}).get('action') # BUY, SELL
                        if act_type == 'BUY': vote_buy = True
                        elif act_type == 'SELL': vote_sell = True
                        
                        reason.append(f"{indicator} ({current_value:.2f}) {operator} {target_value}")
            
            # Decision
            if vote_buy and not vote_sell:
                return "BUY", " + ".join(reason), current_price
            elif vote_sell and not vote_buy:
                return "SELL", " + ".join(reason), current_price
            
            return "HOLD", "Wait", current_price
            
        except Exception as e:
            logger.error(f"Dynamic Strategy Execution Error: {e}")
            return "HOLD", "Error", current_price

    def _get_indicator_series(self, df, indicator, params):
        try:
            # Common params
            length = int(params.get('period', 14))
            
            if indicator == 'RSI':
                rsi = df.ta.rsi(length=length)
                return rsi
            
            elif indicator == 'SMA':
                sma = df.ta.sma(length=length)
                return sma
                
            # Add more...
            return None
        except:
            return None
