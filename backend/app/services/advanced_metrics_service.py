import pandas as pd
import numpy as np
import logging
import math
from typing import List, Dict, Any
from app.services.market_depth_service import market_depth_service

logger = logging.getLogger(__name__)

class AdvancedMetricsService:
    def __init__(self):
        pass
        
    async def fetch_recent_trades(self, symbol: str, exchange_id: str, limit: int = 1000) -> List[Dict[str, Any]]:
        """Fetches real trades using CCXT."""
        try:
            exchange = await market_depth_service.get_exchange_instance(exchange_id, symbol)
            trades = await exchange.fetch_trades(symbol.upper(), limit=limit)
            return trades
        except Exception as e:
            logger.error(f"Error fetching trades for {symbol}: {e}")
            return []

    async def calculate_delta_profile(self, symbol: str, exchange_id: str, limit: int = 1000) -> List[Dict[str, Any]]:
        """
        Computes Bid-Ask volume profile for each price level based on real trades.
        """
        try:
            trades = await self.fetch_recent_trades(symbol, exchange_id, limit)
            if not trades:
                return []
            
            df = pd.DataFrame(trades)
            if 'price' not in df or 'amount' not in df or 'side' not in df:
                return []

            # Group by rounded price to prevent fragmentation
            # Find a suitable tick size based on price magnitude
            current_price = df['price'].iloc[-1]
            tick_size = 10 ** (math.floor(math.log10(current_price)) - 3) if current_price > 0 else 0.01
            tick_size = max(tick_size, 0.01)

            df['rounded_price'] = (df['price'] / tick_size).round() * tick_size
            
            df['buy_vol'] = np.where(df['side'] == 'buy', df['amount'], 0)
            df['sell_vol'] = np.where(df['side'] == 'sell', df['amount'], 0)
            
            profile = df.groupby('rounded_price').agg({
                'buy_vol': 'sum',
                'sell_vol': 'sum'
            }).reset_index()
            
            profile.rename(columns={'rounded_price': 'price'}, inplace=True)
            profile['delta'] = profile['buy_vol'] - profile['sell_vol']
            
            # Convert to dict format
            result = profile.to_dict('records')
            return result
        except Exception as e:
            logger.error(f"Error calculating delta profile: {e}")
            return []

    async def calculate_tpo_profile(self, symbol: str, exchange_id: str, interval: str = "5m", limit: int = 200) -> Dict[str, Any]:
        """
        Computes Time Price Opportunity (TPO) Market Profile using real Klines.
        """
        try:
            klines = await market_depth_service.fetch_ohlcv(symbol, exchange_id, interval, limit)
            if not klines:
                return {}
                
            df = pd.DataFrame(klines)
            if df.empty:
                return {}

            # Calculate a dynamic tick size based on ATR or standard deviation
            highs = df['high'].values
            lows = df['low'].values
            avg_range = np.mean(highs - lows)
            tick_size = avg_range / 10 if avg_range > 0 else 0.5
            tick_size = max(tick_size, 0.01)

            tpo_counts = {}
            for _, row in df.iterrows():
                high = row['high']
                low = row['low']
                
                start_level = np.floor(low / tick_size) * tick_size
                end_level = np.ceil(high / tick_size) * tick_size
                
                current = start_level
                while current <= end_level:
                    price_key = round(current, 4)
                    tpo_counts[price_key] = tpo_counts.get(price_key, 0) + 1
                    current += tick_size
                    
            return {'tick_size': tick_size, 'tpo': [{'price': k, 'count': v} for k, v in tpo_counts.items()]}
        except Exception as e:
            logger.error(f"Error calculating TPO: {e}")
            return {}

    async def calculate_trade_bubbles(self, symbol: str, exchange_id: str, limit: int = 1000) -> List[Dict[str, Any]]:
        """
        Detects block trades from recent trades to show as bubbles.
        """
        try:
            trades = await self.fetch_recent_trades(symbol, exchange_id, limit)
            if not trades:
                return []
            
            df = pd.DataFrame(trades)
            # Find block trades (e.g., top 5% by volume)
            threshold = df['amount'].quantile(0.95)
            block_trades = df[df['amount'] >= threshold]
            
            # Keep necessary fields: time, price, amount, side
            result = []
            for _, row in block_trades.iterrows():
                result.append({
                    'time': int(row['timestamp'] / 1000) if 'timestamp' in row else row['datetime'],
                    'price': row['price'],
                    'volume': row['amount'],
                    'side': row['side']
                })
                
            return result
        except Exception as e:
            logger.error(f"Error calculating trade bubbles: {e}")
            return []

    async def calculate_oib_oscillator(self, symbol: str, exchange_id: str) -> Dict[str, Any]:
        """
        Calculates Order Book Imbalance (OIB) ratio from the live order book.
        """
        try:
            ob = await market_depth_service.fetch_raw_order_book(symbol, exchange_id, limit=100)
            bids = ob.get('bids', [])
            asks = ob.get('asks', [])
                
            total_bid_vol = sum([b['size'] for b in bids])
            total_ask_vol = sum([a['size'] for a in asks])
            
            if total_bid_vol + total_ask_vol == 0:
                oib = 0.0
            else:
                oib = (total_bid_vol - total_ask_vol) / (total_bid_vol + total_ask_vol)
                
            return {
                "oib": oib,
                "total_bid_vol": total_bid_vol,
                "total_ask_vol": total_ask_vol,
                "timestamp": ob.get('timestamp')
            }
        except Exception as e:
            logger.error(f"Error calculating OIB: {e}")
            return {"oib": 0.0, "total_bid_vol": 0, "total_ask_vol": 0}

    async def detect_spoofing(self, symbol: str, exchange_id: str) -> List[Dict[str, Any]]:
        """
        Detect spoofing by finding excessively large limit orders near the spread.
        """
        try:
            ob = await market_depth_service.fetch_raw_order_book(symbol, exchange_id, limit=50)
            bids = ob.get('bids', [])
            asks = ob.get('asks', [])
            
            if not bids or not asks:
                return []
                
            avg_bid_size = np.mean([b['size'] for b in bids])
            avg_ask_size = np.mean([a['size'] for a in asks])
            
            spoof_walls = []
            
            for b in bids:
                if b['size'] > avg_bid_size * 10:
                    spoof_walls.append({'price': b['price'], 'size': b['size'], 'side': 'buy', 'timestamp': ob.get('timestamp')})
            
            for a in asks:
                if a['size'] > avg_ask_size * 10:
                    spoof_walls.append({'price': a['price'], 'size': a['size'], 'side': 'sell', 'timestamp': ob.get('timestamp')})
                    
            return spoof_walls
        except Exception as e:
            logger.error(f"Error detecting spoofing: {e}")
            return []

    async def detect_delta_divergence(self, symbol: str, exchange_id: str) -> List[Dict[str, Any]]:
        """
        Detect Delta Divergence by comparing Price trend with CVD trend.
        """
        try:
            klines = await market_depth_service.fetch_ohlcv(symbol, exchange_id, "5m", limit=20)
            trades = await self.fetch_recent_trades(symbol, exchange_id, limit=1000)
            
            if not klines or not trades:
                return []
                
            df_klines = pd.DataFrame(klines)
            df_trades = pd.DataFrame(trades)
            
            df_trades['delta'] = np.where(df_trades['side'] == 'buy', df_trades['amount'], -df_trades['amount'])
            cvd = df_trades['delta'].sum()
            
            price_change = df_klines['close'].iloc[-1] - df_klines['close'].iloc[0]
            
            divergences = []
            
            if price_change > 0 and cvd < 0:
                divergences.append({
                    'time': int(df_klines['time'].iloc[-1]),
                    'type': 'bearish',
                    'message': 'Bearish Delta Divergence'
                })
            elif price_change < 0 and cvd > 0:
                divergences.append({
                    'time': int(df_klines['time'].iloc[-1]),
                    'type': 'bullish',
                    'message': 'Bullish Delta Divergence'
                })
                
            return divergences
        except Exception as e:
            logger.error(f"Error detecting delta divergence: {e}")
            return []
            
    async def calculate_anchored_vwap(self, symbol: str, exchange_id: str, anchor_timeframe: str = "1d", limit: int = 200) -> List[Dict[str, Any]]:
        try:
            klines = await market_depth_service.fetch_ohlcv(symbol, exchange_id, "5m", limit)
            if not klines:
                return []
            
            df = pd.DataFrame(klines)
            if df.empty:
                return []
                
            df = df.sort_values('time')
            df['typical_price'] = (df['high'] + df['low'] + df['close']) / 3
            df['pv'] = df['typical_price'] * df['volume']
            df['cum_pv'] = df['pv'].cumsum()
            df['cum_vol'] = df['volume'].cumsum()
            df['vwap'] = df['cum_pv'] / df['cum_vol']
            
            result = []
            for _, row in df.iterrows():
                result.append({
                    'time': int(row['time']),
                    'value': row['vwap']
                })
            return result
        except Exception as e:
            logger.error(f"Error calculating Anchored VWAP: {e}")
            return []
            
    async def detect_footprint_imbalances(self, symbol: str, exchange_id: str, limit: int = 1000) -> List[Dict[str, Any]]:
        try:
            trades = await self.fetch_recent_trades(symbol, exchange_id, limit)
            if not trades:
                return []
                
            df = pd.DataFrame(trades)
            current_price = df['price'].iloc[-1]
            tick_size = 10 ** (math.floor(math.log10(current_price)) - 3) if current_price > 0 else 0.01
            tick_size = max(tick_size, 0.01)

            df['rounded_price'] = (df['price'] / tick_size).round() * tick_size
            df['buy_vol'] = np.where(df['side'] == 'buy', df['amount'], 0)
            df['sell_vol'] = np.where(df['side'] == 'sell', df['amount'], 0)
            
            grouped = df.groupby(['rounded_price']).agg({'buy_vol': 'sum', 'sell_vol': 'sum'}).reset_index()
            
            imbalances = []
            for _, row in grouped.iterrows():
                if row['buy_vol'] > 0 and row['sell_vol'] == 0:
                    imbalances.append({'price': row['rounded_price'], 'type': 'buy_imbalance', 'ratio': 999})
                elif row['sell_vol'] > 0 and row['buy_vol'] == 0:
                    imbalances.append({'price': row['rounded_price'], 'type': 'sell_imbalance', 'ratio': 999})
                elif row['buy_vol'] > row['sell_vol'] * 3:
                    imbalances.append({'price': row['rounded_price'], 'type': 'buy_imbalance', 'ratio': row['buy_vol']/row['sell_vol']})
                elif row['sell_vol'] > row['buy_vol'] * 3:
                    imbalances.append({'price': row['rounded_price'], 'type': 'sell_imbalance', 'ratio': row['sell_vol']/row['buy_vol']})
                    
            return imbalances
        except Exception as e:
            logger.error(f"Error detecting footprint imbalances: {e}")
            return []

advanced_metrics_service = AdvancedMetricsService()
