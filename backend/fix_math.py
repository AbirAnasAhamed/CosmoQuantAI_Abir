import sys

file_path = 'app/strategies/wall_hunter_bot.py'
with open(file_path, 'r', encoding='utf-8') as f:
    code = f.read()

replacements = {
    \"(base_amount * actual_entry * 0.995) / tp_price if getattr(self, 'strategy_mode', 'long') == \\"short\\" else base_amount\": \"base_amount\",
    \"(base_amount * actual_entry * 0.995) / self.active_pos['tp'] if getattr(self, 'strategy_mode', 'long') == \\"short\\" else base_amount\": \"base_amount\",
    \"(self.active_pos['amount'] * actual_entry * 0.995) / self.active_pos['tp'] if getattr(self, 'strategy_mode', 'long') == \\"short\\" else self.active_pos['amount']\": \"self.active_pos['amount']\",
    \"(sell_amount_raw * self.active_pos['entry'] * 0.99) / calc_price\": \"sell_amount_raw\",
    \"(remaining_raw * self.active_pos['entry'] * 0.99) / self.active_pos['tp'] if getattr(self, 'strategy_mode', 'long') == \\"short\\" else remaining_raw\": \"remaining_raw\",
    \"(sell_amount_raw * self.active_pos['entry'] * 0.995) / current_price if getattr(self, 'strategy_mode', 'long') == \\"short\\" else sell_amount_raw\": \"sell_amount_raw\",
    \"total_usd_budget = self.active_pos['amount'] * self.active_pos['entry'] * 0.99\": \"total_usd_budget = self.active_pos['amount'] * self.active_pos['entry']\",
    \"(remaining_base * self.active_pos['entry'] * 0.995) / current_price if getattr(self, 'strategy_mode', 'long') == \\"short\\" else remaining_base\": \"remaining_base\"
}

count = 0
for old, new in replacements.items():
    if old in code:
        code = code.replace(old, new)
        count += 1

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(code)

print(f'Successfully replaced {count} math scaling chunks to 1:1 ratio.')
