from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from fastapi import HTTPException, status
from datetime import datetime, timedelta, timezone
from app.models.sentiment import SentimentPoll
from app.services.on_chain_service import on_chain_service
from app.services.websocket_manager import manager

class SentimentService:
    async def calculate_final_score(self, current_score: float, symbol: str) -> float:
        """
        Injects On-Chain metrics into the final sentiment score.
        Weight: 0.15 for On-Chain Data.
        """
        metrics = await on_chain_service.get_latest_metrics(symbol)
        
        # Determine On-Chain Score (0 to 100 scale)
        # Neutral = 50
        on_chain_score = 50.0
        if metrics['net_flow_status'] == "Strong Buying Pressure":
            on_chain_score = 80.0
        elif metrics['net_flow_status'] == "High Sell Pressure":
            on_chain_score = 20.0
            
        # Weighted Average
        # Assuming current_score is already 0-100
        final_score = (current_score * 0.85) + (on_chain_score * 0.15)
        return round(final_score, 2)

    async def cast_vote(self, db: Session, user_id: int | None, ip_address: str, symbol: str, vote_type: str) -> SentimentPoll:
        """
        Casts a sentiment vote with rate limiting (1 vote per user/IP per asset per 24h).
        Broadcasts udpated stats via WebSocket.
        """
        cutoff_time = datetime.now(timezone.utc) - timedelta(hours=24)

        # Build query filters
        # Check against user_id (if logged in) OR ip_address
        # AND symbol AND recently voted
        
        filters = [
            SentimentPoll.symbol == symbol,
            SentimentPoll.timestamp > cutoff_time
        ]

        if user_id is not None:
            # If user is logged in, check user_id OR ip_address
            filters.append(or_(SentimentPoll.user_id == user_id, SentimentPoll.ip_address == ip_address))
        else:
            # If guest, check ip_address only
            filters.append(SentimentPoll.ip_address == ip_address)

        existing_vote = db.query(SentimentPoll).filter(and_(*filters)).first()

        if existing_vote:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="You can only vote once per 24 hours for this asset."
            )

        # Create new vote
        new_vote = SentimentPoll(
            user_id=user_id,
            ip_address=ip_address,
            symbol=symbol,
            vote_type=vote_type
        )
        db.add(new_vote)
        db.commit()
        db.refresh(new_vote)
        
        # Broadcast updated stats
        try:
            stats = self.get_poll_stats(db, symbol=symbol)
            await manager.broadcast_to_symbol(symbol, {
                "type": "VOTE_UPDATE", 
                "data": stats
            })
        except Exception as e:
            print(f"WS Broadcast Error: {e}")

        return new_vote

    def get_poll_stats(self, db: Session, symbol: str | None = None) -> dict:
        """
        Get percentage of Bullish vs Bearish votes for the last 24h.
        If symbol is provided, filter by that symbol.
        """
        last_24h = datetime.now(timezone.utc) - timedelta(hours=24)
        
        # Base filters
        filters = [SentimentPoll.timestamp >= last_24h]
        if symbol:
            filters.append(SentimentPoll.symbol == symbol)
            
        # Count votes
        total_votes = db.query(SentimentPoll).filter(and_(*filters)).count()
        bullish_votes = db.query(SentimentPoll).filter(
            and_(*filters), 
            SentimentPoll.vote_type == 'bullish'
        ).count()
        
        if total_votes == 0:
            return {
                "bullish_pct": 0,
                "bearish_pct": 0,
                "total_votes": 0
            }
        
        bullish_pct = (bullish_votes / total_votes) * 100
        bearish_pct = 100 - bullish_pct
        
        return {
            "bullish_pct": round(bullish_pct, 1),
            "bearish_pct": round(bearish_pct, 1),
            "total_votes": total_votes
        }

sentiment_service = SentimentService()
