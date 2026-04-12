import sys

content = open('e:/CosmoQuantAI/backend/app/strategies/wall_hunter_futures.py', 'r', encoding='utf-8').read()

old_atr = """                # --- NEW: Partial TP1 calculation ---
                if self.enable_micro_scalp:
                    tick_profit_pct = self.micro_scalp_profit_ticks * 0.0001
                    tp_price = actual_entry * (1 + tick_profit_pct) if side == "buy" else actual_entry * (1 - tick_profit_pct)
                    self.active_pos.update({
                        "tp": tp_price,
                        "tp1": tp_price, 
                        "tp1_hit": True, # No partial for micro-scalp
                        "breakeven_hit": False,
                        "limit_order_id": None
                    })"""

new_atr = """                # --- NEW: Partial TP1 calculation ---
                if self.enable_micro_scalp:
                    if getattr(self, 'enable_dynamic_atr_scalp', False) and getattr(self, 'current_atr', 0) > 0:
                        atr_distance = self.current_atr * getattr(self, 'micro_scalp_atr_multiplier', 0.5)
                        tick_profit_pct = (atr_distance / actual_entry) if actual_entry > 0 else 0
                        tp_price = actual_entry * (1 + tick_profit_pct) if side == "buy" else actual_entry * (1 - tick_profit_pct)
                    else:
                        tick_profit_pct = self.micro_scalp_profit_ticks * 0.0001
                        tp_price = actual_entry * (1 + tick_profit_pct) if side == "buy" else actual_entry * (1 - tick_profit_pct)
                        
                    if getattr(self, 'enable_dynamic_atr_scalp', False) and getattr(self, 'current_atr', 0) > 0:
                        sl_distance = self.current_atr * getattr(self, 'atr_multiplier', 1.0)
                        sl_pct = (sl_distance / actual_entry) if actual_entry > 0 else 0
                        sl_price = actual_entry * (1 - sl_pct) if side == "buy" else actual_entry * (1 + sl_pct)
                        self.active_pos['sl'] = sl_price
                        
                    self.active_pos.update({
                        "tp": tp_price,
                        "tp1": tp_price, 
                        "tp1_hit": True,
                        "breakeven_hit": False,
                        "limit_order_id": None
                    })"""

content = content.replace(old_atr, new_atr)

with open('e:/CosmoQuantAI/backend/app/strategies/wall_hunter_futures.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("ATR Patch applied.")
