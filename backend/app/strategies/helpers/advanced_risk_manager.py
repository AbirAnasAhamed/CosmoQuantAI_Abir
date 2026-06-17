
import time
import logging

logger = logging.getLogger(__name__)

class AdvancedRiskManager:
    def __init__(self, config: dict):
        self.config = config
        
        # Break-Even State
        self.enable_breakeven = config.get("enable_breakeven_stop", False)
        self.be_type = config.get("breakeven_type", "pct")
        self.be_activation_val = config.get("breakeven_activation_pct", 1.0)
        self.be_fee_buffer_val = config.get("breakeven_fee_buffer_pct", 0.2)
        self.be_trailing = config.get("enable_trailing_breakeven", False)
        self.be_trailing_mode = config.get("trailing_breakeven_mode", "auto")
        self.be_trailing_type = config.get("trailing_breakeven_type", "pct")
        self.be_trailing_dist = config.get("trailing_breakeven_distance", 0.0)
        self.be_cooldown_mins = config.get("breakeven_cooldown_mins", 15)
        
        self.peak_pnl_pct = 0.0
        self.peak_pnl_usd = 0.0
        self.breakeven_triggered = False
        self.cooldown_until = 0

        # Global TP State
        self.enable_global_tp = config.get("enable_global_tp", False)
        self.global_tp_target = config.get("global_tp_target", 0.0)
        self.global_tp_type = config.get("global_tp_type", "daily") # "daily" or "total"
        self.global_tp_close_mode = config.get("global_tp_close_mode", "hard") # "hard" or "soft"
        self.global_tp_action = config.get("global_tp_action", "stop_bot") # "stop_bot" or "notify_only"
        self.global_tp_trailing = config.get("enable_trailing_global_tp", False)
        self.global_tp_trailing_mode = config.get("trailing_global_tp_mode", "auto")
        self.global_tp_trailing_type = config.get("trailing_global_tp_type", "pct")
        self.global_tp_trailing_dist = config.get("trailing_global_tp_distance", 0.0)
        
        self.peak_global_pnl_usd = 0.0
        self.global_tp_triggered = False
        self.daily_pnl_reset_time = self._get_next_midnight()
        self.current_daily_pnl = 0.0

    def update_config(self, new_config: dict):
        self.config.update(new_config)
        
        # Break-Even State
        if "enable_breakeven_stop" in new_config:
            self.enable_breakeven = new_config["enable_breakeven_stop"]
        if "breakeven_type" in new_config:
            self.be_type = new_config["breakeven_type"]
        if "breakeven_activation_pct" in new_config:
            self.be_activation_val = new_config["breakeven_activation_pct"]
        if "breakeven_fee_buffer_pct" in new_config:
            self.be_fee_buffer_val = new_config["breakeven_fee_buffer_pct"]
        if "enable_trailing_breakeven" in new_config:
            self.be_trailing = new_config["enable_trailing_breakeven"]
        if "trailing_breakeven_mode" in new_config:
            self.be_trailing_mode = new_config["trailing_breakeven_mode"]
        if "trailing_breakeven_type" in new_config:
            self.be_trailing_type = new_config["trailing_breakeven_type"]
        if "trailing_breakeven_distance" in new_config:
            self.be_trailing_dist = new_config["trailing_breakeven_distance"]
        if "breakeven_cooldown_mins" in new_config:
            self.be_cooldown_mins = new_config["breakeven_cooldown_mins"]

        # Global TP State
        if "enable_global_tp" in new_config:
            self.enable_global_tp = new_config["enable_global_tp"]
        if "global_tp_target" in new_config:
            self.global_tp_target = new_config["global_tp_target"]
        if "global_tp_type" in new_config:
            self.global_tp_type = new_config["global_tp_type"]
        if "global_tp_close_mode" in new_config:
            self.global_tp_close_mode = new_config["global_tp_close_mode"]
        if "global_tp_action" in new_config:
            self.global_tp_action = new_config["global_tp_action"]
        if "enable_trailing_global_tp" in new_config:
            self.global_tp_trailing = new_config["enable_trailing_global_tp"]
        if "trailing_global_tp_mode" in new_config:
            self.global_tp_trailing_mode = new_config["trailing_global_tp_mode"]
        if "trailing_global_tp_type" in new_config:
            self.global_tp_trailing_type = new_config["trailing_global_tp_type"]
        if "trailing_global_tp_distance" in new_config:
            self.global_tp_trailing_dist = new_config["trailing_global_tp_distance"]

    def _get_next_midnight(self):
        # Calculate timestamp for next midnight (UTC)
        now = time.time()
        current_day_start = now - (now % 86400)
        return current_day_start + 86400

    def update_pnl(self, current_pnl_pct: float, current_pnl_usd: float) -> dict:
        """
        Main entry point for checking risk status.
        Returns a dictionary with actions:
        {
            "action": "stop_bot" | "pause_bot" | "notify_only" | "none",
            "close_mode": "hard" | "soft" | "none",
            "reason": "Break-Even Hit" | "Global TP Hit" | ""
        }
        """
        now = time.time()

        # Handle Cooldown
        if self.cooldown_until > now:
            return {"action": "pause_bot", "close_mode": "none", "reason": "Cooldown Active"}
        elif self.cooldown_until > 0 and self.cooldown_until <= now:
            # Cooldown over, reset state
            self.cooldown_until = 0
            self.breakeven_triggered = False
            self.peak_pnl_pct = 0.0
            self.peak_pnl_usd = 0.0
            logger.info("AdvancedRiskManager: Cooldown finished. Resuming normal operations.")

        # Update Peaks
        if current_pnl_pct > self.peak_pnl_pct:
            self.peak_pnl_pct = current_pnl_pct
        if current_pnl_usd > self.peak_pnl_usd:
            self.peak_pnl_usd = current_pnl_usd
            
        # Handle Daily Reset
        if self.global_tp_type == "daily" and now > self.daily_pnl_reset_time:
            self.current_daily_pnl = 0.0
            self.daily_pnl_reset_time = self._get_next_midnight()
            self.peak_global_pnl_usd = 0.0
            self.global_tp_triggered = False
            logger.info("AdvancedRiskManager: Daily PnL reset to 0.")

        # Calculate tracking PnL for Global TP
        tracking_pnl_usd = current_pnl_usd
        if self.global_tp_type == "daily":
            tracking_pnl_usd = self.current_daily_pnl + current_pnl_usd

        if tracking_pnl_usd > self.peak_global_pnl_usd:
            self.peak_global_pnl_usd = tracking_pnl_usd

        # 1. Check Global TP
        if self.enable_global_tp and self.global_tp_target > 0 and not self.global_tp_triggered:
            if self.global_tp_trailing:
                if self.peak_global_pnl_usd >= self.global_tp_target:
                    trailing_stop_usd = 0.0
                    
                    if self.global_tp_trailing_mode == "auto":
                        # Auto Trailing: close if drops 20% from peak
                        trailing_stop_usd = self.peak_global_pnl_usd * 0.8
                    else:
                        # Manual Trailing
                        if self.global_tp_trailing_type == "pct":
                            drop_amount = self.peak_global_pnl_usd * (self.global_tp_trailing_dist / 100.0)
                            trailing_stop_usd = self.peak_global_pnl_usd - drop_amount
                        else:
                            trailing_stop_usd = self.peak_global_pnl_usd - self.global_tp_trailing_dist
                            
                    if tracking_pnl_usd <= trailing_stop_usd:
                        self.global_tp_triggered = True
                        return {
                            "action": self.global_tp_action, 
                            "close_mode": self.global_tp_close_mode, 
                            "reason": f"Trailing Global TP Hit (Peak: ${self.peak_global_pnl_usd:.2f}, Closed at: ${tracking_pnl_usd:.2f})"
                        }
            else:
                # Hard Target
                if tracking_pnl_usd >= self.global_tp_target:
                    self.global_tp_triggered = True
                    return {
                        "action": self.global_tp_action, 
                        "close_mode": self.global_tp_close_mode, 
                        "reason": f"Global TP Target Hit (${tracking_pnl_usd:.2f})"
                    }

        # 2. Check Break-Even Protection
        if self.enable_breakeven and not self.breakeven_triggered:
            current_val = current_pnl_pct if self.be_type == "pct" else current_pnl_usd
            peak_val = self.peak_pnl_pct if self.be_type == "pct" else self.peak_pnl_usd
            
            # Has it reached the activation threshold?
            if peak_val >= self.be_activation_val:
                # Dynamic Stop Level
                stop_level = self.be_fee_buffer_val
                if self.be_trailing:
                    if self.be_trailing_mode == "auto":
                        # Auto Trailing: lock in half of the profit above the activation threshold
                        profit_above_activation = peak_val - self.be_activation_val
                        stop_level = self.be_fee_buffer_val + (profit_above_activation * 0.5)
                    else:
                        # Manual Trailing
                        if self.be_trailing_type == "pct" and self.be_type == "pct":
                            stop_level = peak_val - self.be_trailing_dist
                        elif self.be_trailing_type == "usd" and self.be_type == "usd":
                            stop_level = peak_val - self.be_trailing_dist
                        elif self.be_trailing_type == "pct" and self.be_type == "usd":
                            drop_amount = peak_val * (self.be_trailing_dist / 100.0)
                            stop_level = peak_val - drop_amount
                        elif self.be_trailing_type == "usd" and self.be_type == "pct":
                            # It's tricky to subtract USD distance from a PCT peak. 
                            # Fallback: Just subtract the distance as a raw value.
                            stop_level = peak_val - self.be_trailing_dist
                            
                    # Ensure trailing stop level never drops below the original fee buffer
                    stop_level = max(self.be_fee_buffer_val, stop_level)

                # Prevent immediate exit due to misconfiguration (e.g. Fee Buffer >= Activation)
                # Cap the stop level slightly below the peak so it doesn't trigger on the very tick it activates
                if stop_level >= peak_val:
                    stop_level = peak_val - (0.01 if self.be_type == "usd" else 0.001)

                if current_val <= stop_level:
                    self.breakeven_triggered = True
                    self.cooldown_until = now + (self.be_cooldown_mins * 60)
                    sym = "%" if self.be_type == "pct" else "$"
                    return {
                        "action": "pause_bot", 
                        "close_mode": "hard", 
                        "reason": f"Break-Even Protection Hit (Stop Level: {stop_level:.2f}{sym})"
                    }

        return {"action": "none", "close_mode": "none", "reason": ""}

    def add_to_daily_pnl(self, realized_pnl_usd: float):
        """Called when a position is closed to lock in daily PnL"""
        self.current_daily_pnl += realized_pnl_usd
