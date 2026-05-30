import asyncio
import sys
import os

# Ensure backend is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '.')))

from app.strategies.cascading_bb import CascadingBBBot
import pandas as pd
import numpy as np

class MockLogger:
    def info(self, msg, *args, **kwargs):
        print(f"[INFO] {msg}")
    def warning(self, msg, *args, **kwargs):
        print(f"[WARNING] {msg}")
    def error(self, msg, *args, **kwargs):
        print(f"[ERROR] {msg}")

class MockEngine:
    def __init__(self):
        self.active_position = None

    async def execute_trade(self, side, amount, price):
        print(f"[TRADE EXECUTED] {side.upper()} {amount} @ {price}")
        if side == 'buy':
            self.active_position = {'amount': amount, 'entry_price': price}
        else:
            self.active_position = None
        return True

class MockExchange:
    def __init__(self):
        self.call_count = 0

    async def fetch_ohlcv(self, symbol, timeframe, limit):
        # We will return dummy OHLCV data
        # We need a stable BB, so let's make close price flat at 100 for previous candles
        # Then the last candle drops depending on the timeframe and call count to simulate time passing.
        
        self.call_count += 1
        
        base_data = []
        now = 1600000000000
        for i in range(25):
            # timestamp, open, high, low, close, volume
            base_data.append([now + i*60000, 100.0, 101.0, 99.0, 100.0, 1000.0])
            
        # The Bollinger bands for a flat 100 will have mid 100. 
        # Standard deviation depends on variance. We'll introduce some variance.
        for i in range(25):
            val = 100 + np.sin(i) * 2 # values between 98 and 102
            base_data[i][4] = val
        
        # Scenario:
        # call_count 1: TF 1m -> price crashes to 90 (below lower band, breaks by >0.5%)
        # call_count 2: TF 3m -> price stays at 90 (below lower band, breaks by >0.5%)
        # call_count 3: TF 5m -> price is 95 (below lower band but within 0.5% threshold, triggering BUY)
        # call_count 4: TF 1m -> reset to 1m? No, stays at 5m? Wait, it cascades to 5m, buys, then what?
        # After buy, it will check for upper band. So next we simulate hitting upper band to SELL.
        # call_count 5: TF 5m -> price is 110 (hits upper band, triggers SELL)
        
        last_idx = 24
        if self.call_count == 1:
            base_data[last_idx][4] = 90.0 # Huge drop
        elif self.call_count == 2:
            base_data[last_idx][4] = 90.0 # Huge drop continues
        elif self.call_count == 3:
            # lower_band is around ~96.7. Threshold is 96.7 * 0.995 = 96.21
            # We want price to be between 96.21 and 96.7 so it triggers BUY and NOT cascade.
            base_data[last_idx][4] = 96.5
        elif self.call_count == 4:
            base_data[last_idx][4] = 110.0 # Pump to upper band!
        elif self.call_count > 4:
            # Should reset to 1m
            base_data[last_idx][4] = 100.0
            
        return base_data

    async def close(self):
        pass

async def run_test():
    print("=== STARTING CASCADING BB VERIFICATION SCRIPT ===")
    
    config = {
        "symbol": "DOGE/USDT",
        "exchange": "binance",
        "is_paper_trading": True,
        "bb_length": 20,
        "bb_std": 2.0,
        "break_percentage": 0.5,
        "amount_per_trade": 100,
        "band_tolerance": 0.5,
        "cascading_tp_mode": "dynamic"
    }
    
    bot = CascadingBBBot(bot_id=999, config=config)
    bot.logger = MockLogger()
    bot.engine = MockEngine()
    bot._exchange = MockExchange()
    bot.running = True
    
    print("Simulating bot loop for 6 iterations...")
    
    for i in range(6):
        print(f"\n--- Iteration {i+1} ---")
        current_tf = bot.timeframes[bot.current_tf_index]
        bot.logger.info(f"🔍 Monitoring timeframe: {current_tf}")
        
        bb_data = await bot._fetch_bb_data(current_tf)
        if bb_data:
            price = bb_data['close']
            lower_band = bb_data['lower']
            upper_band = bb_data['upper']
            
            print(f"Price: {price:.2f} | Lower: {lower_band:.2f} | Upper: {upper_band:.2f}")
            
            break_threshold_lower = lower_band * (1 - (bot.break_percentage / 100))
            break_threshold_upper = upper_band * (1 + (bot.break_percentage / 100))
            
            band_broken = False
            
            if price < break_threshold_lower:
                bot.logger.warning(f"⚠️ {current_tf} Lower Band BROKEN! Price {price} < {break_threshold_lower:.4f} (Threshold)")
                band_broken = True
            elif price > break_threshold_upper:
                bot.logger.warning(f"⚠️ {current_tf} Upper Band BROKEN! Price {price} > {break_threshold_upper:.4f} (Threshold)")
                band_broken = True
                
            if band_broken:
                if bot.current_tf_index < len(bot.timeframes) - 1:
                    bot.current_tf_index += 1
                    next_tf = bot.timeframes[bot.current_tf_index]
                    bot.logger.info(f"🔄 Cascading to next timeframe: {next_tf}")
                else:
                    bot.logger.warning(f"⚠️ Reached max timeframe {current_tf}. Cannot cascade further.")
                continue

            buy_threshold = lower_band * (1 + (bot.band_tolerance / 100))
            if price <= buy_threshold and not bot.engine.active_position:
                bot.logger.info(f"📈 Buy Signal on {current_tf}! Price {price} hit Lower Band zone {buy_threshold:.4f} (Actual LB: {lower_band:.4f})")
                await bot.engine.execute_trade("buy", bot.trade_amount, price)
            
            sell_threshold = upper_band * (1 - (bot.band_tolerance / 100))
            if bot.tp_mode == "dynamic" and price >= sell_threshold:
                if bot.engine.active_position:
                    bot.logger.info(f"📉 Sell Signal on {current_tf}! Price {price} hit Upper Band zone {sell_threshold:.4f} (Actual UB: {upper_band:.4f})")
                    await bot.engine.execute_trade("sell", bot.engine.active_position['amount'], price)
                    bot.logger.info(f"🔄 Resetting cascading timeframe to base ({bot.timeframes[0]}) after successful trade.")
                    bot.current_tf_index = 0
                    
    print("\n=== VERIFICATION COMPLETE ===")

if __name__ == "__main__":
    asyncio.run(run_test())
