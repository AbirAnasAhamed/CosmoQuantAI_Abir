import sys
import os
import asyncio
import logging

# Add backend to path so we can import app modules
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.services.block_trade_monitor import BlockTradeMonitor

# Configure logging to see output
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

async def verify_fix():
    print("Initializing BlockTradeMonitor...")
    monitor = BlockTradeMonitor()
    
    # Check if OKX is in exchanges
    if 'okx' in monitor.exchanges:
        print("OKX exchange initialized.")
        # Check headers (if accessible, otherwise rely on behavior)
        print(f"User-Agent: {monitor.exchanges['okx'].userAgent}")
    else:
        print("OKX exchange NOT initialized (check config).")
        return

    symbol = 'BTC/USDT'
    print(f"\n--- Attempt 1: Fetching trades for {symbol} ---")
    await monitor.fetch_recent_trades(symbol, limit=5)
    
    print("\n--- Attempt 2: Fetching trades (Should be suppressed if 403) ---")
    await monitor.fetch_recent_trades(symbol, limit=5)

    print("\n--- Attempt 3: Fetching trades (Should be suppressed) ---")
    await monitor.fetch_recent_trades(symbol, limit=5)
    
    print("\nVerification Complete. Check logs above for 'Suppressed frequent logs'.")
    await monitor.close_exchanges()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(verify_fix())
