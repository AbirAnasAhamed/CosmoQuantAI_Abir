import asyncio
import sys
import os

sys.path.insert(0, '/app')

from app.services.bracket_order_service import BracketOrderService
import logging

logging.basicConfig(level=logging.INFO)

class MockExchange:
    def __init__(self):
        self.tp_orders_placed = []
        
    def price_to_precision(self, symbol, price):
        return round(price, 4)
        
    def amount_to_precision(self, symbol, amount):
        return round(amount, 2)

    async def fetch_order(self, order_id, symbol):
        # Mocking an immediate full fill
        print(f"   [MockExchange] fetch_order called for {order_id}. Returning FILLED status.")
        return {
            'status': 'filled',
            'filled': 100.5,
            'average': 0.0950, # Initial fill price
            'price': 0.0950
        }
        
    async def create_limit_order(self, symbol, side, amount, price, params):
        print(f"   [MockExchange] create_limit_order: {side.upper()} {amount} @ {price} | Params: {params}")
        self.tp_orders_placed.append({'side': side, 'type': 'limit', 'price': price, 'amount': amount})
        return {'id': 'mock_tp_limit_123', 'status': 'open'}

    async def create_market_order(self, symbol, side, amount, params):
        print(f"   [MockExchange] create_market_order: {side.upper()} {amount} | Params: {params}")
        self.tp_orders_placed.append({'side': side, 'type': 'market', 'amount': amount})
        return {'id': 'mock_tp_market_123', 'status': 'closed'}

async def verify_bracket():
    print("\n" + "="*50)
    print("   🔍 Verification Script: Bracket TP Module")
    print("="*50)
    
    # 1. Setup mock exchange in the pool globally (monkey patch)
    import app.services.bracket_order_service
    from unittest.mock import AsyncMock, MagicMock
    mock_ex = MockExchange()
    app.services.bracket_order_service.get_or_create_exchange = AsyncMock(return_value=mock_ex)
    app.services.bracket_order_service.decrypt_key = MagicMock(return_value="mock_key")
    
    # Base entry configuration
    api_key_record = MagicMock() # mocked
    entry_order_id = "test_entry_123"
    symbol = "DOGE/USDT"
    side = "buy"  # Long entry
    amount = 100.5
    is_futures = True
    initial_entry_price = 0.0950 # Not used since mock returns average
    
    # Scenario A: Percentage Gap (1.5% TP) limit order
    tp_config_pct = {
        'enabled': True,
        'mode': 'percentage',
        'value': 1.5,
        'order_type': 'limit',
        'timeout_mins': 1
    }
    
    print("\n▶️ SCENARIO A: 1.5% Percentage Limit TP for a BUY order")
    print(f"   Expected TP Side: SELL")
    print(f"   Expected TP Price: 0.0950 + 1.5% = 0.0964")
    
    await BracketOrderService.monitor_and_execute_tp(
        api_key_record, entry_order_id, symbol, side, amount, is_futures, tp_config_pct, initial_entry_price
    )
    
    # Scenario B: Price Gap (+$0.005) limit order
    tp_config_price = {
        'enabled': True,
        'mode': 'price',
        'value': 0.005,
        'order_type': 'market',
        'timeout_mins': 1
    }
    
    side_b = "sell" # Short entry
    
    print("\n▶️ SCENARIO B: $0.005 Absolute Gap Market TP for a SELL (Short) order")
    print(f"   Expected TP Side: BUY")
    print(f"   Expected Market execution, target calculation was: 0.0950 - 0.005 = 0.0900 (though irrelevant for market orders internally)")
    
    await BracketOrderService.monitor_and_execute_tp(
        api_key_record, entry_order_id, symbol, side_b, amount, is_futures, tp_config_price, initial_entry_price
    )
    
    print("\n✅ Verification complete! Look at the [MockExchange] outputs above to confirm math and postOnly flags.")

if __name__ == "__main__":
    asyncio.run(verify_bracket())
