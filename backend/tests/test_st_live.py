import asyncio
from app.services.market_depth_service import market_depth_service
from app.strategies.helpers.supertrend_tracker import SupertrendTracker

async def test_supertrend():
    print("Fetching 1m data for POL/FDUSD...")
    exchange_id = 'binance'
    symbol = 'POL/FDUSD'
    timeframe = '1m'
    
    tracker = SupertrendTracker(exchange_id, symbol, 10, 3.0, timeframe)
    klines = await market_depth_service.fetch_ohlcv(symbol, exchange_id, timeframe, limit=300)
    
    if not klines:
        print("No klines returned!")
        return

    tracker._calculate_supertrend(klines)

    print(f"Latest Trend Dir: {'BUY (1)' if tracker.latest_trend_dir == 1 else 'SELL (-1)'}")
    print(f"Latest Buy Signal: {tracker.latest_buy_signal}")
    print(f"Latest Sell Signal: {tracker.latest_sell_signal}")
    print(f"Latest Trailing Stop: {tracker.latest_trailing_stop}")
    
    # Print the last few closes so we know we are looking at the right data
    print("\nLast 5 Candles (Close):")
    for candle in klines[-5:]:
        print(f"Time: {candle['time']} | Close: {candle['close']}")

if __name__ == "__main__":
    asyncio.run(test_supertrend())
