import sys

content = open('e:/CosmoQuantAI/backend/app/strategies/wall_hunter_futures.py', 'r', encoding='utf-8').read()

old_pnl = """            if res:
                pnl_val = (current_price - self.active_pos['entry']) * sell_amount_raw if side == "long" else (self.active_pos['entry'] - current_price) * sell_amount_raw
                self.total_realized_pnl += pnl_val
                self.total_executed_orders += 1"""

new_pnl = """            if res:
                actual_exit_price = current_price
                if not self.is_paper_trading:
                    try:
                        if 'final_status' in locals() and final_status and final_status.get('average'):
                            actual_exit_price = float(final_status['average'])
                        elif res.get('average'):
                            actual_exit_price = float(res['average'])
                    except Exception: pass
                    
                pnl_val = (actual_exit_price - self.active_pos['entry']) * sell_amount_raw if side == "long" else (self.active_pos['entry'] - actual_exit_price) * sell_amount_raw
                self.total_realized_pnl += pnl_val
                self.total_executed_orders += 1"""

content = content.replace(old_pnl, new_pnl)

old_tp = """        exit_side = "sell" if side == "long" else "buy"
        res = None
        exit_order_type = self.sell_order_type if side == "long" else self.buy_order_type
        
        if exit_order_type == 'limit':
            res = await self.engine.execute_trade(exit_side, sell_amount, current_price, order_type="limit", params={'reduceOnly': True})
            if res: logger.info(f"Placed Limit Order for Partial TP at {current_price}")
            if res and self.is_paper_trading:
                # Mock instant fill for paper trade limit at current price
                await self.engine.execute_trade(exit_side, sell_amount, current_price)
        else:
            exit_order_type_actual = exit_order_type
            if exit_order_type_actual == "marketable_limit":
                exit_order_type_actual = "market"
            res = await self.engine.execute_trade(exit_side, sell_amount, current_price, order_type=exit_order_type_actual, params={'reduceOnly': True})
            if res: logger.info(f"Executed {exit_order_type_actual.upper()} Order for Partial TP at {current_price}")"""

new_tp = """        exit_side = "sell" if side == "long" else "buy"
        
        # Force Market Taker for Partial TP to prevent execution freezes
        res = await self.engine.execute_trade(exit_side, sell_amount, current_price, order_type="market", params={'reduceOnly': True})
        if res: logger.info(f"Executed MARKET Taker Order for guaranteed Partial TP at {current_price}")"""
        
content = content.replace(old_tp, new_tp)

with open('e:/CosmoQuantAI/backend/app/strategies/wall_hunter_futures.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("Patch applied.")
