
import unittest
from unittest.mock import MagicMock, ANY
from datetime import datetime
from fastapi import HTTPException
from app.services.sentiment_service import sentiment_service
from app.models.sentiment import SentimentPoll

class TestVotingSecurity(unittest.TestCase):
    def setUp(self):
        self.db = MagicMock()
        self.ip_address = "192.168.1.1"
        self.user_id = 999
        self.symbol = "BTC/USDT"
        self.symbol2 = "ETH/USDT"

    def test_1_valid_vote(self):
        print("\nTest 1: Valid Vote (Fresh IP/User)")
        # Mock query needed to return None (no existing vote)
        self.db.query.return_value.filter.return_value.first.return_value = None
        
        result = sentiment_service.cast_vote(
            self.db, self.user_id, self.ip_address, self.symbol, "bullish"
        )
        
        # Verify DB add/commit/refresh called
        self.db.add.assert_called_once()
        self.db.commit.assert_called_once()
        print("✅ Success: Vote cast.")

    def test_2_spam_attempt_same_symbol(self):
        print("\nTest 2: Spam Attempt (Same IP/Asset)")
        # Mock query needed to return an object (vote exists)
        mock_vote = SentimentPoll()
        self.db.query.return_value.filter.return_value.first.return_value = mock_vote
        
        try:
            sentiment_service.cast_vote(
                self.db, self.user_id, self.ip_address, self.symbol, "bearish"
            )
        except HTTPException as e:
            self.assertEqual(e.status_code, 429)
            print("✅ Success: Blocked with HTTP 429.")
        else:
            self.fail("❌ Failed: Should have raised 429")

    def test_3_valid_vote_different_symbol(self):
        print("\nTest 3: Different Asset (Same IP)")
        # Mock query needed to return None (no exist vote for this symbol)
        self.db.query.return_value.filter.return_value.first.return_value = None
        
        result = sentiment_service.cast_vote(
            self.db, self.user_id, self.ip_address, self.symbol2, "bullish"
        )
        
        self.db.add.assert_called_once()
        print("✅ Success: Second asset vote cast.")

if __name__ == '__main__':
    unittest.main()
