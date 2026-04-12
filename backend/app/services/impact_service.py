import logging

logger = logging.getLogger(__name__)

class ImpactAnalysisService:
    """
    Service to classify the Market Impact of news into HIGH, MEDIUM, or LOW.
    """

    # Critical keywords that trigger HIGH impact
    HIGH_IMPACT_KEYWORDS = [
        "hack", "attack", "exploit", "sec", "approval", "etf", "listing", "ban", 
        "mainnet", "merge", "halving", "regulation", "lawsuit", "arrest", 
        "insolvency", "bankruptcy", "fed", "rate hike", "cpi", "fomc"
    ]

    # Moderate keywords that trigger MEDIUM impact
    MEDIUM_IMPACT_KEYWORDS = [
        "partnership", "update", "launch", "volume", "upgrade", "integration", 
        "milestone", "audit", "burning", "staking", "rewards", "airdrop", 
        "whitelist", "roadmap", " AMA ", "conference"
    ]

    def calculate_impact(self, text: str, sentiment_score: float) -> dict:
        """
        Calculates the impact level and score based on keywords and sentiment confidence.
        
        Args:
            text (str): The news title or content.
            sentiment_score (float): The normalized sentiment score (0-100).
                                     Where 0 is extremely negative, 100 is extremely positive.
        
        Returns:
            dict: {"level": "HIGH"|"MEDIUM"|"LOW", "score": int, "reason": str}
        """
        text_lower = text.lower()
        impact_level = "LOW"
        impact_score = 30  # Default base score for low impact
        reason = "General market news"

        # 1. Check for High Impact Keywords
        for kw in self.HIGH_IMPACT_KEYWORDS:
            if kw in text_lower:
                impact_level = "HIGH"
                impact_score = 90
                reason = f"Critical keyword '{kw}' found"
                return {"level": impact_level, "score": impact_score, "reason": reason}

        # 2. Check for Medium Impact Keywords
        for kw in self.MEDIUM_IMPACT_KEYWORDS:
            if kw in text_lower:
                impact_level = "MEDIUM"
                impact_score = 70
                reason = f"Moderate keyword '{kw}' found"
                return {"level": impact_level, "score": impact_score, "reason": reason}

        # 3. Check Sentiment Extremes (Confidence)
        # Assuming sentiment_score is 0-100.
        # Extreme High: > 90 (Strong Buy/Positive)
        # Extreme Low: < 10 (Strong Sell/Negative)
        # Moderate High: 75-90
        # Moderate Low: 10-25
        
        if sentiment_score >= 90 or sentiment_score <= 10:
            impact_level = "HIGH"
            impact_score = 85
            reason = "Extreme sentiment detected"
        elif (75 <= sentiment_score < 90) or (10 < sentiment_score <= 25):
            impact_level = "MEDIUM"
            impact_score = 65
            reason = "Significant sentiment detected"
        else:
            impact_level = "LOW"
            impact_score = 30
            reason = "Low sentiment confidence"

        return {"level": impact_level, "score": impact_score, "reason": reason}

impact_analysis_service = ImpactAnalysisService()
