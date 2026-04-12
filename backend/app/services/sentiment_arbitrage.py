from typing import List, Dict, Any

class SentimentArbitrageService:
    def scan_for_arbitrage(self, market_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Scans a list of assets for sentiment/price divergences.
        
        Logic:
        - Bullish Divergence: Price Change (24h) < -2% AND Sentiment Score > 0.5
        - Bearish Divergence: Price Change (24h) > 2% AND Sentiment Score < -0.2
        
        Args:
            market_data: List of dicts containing 'symbol', 'price_change_24h', 'sentiment_score'
        
        Returns:
            List of dictionaries representing arbitrage opportunities.
        """
        opportunities = []
        
        for asset in market_data:
            symbol = asset.get("symbol")
            price_change = asset.get("price_change_24h", 0.0)
            sentiment = asset.get("sentiment_score", 0.0)
            
            # Defensive check for None values
            if price_change is None: price_change = 0.0
            if sentiment is None: sentiment = 0.0
            
            opportunity = None
            
            # Check for Bullish Divergence
            if price_change < -2.0 and sentiment > 0.5:
                opportunity = {
                    "symbol": symbol,
                    "type": "Bullish Divergence",
                    "price_change": price_change,
                    "sentiment": sentiment,
                    "signal_strength": "High" if sentiment > 0.7 else "Medium",
                    "action": "Buy/Long"
                }
                
            # Check for Bearish Divergence
            elif price_change > 2.0 and sentiment < -0.2:
                opportunity = {
                    "symbol": symbol,
                    "type": "Bearish Divergence",
                    "price_change": price_change,
                    "sentiment": sentiment,
                    "signal_strength": "High" if sentiment < -0.5 else "Medium",
                    "action": "Sell/Short"
                }
                
            if opportunity:
                # Add extra display metadata if available
                if "name" in asset:
                    opportunity["name"] = asset["name"]
                opportunities.append(opportunity)
                
        return opportunities

sentiment_arbitrage_service = SentimentArbitrageService()
