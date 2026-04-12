from typing import List, Dict, Any
from datetime import datetime
from app.services.block_trade_monitor import block_trade_monitor

class DarkPoolService:
    """
    Service to track "Smart Money" activity via Large Block Trades and OTC proxies.
    Uses algorithmic detection of large volume blocks from active exchanges.
    """

    async def get_institutional_flow(self, symbol: str) -> Dict[str, Any]:
        """
        Generates Institutional Flow analysis based on real block trades.
        """
        # Ensure symbol format (e.g., BTC -> BTC/USDT)
        search_symbol = symbol
        if "/" not in symbol:
            search_symbol = f"{symbol}/USDT"

        # 1. Fetch recent large trades (Real data)
        block_trades_map = await block_trade_monitor.fetch_recent_trades(search_symbol, limit=20)
        
        # Flatten map to list
        all_trades = []
        for ex_id, trades in block_trades_map.items():
            for t in trades:
                all_trades.append({
                    "timestamp": t['datetime'],
                    "volume": t['amount'],
                    "price": t['price'],
                    "value_usd": t['value'],
                    "side": t['side'].upper() if t['side'] else 'UNKNOWN',
                    "source": f"{ex_id.capitalize()} Block"
                })

        # Sort by latest
        all_trades.sort(key=lambda x: x['timestamp'], reverse=True)

        # 2. Calculate Sentiment
        buy_vol = sum(t['volume'] for t in all_trades if t['side'] == 'BUY')
        sell_vol = sum(t['volume'] for t in all_trades if t['side'] == 'SELL')
        total_vol = buy_vol + sell_vol

        sentiment_score = 0.0
        if total_vol > 0:
            # Range -1 (Bearish) to +1 (Bullish)
            sentiment_score = (buy_vol - sell_vol) / total_vol

        # 3. Calculate Net Flow
        net_flow = buy_vol - sell_vol

        return {
            "symbol": symbol,
            "sentiment_score": round(sentiment_score, 2),
            "net_flow": round(net_flow, 2),
            "large_buy_volume": round(buy_vol, 2),
            "large_sell_volume": round(sell_vol, 2),
            "block_trades": all_trades[:10], # Return top 10
            "timestamp": datetime.now().isoformat()
        }

dark_pool_service = DarkPoolService()
