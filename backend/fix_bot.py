import sys

file_path = 'app/strategies/wall_hunter_bot.py'
with open(file_path, 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace(\"close_amount = (base_amount * actual_entry * 0.995) / tp_price if getattr(self, 'strategy_mode', 'long') == \\"short\\" else base_amount\", \"close_amount = base_amount\")
text = text.replace(\"close_amount = (base_amount * actual_entry * 0.995) / self.active_pos['tp'] if getattr(self, 'strategy_mode', 'long') == \\"short\\" else base_amount\", \"close_amount = base_amount\")
text = text.replace(\"close_amount = (self.active_pos['amount'] * actual_entry * 0.995) / self.active_pos['tp'] if getattr(self, 'strategy_mode', 'long') == \\"short\\" else self.active_pos['amount']\", \"close_amount = self.active_pos['amount']\")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(text)

print('Success')
