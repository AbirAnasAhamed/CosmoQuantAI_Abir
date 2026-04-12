from typing import Any, List, Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app import models, schemas
from app.api import deps
from app.services.news_service import news_service

router = APIRouter()

@router.get("/", response_model=List[schemas.EducationResource])
def read_education(
    db: Session = Depends(deps.get_db),
    level: Optional[str] = None, # Level filter
    type: Optional[str] = None, # News or Course
):
    query = db.query(models.EducationResource)
    if level:
        query = query.filter(models.EducationResource.level == level)
    if type:
        query = query.filter(models.EducationResource.type == type)
    
    return query.order_by(models.EducationResource.published_at.desc()).limit(50).all()

@router.post("/refresh-news")
async def refresh_news(db: Session = Depends(deps.get_db)):
    count = await news_service.fetch_and_process_latest_news()
    return {"message": f"Fetched {count} new articles"}

@router.post("/init", response_model=dict)
def init_academy_content(db: Session = Depends(deps.get_db)):
    """
    Frontend থেকে কল করলে এই ফাংশন ডাটাবেসে কোর্স কারিকুলাম লোড করে দেবে।
    """
    # সিলেবাসের তালিকা (init_academy.py থেকে নেওয়া)
    curriculum = [
        {"title": "Blockchain 101: How it Works", "desc": "Understanding the blocks behind Bitcoin.", "level": "Level 1", "cat": "Basics", "link": "https://www.youtube.com/watch?v=SSo_EIwHSd4"},
        {"title": "Wallets & Security", "desc": "Hot vs Cold wallets and keeping keys safe.", "level": "Level 1", "cat": "Security", "link": "https://academy.binance.com/en/articles/crypto-wallet-types-explained"},
        {"title": "Spot vs Futures Trading", "desc": "The difference between buying coins and betting on price.", "level": "Level 2", "cat": "Trading", "link": "https://www.binance.com/en/blog/futures/spot-vs-futures-trading-421499824684902218"},
        {"title": "Understanding Order Books", "desc": "How to read buy/sell walls and depth charts.", "level": "Level 2", "cat": "Trading", "link": "https://www.investopedia.com/terms/o/order-book.asp"},
        {"title": "Candlestick Patterns Masterclass", "desc": "Identify Doji, Hammer, and Engulfing patterns.", "level": "Level 3", "cat": "Technical Analysis", "link": "https://www.youtube.com/watch?v=C322tuBNt60"},
        {"title": "RSI & MACD Indicators", "desc": "Using momentum indicators to find entries.", "level": "Level 3", "cat": "Technical Analysis", "link": "https://www.youtube.com/watch?v=6M2kUdqF8Eo"},
        {"title": "Risk Management Strategies", "desc": "Position sizing and Stop-Loss mastery.", "level": "Level 4", "cat": "Psychology", "link": "https://cointelegraph.com/news/crypto-trading-risk-management"},
        {"title": "Intro to Algorithmic Trading", "desc": "Automating your strategy with Python.", "level": "Level 5", "cat": "Algo Trading", "link": "#algo-intro"},
    ]

    added_count = 0
    for item in curriculum:
        exists = db.query(models.EducationResource).filter(models.EducationResource.title == item["title"]).first()
        if not exists:
            res = models.EducationResource(
                title=item["title"],
                description=item["desc"],
                type="Course",
                category=item["cat"],
                level=item["level"],
                link=item["link"],
                image_url="https://source.unsplash.com/random/800x600/?crypto"
            )
            db.add(res)
            added_count += 1
    
    db.commit()
    return {"message": f"Successfully initialized {added_count} new resources."}
