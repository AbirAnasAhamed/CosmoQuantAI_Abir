from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api import deps
from app.models.analyst_rating import AnalystRating
from app.models.research_report import ResearchReport
import random
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/tickers", response_model=dict)
def get_supported_tickers(db: Session = Depends(deps.get_db)) -> dict:
    """
    Fetch a list of unique tickers currently available in the analyst_ratings table.
    If the table is empty, return a fallback list.
    """
    try:
        # Query distinct tickers from the analyst_ratings table
        tickers = db.query(AnalystRating.ticker).distinct().all()
        ticker_list = [t[0] for t in tickers if t[0]]

        if not ticker_list:
            # Fallback list if DB is empty
            ticker_list = ["AAPL", "TSLA", "MSFT", "NVDA", "GOOGL"]

        return {"tickers": ticker_list}
    except Exception as e:
        logger.error(f"Error fetching tickers: {e}")
        # In case of DB error, return fallback list
        return {"tickers": ["AAPL", "TSLA", "MSFT", "NVDA", "GOOGL"]}

@router.get("/price/{ticker}", response_model=dict)
def get_current_price(ticker: str) -> dict:
    """
    Fetch the current market price for a given ticker.
    Currently employs a mock service/generator to simulate live pricing.
    """
    # Using a base mapping to generate realistic fake prices
    base_prices = {
        "AAPL": 225.0,
        "TSLA": 250.0,
        "MSFT": 420.0,
        "NVDA": 135.0,
        "GOOGL": 180.0
    }
    
    ticker_upper = ticker.upper()
    base_price = base_prices.get(ticker_upper, 100.0) # Default to 100 if unknown

    # Generate a random float within +/- 2% of the base price
    mock_price = base_price * (1 + random.uniform(-0.02, 0.02))
    
    return {
        "ticker": ticker_upper,
        "price": round(mock_price, 2)
    }

@router.get("/ratings/{ticker}", response_model=dict)
def get_analyst_ratings(ticker: str, db: Session = Depends(deps.get_db)) -> dict:
    """
    Fetch analyst ratings for a specific ticker and calculate the consensus summary.
    """
    ticker_upper = ticker.upper()
    
    try:
        ratings_records = db.query(AnalystRating).filter(AnalystRating.ticker == ticker_upper).all()
        
        buy_count = 0
        hold_count = 0
        sell_count = 0
        
        ratings_list = []
        
        for record in ratings_records:
            rating_upper = record.rating.upper() if record.rating else ""
            
            # Count logic
            if "BUY" in rating_upper or "OVERWEIGHT" in rating_upper:
                buy_count += 1
            elif "HOLD" in rating_upper or "NEUTRAL" in rating_upper or "EQUAL-WEIGHT" in rating_upper:
                hold_count += 1
            elif "SELL" in rating_upper or "UNDERWEIGHT" in rating_upper:
                sell_count += 1
                
            ratings_list.append({
                "firm_name": record.firm_name,
                "date": record.date.isoformat() if record.date else None,
                "rating_action": record.rating_action,
                "rating": record.rating,
                "price_target": record.price_target
            })
            
        # Determine dominant rating
        summary_counts = {
            "Buy": buy_count,
            "Hold": hold_count,
            "Sell": sell_count
        }
        
        dominant_rating = "Hold" # Default
        if buy_count == 0 and hold_count == 0 and sell_count == 0:
            dominant_rating = "N/A"
        else:
            # Find the key with the max count
            dominant_rating = max(summary_counts, key=summary_counts.get)
            
        return {
            "ticker": ticker_upper,
            "summary": summary_counts,
            "dominant_rating": dominant_rating,
            "ratings": ratings_list
        }
        
    except Exception as e:
        logger.error(f"Error fetching ratings for {ticker_upper}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error while fetching ratings")

@router.get("/targets/{ticker}", response_model=dict)
def get_analyst_targets(ticker: str, db: Session = Depends(deps.get_db)) -> dict:
    """
    Fetch analyst price targets for a specific ticker and calculate high/low/avg/upside.
    """
    ticker_upper = ticker.upper()
    
    try:
        # Get all non-null price targets
        ratings_records = db.query(AnalystRating).filter(
            AnalystRating.ticker == ticker_upper,
            AnalystRating.price_target.isnot(None)
        ).all()
        
        targets = [record.price_target for record in ratings_records]
        
        if not targets:
            return {
                "ticker": ticker_upper,
                "high": 0.0,
                "low": 0.0,
                "avg": 0.0,
                "current_price": 0.0,
                "upside": 0.0
            }
            
        high_target = max(targets)
        low_target = min(targets)
        avg_target = sum(targets) / len(targets)
        
        # Get current price
        current_price_data = get_current_price(ticker_upper)
        current_price = current_price_data.get("price", 0.0)
        
        upside = 0.0
        if current_price > 0:
            upside = ((avg_target - current_price) / current_price) * 100
            
        return {
            "ticker": ticker_upper,
            "high": round(high_target, 2),
            "low": round(low_target, 2),
            "avg": round(avg_target, 2),
            "current_price": round(current_price, 2),
            "upside": round(upside, 2)
        }
        
    except Exception as e:
        logger.error(f"Error fetching price targets for {ticker_upper}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error while fetching price targets")

@router.get("/reports/{ticker}", response_model=List[dict])
def get_analyst_reports(ticker: str, db: Session = Depends(deps.get_db)) -> List[dict]:
    """
    Fetch the top 10 most recent deep-dive research reports for a specific ticker.
    """
    ticker_upper = ticker.upper()
    
    try:
        # Get reports for ticker, ordered by publish_date desc, limited to 10
        reports_records = db.query(ResearchReport).filter(
            ResearchReport.ticker == ticker_upper
        ).order_by(
            ResearchReport.publish_date.desc()
        ).limit(10).all()
        
        result = []
        for record in reports_records:
            result.append({
                "id": record.id,
                "title": record.title,
                "summary": record.summary,
                "source": record.source_name,
                "date": record.publish_date.isoformat() if record.publish_date else None,
                "link": record.report_link
            })
            
        return result
        
    except Exception as e:
        logger.error(f"Error fetching research reports for {ticker_upper}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error while fetching research reports")
