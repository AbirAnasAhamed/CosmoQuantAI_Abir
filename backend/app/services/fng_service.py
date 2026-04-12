from typing import Optional, Dict, Any
import aiohttp
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

class FearAndGreedService:
    API_URL = "https://api.alternative.me/fng/?limit=1"

    @classmethod
    async def fetch_latest_index(cls) -> Optional[Dict[str, Any]]:
        """
        Fetches the latest Fear and Greed Index from alternative.me.
        Returns a dictionary with value, value_classification, and timestamp,
        or a default "Neutral" object on failure.
        """
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(cls.API_URL) as response:
                    if response.status != 200:
                        logger.error(f"Failed to fetch F&G index: {response.status}")
                        return cls._get_default_state()
                    
                    data = await response.json()
                    
                    if "data" in data and len(data["data"]) > 0:
                        item = data["data"][0]
                        return {
                            "value": int(item.get("value", 50)),
                            "value_classification": item.get("value_classification", "Neutral"),
                            "timestamp": int(item.get("timestamp", 0)),
                            "time_until_update": item.get("time_until_update", None)
                        }
                    else:
                        logger.warning("F&G API returned unexpected format")
                        return cls._get_default_state()

        except Exception as e:
            logger.error(f"Error fetching F&G index: {str(e)}")
            return cls._get_default_state()

    @staticmethod
    def _get_default_state() -> Dict[str, Any]:
        """Returns a safe default state in case of API errors."""
        return {
            "value": 50,
            "value_classification": "Neutral",
            "timestamp": int(datetime.now().timestamp()),
            "error": "Failed to fetch live data"
        }
