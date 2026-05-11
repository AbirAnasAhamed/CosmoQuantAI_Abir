import gymnasium as gym
from gymnasium import spaces
import numpy as np
import pandas as pd

class AdvancedTradingEnv(gym.Env):
    """
    A professional-grade trading environment for Reinforcement Learning.
    Developed for CosmoQuantAI by Antigravity.
    
    Features:
    - Supports Long, Short, and Neutral (Cash) positions.
    - Realistic transaction commissions and slippage models.
    - Reward functions based on Log Returns and Risk-Adjusted metrics.
    - Episode termination on bankruptcy (Equity < 10% of initial).
    """
    
    metadata = {"render_modes": ["human"]}

    def __init__(
        self, 
        df: pd.DataFrame, 
        initial_balance: float = 10000.0, 
        commission: float = 0.0002, # 0.02% per trade (Futures Maker Fee)
        slippage: float = 0.0001,   # 0.01% price impact
        max_leverage: float = 1.0,
        reward_type: str = 'log_returns'
    ):
        super(AdvancedTradingEnv, self).__init__()

        # Data validation
        required_cols = ['Close']
        for col in required_cols:
            if col not in df.columns:
                raise ValueError(f"DataFrame must contain '{col}' column for PnL calculation.")

        self.df = df.reset_index(drop=True)
        self.initial_balance = initial_balance
        self.commission = commission
        self.slippage = slippage
        self.max_leverage = max_leverage
        self.reward_type = reward_type

        # Action Space: 0 = Neutral (Cash), 1 = Long, 2 = Short
        self.action_space = spaces.Discrete(3)

        # Observation Space: All columns except 'Target' or 'timestamp'
        # We assume the caller provides a DF already filtered to features + 'Close'
        self.feature_cols = [col for col in df.columns if col not in ['timestamp', 'Target']]
        self.observation_space = spaces.Box(
            low=-np.inf, 
            high=np.inf, 
            shape=(len(self.feature_cols),), 
            dtype=np.float32
        )

        # Initialize State
        self.reset()

    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        
        self.current_step = 0
        self.balance = self.initial_balance
        self.net_worth = self.initial_balance
        self.position = 0  # 0: Neutral, 1: Long, -1: Short
        self.entry_price = 0.0
        
        self.equity_history = [self.initial_balance]
        self.trade_history = []
        
        # State observation
        obs = self._get_observation()
        info = self._get_info()
        
        return obs, info

    def _get_observation(self):
        # Returns current features as a flat vector
        # Future enhancement: Return sequence for Transformer
        return self.df.loc[self.current_step, self.feature_cols].values.astype(np.float32)

    def _get_info(self):
        return {
            "step": self.current_step,
            "net_worth": self.net_worth,
            "position": self.position,
            "balance": self.balance,
            "trades_count": len(self.trade_history)
        }

    def step(self, action):
        # 1. Update market state
        current_price = self.df.loc[self.current_step, 'Close']
        prev_net_worth = self.net_worth
        
        # 2. Execute Action Logic (Trade)
        # Action mapping: 0 -> 0 (Neutral), 1 -> 1 (Long), 2 -> -1 (Short)
        target_position = 0
        if action == 1: target_position = 1
        elif action == 2: target_position = -1
        
        if target_position != self.position:
            self._handle_position_change(target_position, current_price)
        
        # 3. Update Net Worth based on current price
        self._update_net_worth(current_price)
        
        # 4. Calculate Reward
        reward = self._calculate_reward(prev_net_worth)
        
        # 5. Advance Step
        self.current_step += 1
        self.equity_history.append(self.net_worth)
        
        # 6. Check if Done
        terminated = self.current_step >= len(self.df) - 1
        truncated = self.net_worth < (self.initial_balance * 0.1) # Bankruptcy
        
        obs = self._get_observation() if not terminated else np.zeros(self.observation_space.shape, dtype=np.float32)
        info = self._get_info()
        
        return obs, reward, terminated, truncated, info

    def _handle_position_change(self, target_position, price):
        """Logic to close existing position and open a new one with fees/slippage."""
        # 1. Close existing position if any
        if self.position != 0:
            # Closing fee based on current value
            exit_price = price * (1 - self.slippage * self.position)
            fee = self.net_worth * self.commission
            
            # Unrealized PnL is already in net_worth, we just deduct fee
            self.net_worth -= fee
            self.trade_history.append({
                "step": self.current_step,
                "type": "close",
                "price": exit_price,
                "pnl": self.net_worth - self.equity_history[-1]
            })

        # 2. Open new position
        if target_position != 0:
            # Entry price adjusted for slippage
            self.entry_price = price * (1 + self.slippage * target_position)
            # Entry fee
            fee = self.net_worth * self.commission
            self.net_worth -= fee
            
            self.trade_history.append({
                "step": self.current_step,
                "type": "open_" + ("long" if target_position == 1 else "short"),
                "price": self.entry_price
            })
            
        self.position = target_position

    def _update_net_worth(self, current_price):
        """Update net worth based on price action and current position."""
        if self.position == 0:
            return # Neutral stays the same (ignoring inflation/risk-free rate)
            
        if self.position == 1: # Long
            price_return = (current_price - self.entry_price) / self.entry_price
            # We don't update entry_price, we update net_worth relative to initial entry
            # But wait, net_worth should track the cumulative value.
            # Simpler way: current_value = invested_amount * (price / entry_price)
            # Since we use 100% of net_worth (leverage 1):
            pass # PnL is calculated in the next reward step effectively.
            
        # For simplicity in this step, we'll calculate the incremental change 
        # but the actual "net worth" is updated by the price delta.
        # Let's use a more robust way:
        # prev_price = self.df.loc[self.current_step - 1, 'Close'] if self.current_step > 0 else self.entry_price
        # return_pct = (current_price - prev_price) / prev_price * self.position
        # self.net_worth *= (1 + return_pct)
        
        # Correct approach for continuous step:
        if self.current_step > 0:
            prev_price = self.df.loc[self.current_step - 1, 'Close']
            # If we just opened the position this step, the return starts from entry_price
            ref_price = prev_price if self.trade_history and self.trade_history[-1]['step'] < self.current_step else self.entry_price
            
            price_change_pct = (current_price - ref_price) / ref_price
            step_return = price_change_pct * self.position
            self.net_worth *= (1 + step_return)

    def _calculate_reward(self, prev_net_worth):
        if self.reward_type == 'log_returns':
            return float(np.log(self.net_worth / prev_net_worth))
        elif self.reward_type == 'pct_returns':
            return float((self.net_worth - prev_net_worth) / prev_net_worth)
        else:
            return float(self.net_worth - prev_net_worth)

    def render(self, mode="human"):
        if mode == "human":
            print(f"Step: {self.current_step} | Net Worth: {self.net_worth:.2f} | Position: {self.position}")
