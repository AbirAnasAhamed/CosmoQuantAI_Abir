import asyncio
import os
import sys

# Add the backend directory to python path for imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), 'backend')))

from app.strategies.wall_hunter_bot import WallHunterBot
import ccxt.pro as ccxt

# Mock an exchange module that would throw an InvalidOrder precision issue
class MockExchange:
    def __init__(self):
        self.markets = {
            'DOGE/USDT': {
                'precision': {
                    'amount': 0.0001,
                    'price': 0.00001
                }
            }
        }
        self.amount_to_precision_called_with = None

    def amount_to_precision(self, symbol, amount):
        # ccxt's internal logic rounds based on market precision. 
        # For testing we just simulate truncating to 4 decimal places given 0.0001 precision.
        self.amount_to_precision_called_with = amount
        return f"{amount:.4f}"
        
    def fetch_order_book(self, *args, **kwargs): ...
    def fetch_order(self, *args, **kwargs): ...
    async def watch_order_book(self, *args, **kwargs): ...
    async def close(self): ...

class MockEngine:
    def __init__(self):
        self.exchange = MockExchange()
        self.trades = []

    async def execute_trade(self, side, amount, price, order_type="market"):
        self.trades.append({"side": side, "amount": amount, "price": price, "type": order_type})
        return {"id": "mock_123", "average": price, "price": price}
        
    async def cancel_order(self, order_id):
        pass

async def test_precision_fix():
    print("Initializing Wall Hunter Bot with mocked exchange engine...")
    config = {
        "symbol": "DOGE/USDT",
        "exchange": "binance",
        "is_paper_trading": True,
        "amount_per_trade": 10.0,
        "partial_tp_pct": 50.0,
        "sell_order_type": "limit",
        "target_spread": 0.0004
    }
    
    bot = WallHunterBot(bot_id=999, config=config)
    bot.engine = MockEngine()
    
    # Simulate an active position with a float number that causes precision issues
    # e.g., entry amount was 10.123, partial tp 50% => 5.0615 which goes beyond precision (0.0001) for some hypothetical setups
    # or simple float math issues like 10.0 * 0.5 = 5.0 (which is fine) but let's test a weird float
    
    weird_amount = 65.43219999999999  # Example of a float precision artifact
    entry_price = 0.15000
    
    bot.active_pos = {
        "entry": entry_price,
        "amount": weird_amount,
        "sl": entry_price * 0.95,
        "tp1": entry_price + 0.0002,
        "tp": entry_price + 0.0004,
        "tp1_hit": False,
        "limit_order_id": None,
        "micro_scalp": False
    }
    
    bot.highest_price = entry_price
    
    current_price = bot.active_pos['tp1']  # Trigger TP1
    
    print(f"Original position amount: {bot.active_pos['amount']}")
    print(f"Triggering TP1 at price: {current_price}")
    print("-" * 50)
    
    # Manually call manage_risk which contains the TP1 logic
    await bot.manage_risk(current_price)
    
    print("-" * 50)
    print("After TP1 partial execution:")
    # We check if 50% of the weird amount was formatted properly
    print(f"Remaining amount format in active_pos: {bot.active_pos['amount']} (Type: {type(bot.active_pos['amount'])})")
    
    # Engine trades should contain the sell order
    for t in bot.engine.trades:
        print(f"Executed trade: {t}")
        print(f"Trade amount type: {type(t['amount'])}")
        
    print("\nDid the precision fix work?")
    
    # 50% of 65.43219999999999 is 32.71609999999999...
    # The formatted string by MockExchange is given back as float
    formatted_val = bot.engine.exchange.amount_to_precision_called_with
    print(f"Original unformatted raw value sent to amount_to_precision: {formatted_val}")
    print(f"MockExchange amount_to_precision returning valid truncated float length.")
    
    if len(str(bot.active_pos['amount']).split('.')[-1]) <= 4:
         print("\n✅ Verification Passed! The numbers are formatted to the correct precision and are ready for exchange API.")
    else:
         print("\n❌ Verification Failed! Float precision issue is still present.")


if __name__ == "__main__":
    asyncio.run(test_precision_fix())
