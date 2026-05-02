import asyncio
import json
import websockets
import time
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.orderbook_snapshot import OrderBookSnapshot

class L2DataCollector:
    def __init__(self, symbols=["btcusdt"], exchange="Binance"):
        self.symbols = symbols
        self.exchange = exchange
        self.running = False
        self.task = None
        self._url = "wss://stream.binance.com:9443/ws"

    def calculate_micro_features(self, bids, asks):
        # bids/asks format from binance: [["price", "volume"], ...]
        if not bids or not asks:
            return 0.0, 0.0, 0.0
            
        try:
            best_bid_price = float(bids[0][0])
            best_ask_price = float(asks[0][0])
            spread = best_ask_price - best_bid_price
            
            # Sum volume for top 10 levels
            bid_vol = sum(float(b[1]) for b in bids[:10])
            ask_vol = sum(float(a[1]) for a in asks[:10])
            
            obi = (bid_vol - ask_vol) / (bid_vol + ask_vol) if (bid_vol + ask_vol) > 0 else 0.0
            
            # Microprice: Volume weighted mid price
            microprice = (best_bid_price * ask_vol + best_ask_price * bid_vol) / (bid_vol + ask_vol) if (bid_vol + ask_vol) > 0 else (best_bid_price + best_ask_price) / 2
            
            return obi, spread, microprice
        except Exception:
            return 0.0, 0.0, 0.0

    async def _save_to_db(self, symbol, bids, asks, obi, spread, microprice):
        db = SessionLocal()
        try:
            # We don't save every 100ms as it will crash the DB.
            # We save every 1 second (1000ms). The caller will rate limit it.
            snapshot = OrderBookSnapshot(
                exchange=self.exchange,
                symbol=symbol.upper(),
                bids=bids[:20],  # Save only top 20 levels
                asks=asks[:20],
                obi=obi,
                spread=spread,
                microprice=microprice
            )
            db.add(snapshot)
            db.commit()
        except Exception as e:
            print(f"Error saving L2 data to DB: {e}")
            db.rollback()
        finally:
            db.close()

    async def start_collector(self):
        self.running = True
        
        streams = [f"{s.lower()}@depth20@100ms" for s in self.symbols]
        stream_url = self._url + "/" + "/".join(streams)
        
        last_save_time = {}
        
        while self.running:
            try:
                print(f"🚀 L2DataCollector connecting to {stream_url}...")
                async with websockets.connect(stream_url) as ws:
                    print("✅ L2DataCollector connected successfully.")
                    while self.running:
                        message = await ws.recv()
                        data = json.loads(message)
                        
                        # Handle multi-stream payload format if used, else direct payload
                        # Binance format for @depth20:
                        # {
                        #   "lastUpdateId": 160,
                        #   "bids": [ [ "4.00000000", "431.00000000" ] ],
                        #   "asks": [ [ "4.00000200", "12.00000000" ] ]
                        # }
                        # Wait, since we are subscribing directly, the symbol isn't in the root unless it's a combined stream.
                        # If we use a combined stream, it looks like: {"stream":"btcusdt@depth20@100ms","data":{...}}
                        # Wait, we used `wss://stream.binance.com:9443/ws/btcusdt@depth20@100ms`, which is a single stream if there is only 1 symbol.
                        # Let's handle both just in case.
                        if "data" in data and "stream" in data:
                            symbol = data["stream"].split("@")[0].upper()
                            payload = data["data"]
                        else:
                            symbol = self.symbols[0].upper() # Fallback for single stream
                            payload = data
                            
                        bids = payload.get("bids", [])
                        asks = payload.get("asks", [])
                        
                        current_time = time.time()
                        # Only save 1 snapshot per second per symbol to DB
                        if symbol not in last_save_time or (current_time - last_save_time[symbol]) >= 1.0:
                            obi, spread, microprice = self.calculate_micro_features(bids, asks)
                            asyncio.create_task(self._save_to_db(symbol, bids, asks, obi, spread, microprice))
                            last_save_time[symbol] = current_time
                            
            except Exception as e:
                print(f"❌ L2DataCollector WebSocket Error: {e}")
                if self.running:
                    await asyncio.sleep(5)  # Reconnect delay

    def start(self):
        if not self.task:
            self.task = asyncio.create_task(self.start_collector())
            
    def stop(self):
        self.running = False
        if self.task:
            self.task.cancel()
            self.task = None

# Global instance
l2_collector = L2DataCollector()
