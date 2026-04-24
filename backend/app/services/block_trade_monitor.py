
import ccxt.async_support as ccxt
import json
import logging
from typing import List, Dict, Optional
from datetime import datetime
import os
import asyncio

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

CONFIG_FILE = "block_trade_config.json"

class BlockTradeMonitor:
    def __init__(self):
        self.config = self._load_config()
        self.exchanges = {}
        self.error_counts = {}
        # Per-exchange market symbol sets (populated lazily, cached for lifetime of process)
        self._markets_cache: Dict[str, set] = {}
        # Exchanges initialization will happen on first fetch or worker start

    def _load_config(self) -> Dict:
        """Loads configuration from a JSON file or sets defaults."""
        default_config = {
            "min_block_value": 10000.0,  # Minimum value to be considered a block trade (USD)
            "whale_value": 500000.0,     # Value to be considered a whale trade (USD)
            "active_exchanges": ["binance", "bybit"]  # okx requires API keys for fetch_trades; add credentials to re-enable
        }
        
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, "r") as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Error loading config: {e}. Using defaults.")
                return default_config
        
        # Save defaults if file doesn't exist
        self._save_config(default_config)
        return default_config

    def _save_config(self, config: Dict):
        """Saves configuration to a JSON file."""
        try:
            with open(CONFIG_FILE, "w") as f:
                json.dump(config, f, indent=4)
        except Exception as e:
            logger.error(f"Error saving config: {e}")

    async def initialize_exchanges(self):
        """Initializes CCXT exchange instances based on configuration (Async)."""
        # Close existing first to avoid leaks
        await self.close_exchanges()
        
        self.exchanges = {}
        # Cache of symbol sets per exchange — populated lazily in _exchange_has_symbol()
        self._markets_cache: Dict[str, set] = {}
        for exchange_id in self.config.get("active_exchanges", []):
            try:
                if hasattr(ccxt, exchange_id):
                    exchange_class = getattr(ccxt, exchange_id)
                    # Enable rate limiting and async mode
                    options = {
                        'enableRateLimit': True, 'options': {'adjustForTimeDifference': True},
                        'userAgent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    }
                    if exchange_id == 'okx':
                        options['options'] = {'defaultType': 'spot'}
                        
                    self.exchanges[exchange_id] = exchange_class(options)
                else:
                    logger.warning(f"Exchange {exchange_id} not found in ccxt.")
            except Exception as e:
                logger.error(f"Failed to initialize {exchange_id}: {e}")

    async def _exchange_has_symbol(self, exchange_id: str, exchange, symbol: str) -> bool:
        """
        Returns True if the exchange lists the given symbol.
        Markets are loaded once per exchange and cached in memory for the
        lifetime of this monitor instance — they rarely change.
        """
        if exchange_id not in self._markets_cache:
            try:
                markets = await exchange.load_markets()
                self._markets_cache[exchange_id] = set(markets.keys())
            except Exception as e:
                logger.warning(f"[BlockTrade] Could not load markets for {exchange_id}: {e}")
                # Optimistic: let the fetch proceed; it will error if truly missing
                return True
        return symbol in self._markets_cache[exchange_id]

    async def close_exchanges(self):
        """Closes all exchange connections."""
        for name, exchange in self.exchanges.items():
            try:
                await exchange.close()
            except Exception as e:
                logger.error(f"Error closing {name}: {e}")

    async def update_config(self, new_config: Dict):
        """Updates the configuration and re-initializes exchanges if needed."""
        self.config.update(new_config)
        self._save_config(self.config)
        
        # Re-initialize only if active_exchanges changed
        if "active_exchanges" in new_config:
             await self.initialize_exchanges()
            
        return self.config

    def get_config(self) -> Dict:
        """Returns the current configuration."""
        return self.config

    def _handle_exchange_error(self, exchange_id: str, error: Exception):
        """Rate limits error logging for persistent exchange issues."""
        count = self.error_counts.get(exchange_id, 0) + 1
        self.error_counts[exchange_id] = count
        
        # Log immediately if it's the first time, or every 60th time
        if count == 1 or count % 60 == 0:
            msg = str(error)
            if "403" in msg or "Forbidden" in msg:
                 logger.warning(f"{exchange_id} API returned 403 Forbidden. Suppressing frequent logs. (Count: {count})")
            else:
                 logger.warning(f"Error fetching from {exchange_id}: {type(error).__name__} - {msg}. (Count: {count})")

    async def fetch_recent_trades(self, symbol: str, limit: int = 100) -> Dict[str, List[Dict]]:
        """
        Fetches recent trades from all active exchanges for a given symbol in parallel.
        Exchanges that do not list the symbol (e.g. FDUSD pairs on Bybit/OKX) are
        silently skipped — no WARNING is logged for expected symbol-not-found cases.
        Filters trades based on min_block_value.
        """
        if not self.exchanges:
            await self.initialize_exchanges()

        async def fetch_from_exchange(exchange_id, exchange):
            # ── Symbol availability check (silent skip) ──────────────────────
            # Exchange-specific stablecoins (FDUSD, TUSD, …) only exist on their
            # home exchange.  Checking the market list before calling fetch_trades
            # avoids a BadSymbol exception and the noisy WARNING log it produces.
            if not await self._exchange_has_symbol(exchange_id, exchange, symbol):
                return exchange_id, []

            try:
                trades = await exchange.fetch_trades(symbol, limit=limit)
                self.error_counts[exchange_id] = 0
                
                block_trades = []
                for trade in trades:
                    price = trade.get('price', 0)
                    amount = trade.get('amount', 0)
                    cost = trade.get('cost', 0) 
                    
                    if cost is None or cost == 0:
                        cost = price * amount

                    if cost >= self.config["min_block_value"]:
                        is_whale = cost >= self.config["whale_value"]
                        block_trades.append({
                            "exchange": exchange_id,
                            "symbol": symbol,
                            "price": price,
                            "amount": amount,
                            "value": cost,
                            "side": trade.get('side'),
                            "timestamp": trade.get('timestamp'),
                            "datetime": trade.get('datetime'),
                            "is_whale": is_whale
                        })
                return exchange_id, block_trades
            except Exception as e:
                self._handle_exchange_error(exchange_id, e)
                return exchange_id, []

        # Use gather for parallel fetching
        tasks = [fetch_from_exchange(id, ex) for id, ex in self.exchanges.items()]
        results = await asyncio.gather(*tasks)
        
        all_block_trades = {id: trades for id, trades in results if trades}
        return all_block_trades

block_trade_monitor = BlockTradeMonitor()
