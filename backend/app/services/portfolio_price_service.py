import asyncio
import logging
import ccxt.async_support as ccxt
from typing import Dict, List, Set
from app.services.websocket_manager import manager
from datetime import datetime

logger = logging.getLogger(__name__)

class PortfolioPriceService:
    def __init__(self):
        self.active_symbols: Dict[str, Set[str]] = {} # { exchange_id: {symbols} }
        self.exchange_clients: Dict[str, any] = {}
        self.running_task = None

    async def get_client(self, exchange_id: str):
        if exchange_id not in self.exchange_clients:
            exchange_class = getattr(ccxt, exchange_id.lower())
            self.exchange_clients[exchange_id] = exchange_class({
                'enableRateLimit': True,
                'options': {'adjustForTimeDifference': True}
            })
            await self.exchange_clients[exchange_id].load_markets()
        return self.exchange_clients[exchange_id]

    def update_active_symbols(self, symbols_by_exchange: Dict[str, List[str]]):
        for ex, symbols in symbols_by_exchange.items():
            if ex not in self.active_symbols:
                self.active_symbols[ex] = set()
            self.active_symbols[ex].update(symbols)

    async def start(self):
        if self.running_task:
            return
        self.running_task = asyncio.create_task(self._price_loop())
        logger.info("🚀 Portfolio Price Service Started")

    async def stop(self):
        if self.running_task:
            self.running_task.cancel()
            self.running_task = None
        for client in self.exchange_clients.values():
            await client.close()
        self.exchange_clients.clear()

    async def _price_loop(self):
        while True:
            try:
                # 1. Determine which symbols are actually being watched
                # For now, we fetch for ALL symbols that ANY active portfolio client needs
                # But only if there are active connections to the "portfolio_prices" channel
                if "portfolio_prices" not in manager.active_connections:
                    await asyncio.sleep(5)
                    continue

                for exchange_id, symbols in self.active_symbols.items():
                    if not symbols:
                        continue
                    
                    try:
                        client = await self.get_client(exchange_id)
                        # Fetch multiple tickers at once to minimize API calls
                        symbol_list = list(symbols)
                        
                        # Filtering symbols that exist in market
                        valid_symbols = [s for s in symbol_list if s in client.markets]
                        
                        if not valid_symbols:
                            continue

                        # Some exchanges don't support fetch_tickers(symbols) but CCXT handles it
                        tickers = await client.fetch_tickers(valid_symbols)
                        
                        updates = {}
                        for sym, t in tickers.items():
                            updates[sym] = {
                                "price": t.get('last'),
                                "change": t.get('percentage'),
                                "timestamp": datetime.utcnow().isoformat()
                            }
                        
                        if updates:
                            await manager.broadcast({
                                "type": "portfolio_price_update",
                                "exchange": exchange_id,
                                "prices": updates
                            }, "portfolio_prices")
                            
                    except Exception as e:
                        logger.error(f"Error fetching prices for {exchange_id}: {e}")
                
                # Wait 5 seconds to be safe and avoid rate limits
                await asyncio.sleep(5)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Portfolio Price Loop Error: {e}")
                await asyncio.sleep(10)

portfolio_price_service = PortfolioPriceService()
