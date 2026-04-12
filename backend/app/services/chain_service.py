import aiohttp
import json
import logging
from app.core.config import settings
from app.utils import get_redis_client

logger = logging.getLogger(__name__)

class ChainService:
    REDIS_THRESHOLD_KEY = "whale_alert:threshold"
    DEFAULT_THRESHOLD = 10_000_000  # 10 Million USD

    @staticmethod
    def set_whale_threshold(value: float):
        """Set the USD threshold for whale alerts."""
        try:
            r = get_redis_client()
            r.set(ChainService.REDIS_THRESHOLD_KEY, str(value))
            return True
        except Exception as e:
            logger.error(f"Failed to set whale threshold: {e}")
            return False

    @staticmethod
    def get_whale_threshold() -> float:
        """Get the current USD threshold for whale alerts."""
        try:
            r = get_redis_client()
            val = r.get(ChainService.REDIS_THRESHOLD_KEY)
            if val:
                return float(val)
        except Exception as e:
            logger.error(f"Failed to get whale threshold: {e}")
        return ChainService.DEFAULT_THRESHOLD

    @staticmethod
    async def scan_latest_block():
        """
        Fetch latest block from Etherscan and filter for whale transactions.
        Returns a list of alert objects.
        """
        if not settings.ETHERSCAN_API_KEY:
            logger.warning("ETHERSCAN_API_KEY not set. Skipping scan.")
            return []

        threshold = ChainService.get_whale_threshold()
        # Etherscan free tier rate limit is 5 req/sec.
        # We need:
        # 1. Latest block number (or just use 'latest')
        # 2. Get Block by Number
        # 3. Get ETH Price
        
        async with aiohttp.ClientSession() as session:
            try:
                # 1. Get ETH Price
                async with session.get(
                    f"https://api.etherscan.io/api?module=stats&action=ethprice&apikey={settings.ETHERSCAN_API_KEY}"
                ) as response:
                    if response.status != 200:
                        logger.error("Failed to fetch ETH price")
                        return []
                    data = await response.json()
                    eth_price = float(data.get("result", {}).get("ethusd", 0))

                if eth_price == 0:
                    return []

                # 2. Get Latest Block
                # We use 'latest' tag for simplicity
                async with session.get(
                    f"https://api.etherscan.io/api?module=proxy&action=eth_getBlockByNumber&tag=latest&boolean=true&apikey={settings.ETHERSCAN_API_KEY}"
                ) as response:
                    if response.status != 200:
                        logger.error("Failed to fetch latest block")
                        return []
                    data = await response.json()
                    block_data = data.get("result")
                
                if not block_data or not block_data.get("transactions"):
                    return []

                alerts = []
                transactions = block_data.get("transactions", [])
                
                for tx in transactions:
                    # Value is in Wei (hex)
                    value_hex = tx.get("value", "0x0")
                    value_wei = int(value_hex, 16)
                    if value_wei == 0:
                        continue
                        
                    eth_val = value_wei / 10**18
                    usd_val = eth_val * eth_price
                    
                    if usd_val >= threshold:
                        alerts.append({
                            "hash": tx.get("hash"),
                            "from": tx.get("from"),
                            "to": tx.get("to"),
                            "value_eth": eth_val,
                            "value_usd": usd_val,
                            "block": int(block_data.get("number", "0"), 16),
                            "timestamp": int(block_data.get("timestamp", "0"), 16) 
                        })

                return alerts

            except Exception as e:
                logger.error(f"Error scanning block: {e}")
                return []
