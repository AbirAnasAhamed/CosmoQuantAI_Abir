"""
Dynamic L2 Data Collector
=========================
- Automatically loads symbols from all is_auto_retrain=1 models in DB
- Supports both Binance Spot and Binance Futures (USDT-M) WebSocket streams
- Gracefully handles reconnection on disconnect
"""

import asyncio
import json
import websockets
import time
import logging
from app.db.session import SessionLocal
from app.models.orderbook_snapshot import OrderBookSnapshot

logger = logging.getLogger(__name__)


class L2DataCollector:
    # Binance WebSocket base URLs
    _SPOT_URL    = "wss://stream.binance.com:9443/stream"
    _FUTURES_URL = "wss://fstream.binance.com/stream"

    def __init__(self):
        self.spot_symbols: list[str]    = []   # e.g. ["btcusdt"]
        self.futures_symbols: list[str] = []   # e.g. ["dogeusdt"]
        self.running = False
        self._tasks: list[asyncio.Task] = []

    # ── Symbol Helpers ─────────────────────────────────────────────────────

    @staticmethod
    def parse_symbol(raw: str) -> tuple[str, bool]:
        """
        Convert any ccxt-style symbol to (binance_stream_symbol, is_futures).
        Examples:
          "DOGE/USDT:USDT" → ("dogeusdt", True)
          "BTC/USDT:USDT"  → ("btcusdt",  True)
          "BTC/USDT"       → ("btcusdt",  False)
          "DOGEUSDT"       → ("dogeusdt", False)
        """
        is_futures = ":" in raw
        clean = raw.upper().split(":")[0].replace("/", "").lower()
        return clean, is_futures

    @staticmethod
    def _build_url(base: str, symbols: list[str]) -> str:
        """Build a Binance combined-stream URL for the given symbols."""
        streams = "/".join(f"{s}@depth20@100ms" for s in symbols)
        return f"{base}?streams={streams}"

    # ── DB Symbol Loader ───────────────────────────────────────────────────

    def load_symbols_from_db(self) -> tuple[list[str], list[str]]:
        """
        Query DB for ALL models in ML Registry and extract their symbols.
        Returns (spot_symbols, futures_symbols) as lowercase Binance stream names.
        """
        from app.models.ml_model import CustomMLModel
        db = SessionLocal()
        spot, futures = [], []
        try:
            # ✅ ALL models — auto-retrain on OR off
            models = db.query(CustomMLModel).all()

            for m in models:
                raw = m.name.split(" ")[0] if " " in m.name else m.name
                stream_sym, is_fut = self.parse_symbol(raw)
                if not stream_sym:
                    continue
                target = futures if is_fut else spot
                if stream_sym not in target:
                    target.append(stream_sym)
                    logger.info(
                        f"[L2Collector] {'Futures' if is_fut else 'Spot'} symbol "
                        f"from model '{m.name}': {stream_sym}"
                    )

            if not spot and not futures:
                logger.info("[L2Collector] No models in ML Registry. Collector will stay idle.")

            return spot, futures
        except Exception as e:
            logger.error(f"[L2Collector] DB symbol load failed: {e}")
            return [], []
        finally:
            db.close()

    # ── Micro-Feature Calculator ───────────────────────────────────────────

    @staticmethod
    def calculate_micro_features(bids, asks) -> tuple[float, float, float]:
        if not bids or not asks:
            return 0.0, 0.0, 0.0
        try:
            best_bid = float(bids[0][0])
            best_ask = float(asks[0][0])
            spread   = best_ask - best_bid

            bid_vol = sum(float(b[1]) for b in bids[:10])
            ask_vol = sum(float(a[1]) for a in asks[:10])
            total   = bid_vol + ask_vol

            obi        = (bid_vol - ask_vol) / total if total > 0 else 0.0
            microprice = (best_bid * ask_vol + best_ask * bid_vol) / total if total > 0 \
                         else (best_bid + best_ask) / 2

            return obi, spread, microprice
        except Exception:
            return 0.0, 0.0, 0.0

    # ── DB Save ────────────────────────────────────────────────────────────

    async def _save_to_db(self, symbol: str, bids, asks,
                          obi: float, spread: float, microprice: float,
                          exchange: str):
        db = SessionLocal()
        try:
            snap = OrderBookSnapshot(
                exchange=exchange,
                symbol=symbol.upper(),   # stored as e.g. "DOGEUSDT"
                bids=bids[:20],
                asks=asks[:20],
                obi=obi,
                spread=spread,
                microprice=microprice,
            )
            db.add(snap)
            db.commit()
        except Exception as e:
            logger.error(f"[L2Collector] DB save error for {symbol}: {e}")
            db.rollback()
        finally:
            db.close()

    # ── Stream Runner ──────────────────────────────────────────────────────

    async def _run_stream(self, base_url: str, symbols: list[str], label: str):
        """Connect to a Binance combined WebSocket stream and persist snapshots."""
        url = self._build_url(base_url, symbols)
        last_save: dict[str, float] = {}

        while self.running:
            try:
                logger.info(f"[L2Collector] [{label}] Connecting → {symbols}")
                async with websockets.connect(url, ping_interval=20, ping_timeout=30) as ws:
                    logger.info(f"[L2Collector] [{label}] ✅ Connected.")
                    print(f"✅ L2DataCollector [{label}] connected successfully.")

                    while self.running:
                        raw = await ws.recv()
                        data = json.loads(raw)

                        # Combined stream payload: {"stream": "...", "data": {...}}
                        if "stream" in data and "data" in data:
                            sym     = data["stream"].split("@")[0].upper()
                            payload = data["data"]
                        else:
                            # Fallback for single-stream (shouldn't happen with ?streams=)
                            sym     = symbols[0].upper()
                            payload = data

                        bids = payload.get("bids", [])
                        asks = payload.get("asks", [])

                        try:
                            from app.metrics import L2_TICK_COUNT
                            L2_TICK_COUNT.labels(symbol=sym).inc()
                        except Exception:
                            pass

                        now = time.time()
                        # Rate-limit: 1 DB save per symbol per second
                        if sym not in last_save or (now - last_save[sym]) >= 1.0:
                            obi, spread, mp = self.calculate_micro_features(bids, asks)
                            asyncio.create_task(
                                self._save_to_db(sym, bids, asks, obi, spread, mp, label)
                            )
                            last_save[sym] = now

            except asyncio.CancelledError:
                logger.info(f"[L2Collector] [{label}] Stream cancelled.")
                break
            except Exception as e:
                logger.warning(f"[L2Collector] [{label}] ⚠️ Stream error: {e}")
                if self.running:
                    await asyncio.sleep(5)   # Reconnect delay

    # ── Public API ─────────────────────────────────────────────────────────

    def start(self, spot_symbols: list[str] = None, futures_symbols: list[str] = None):
        """Start collector tasks for the given symbol lists."""
        self.running         = True
        self.spot_symbols    = spot_symbols if spot_symbols is not None else ["btcusdt"]
        self.futures_symbols = futures_symbols if futures_symbols is not None else []

        if not self.spot_symbols and not self.futures_symbols:
            logger.info("[L2Collector] No symbols provided. Collector will stay idle.")
            self.running = False
            return

        if self.spot_symbols:
            t = asyncio.create_task(
                self._run_stream(self._SPOT_URL, self.spot_symbols, "Binance Spot")
            )
            self._tasks.append(t)

        if self.futures_symbols:
            t = asyncio.create_task(
                self._run_stream(self._FUTURES_URL, self.futures_symbols, "Binance Futures")
            )
            self._tasks.append(t)

        logger.info(
            f"[L2Collector] Started — Spot: {self.spot_symbols} | "
            f"Futures: {self.futures_symbols}"
        )

    def stop(self):
        """Cancel all running stream tasks."""
        self.running = False
        for t in self._tasks:
            t.cancel()
        self._tasks.clear()
        logger.info("[L2Collector] Stopped.")

    def symbols_changed(self, new_spot: list[str], new_futures: list[str]) -> bool:
        """Return True if the symbol lists have changed."""
        return set(new_spot) != set(self.spot_symbols) or \
               set(new_futures) != set(self.futures_symbols)


# Global singleton
l2_collector = L2DataCollector()
