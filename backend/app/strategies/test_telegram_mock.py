import asyncio
import sys
import time
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from app.strategies.wall_hunter_futures import WallHunterFuturesStrategy

class MockBotRecord:
    def __init__(self):
        self.id = 999
        self.owner_id = 1
        self.market = "DOGE/USDC"
        self.exchange = "binance"
        self.is_paper_trading = True
        self.config = {}
        self.name = "Test Telegram Bot"

class MockEngine:
    pass

async def test_notification():
    bot_record = MockBotRecord()
    strategy = WallHunterFuturesStrategy(bot_record, MockEngine())
    
    # Mock the _send_telegram method to just print to console
    async def mock_send_telegram(msg: str):
        print("\n[MOCK TELEGRAM SENT]:")
        print("-------------------------------------------------")
        print(msg)
        print("-------------------------------------------------\n")

    strategy._send_telegram = mock_send_telegram

    # Fake active position with entry_time set to 1 hour, 5 mins and 12 seconds ago
    fake_entry_time = time.time() - (3600 + 5 * 60 + 12)
    strategy.active_pos = {
        'side': 'long',
        'entry': 0.105640,
        'amount': 1000,
        'tp': 0.105620,
        'tp1': 0.105630,
        'sl': 0.105800,
        'entry_time': fake_entry_time
    }
    
    strategy.total_realized_pnl = 0.0812345
    strategy.total_wins = 4
    strategy.total_losses = 0

    print("=== TESTING ENTRY MESSAGE ===")
    trade_type = "Long"
    entry_msg = (
        f"⚡ WallHunter Entered!\\n"
        f"Bot Name: {strategy.bot_name}\\n"
        f"Bot ID: {strategy.bot_id}\\n"
        f"Trade Types: {trade_type}\\n"
        f"Pair: {strategy.symbol}\\n"
        f"Entry {strategy.active_pos['entry']:.6f}\\n"
        f"TP1: {strategy.active_pos['tp1']:.6f}\\n"
        f"Final TP: {strategy.active_pos['tp']:.6f}\\n"
        f"SL: {strategy.active_pos['sl']:.6f}"
    )
    await strategy._send_telegram(entry_msg)

    print("=== TESTING EXIT MESSAGE ===")
    await strategy._send_exit_telegram(
        title="🎯 Futures EXIT - Limit TP Filled! (TEST)", 
        filled_price=0.105620, 
        pnl_val=0.0157845
    )

if __name__ == "__main__":
    asyncio.run(test_notification())
