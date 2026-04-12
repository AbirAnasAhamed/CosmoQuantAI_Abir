import aiohttp
import logging
from app.core.config import settings
from app.core.exchange_addresses import EXCHANGE_WALLETS

logger = logging.getLogger(__name__)

class ExchangeFlowService:
    @staticmethod
    async def fetch_latest_block_txs():
        """
        Fetch full transaction list from the latest block via Etherscan.
        """
        if not settings.ETHERSCAN_API_KEY:
            logger.warning("ETHERSCAN_API_KEY missing. Returning empty list.")
            return []

        async with aiohttp.ClientSession() as session:
            try:
                # 1. Get Latest Block (Full Transactions) via v2 API
                url = f"https://api.etherscan.io/v2/api?chainid=1&module=proxy&action=eth_getBlockByNumber&tag=latest&boolean=true&apikey={settings.ETHERSCAN_API_KEY}"
                
                async with session.get(url) as response:
                    if response.status != 200:
                        logger.error(f"Etherscan API Error: {response.status}")
                        return []
                    
                    data = await response.json()
                    result = data.get("result")
                    
                    if not result or "transactions" not in result:
                        return []
                        
                    return result["transactions"]
            except Exception as e:
                logger.error(f"Error fetching block txs: {e}")
                return []

    @staticmethod
    async def calculate_netflow():
        """
        Analyze latest block for Exchange Inflow vs Outflow.
        Returns real-time sentiment data.
        """
        transactions = await ExchangeFlowService.fetch_latest_block_txs()
        
        inflow_eth = 0.0
        outflow_eth = 0.0
        details = []

        if not transactions:
            return {
                "inflow_eth": 0,
                "outflow_eth": 0,
                "net_flow": 0,
                "sentiment": "Neutral (No Data)",
                "tx_count": 0
            }

        for tx in transactions:
            try:
                # Etherscan returns value in Wei (Hex)
                value_hex = tx.get("value", "0x0")
                value_wei = int(value_hex, 16)
                
                if value_wei == 0:
                    continue
                    
                eth_val = value_wei / 10**18
                
                to_addr = tx.get("to")
                from_addr = tx.get("from")
                
                # Normalize addresses
                if to_addr: to_addr = to_addr.lower()
                if from_addr: from_addr = from_addr.lower()

                # Logic:
                # INFLOW: User -> Exchange (Selling Pressure)
                if to_addr in EXCHANGE_WALLETS:
                    inflow_eth += eth_val
                    details.append(f"Inflow: {eth_val:.2f} ETH -> {EXCHANGE_WALLETS[to_addr]}")
                
                # OUTFLOW: Exchange -> User (Buying Pressure)
                if from_addr in EXCHANGE_WALLETS:
                    outflow_eth += eth_val
                    details.append(f"Outflow: {eth_val:.2f} ETH <- {EXCHANGE_WALLETS[from_addr]}")

            except Exception as e:
                continue

        net_flow = outflow_eth - inflow_eth
        
        # Sentiment Logic
        sentiment = "Neutral"
        if net_flow > 50: # Arbitrary threshold for Strong Buy
            sentiment = "Strong Buy (High Outflow)"
        elif net_flow > 0:
            sentiment = "Bullish (Net Outflow)"
        elif net_flow < -50:
            sentiment = "Strong Sell (High Inflow)"
        elif net_flow < 0:
            sentiment = "Bearish (Net Inflow)"

        return {
            "inflow_eth": round(inflow_eth, 4),
            "outflow_eth": round(outflow_eth, 4),
            "net_flow": round(net_flow, 4),
            "sentiment": sentiment,
            "tx_count": len(transactions),
            # "details": details # Optional: Enable for debugging
        }

exchange_flow_service = ExchangeFlowService()
