from app.db.session import SessionLocal
from app.models.education import EducationResource

def init_db():
    db = SessionLocal()
    
    # Our 5 level syllabus
    curriculum = [
        # Level 1
        {"title": "Blockchain 101: How it Works", "desc": "Understanding the blocks behind Bitcoin.", "level": "Level 1", "cat": "Basics", "link": "https://www.youtube.com/watch?v=SSo_EIwHSd4"},
        {"title": "Wallets & Security", "desc": "Hot vs Cold wallets and keeping keys safe.", "level": "Level 1", "cat": "Security", "link": "https://academy.binance.com/en/articles/crypto-wallet-types-explained"},
        
        # Level 2
        {"title": "Spot vs Futures Trading", "desc": "The difference between buying coins and betting on price.", "level": "Level 2", "cat": "Trading", "link": "https://www.binance.com/en/blog/futures/spot-vs-futures-trading-421499824684902218"},
        {"title": "Understanding Order Books", "desc": "How to read buy/sell walls and depth charts.", "level": "Level 2", "cat": "Trading", "link": "https://www.investopedia.com/terms/o/order-book.asp"},

        # Level 3
        {"title": "Candlestick Patterns Masterclass", "desc": "Identify Doji, Hammer, and Engulfing patterns.", "level": "Level 3", "cat": "Technical Analysis", "link": "https://www.youtube.com/watch?v=C322tuBNt60"},
        {"title": "RSI & MACD Indicators", "desc": "Using momentum indicators to find entries.", "level": "Level 3", "cat": "Technical Analysis", "link": "https://www.youtube.com/watch?v=6M2kUdqF8Eo"},

        # Level 4
        {"title": "Risk Management Strategies", "desc": "Position sizing and Stop-Loss mastery.", "level": "Level 4", "cat": "Psychology", "link": "https://cointelegraph.com/news/crypto-trading-risk-management"},
        
        # Level 5 (CosmoQuant Special)
        {"title": "Intro to Algorithmic Trading", "desc": "Automating your strategy with Python.", "level": "Level 5", "cat": "Algo Trading", "link": "#algo-intro"},
        {"title": "Grid Bot Strategy", "desc": "Profiting from sideways markets automatically.", "level": "Level 5", "cat": "Algo Trading", "link": "#grid-bot"},
    ]

    print("🚀 Initializing Academy Course Data...")
    for item in curriculum:
        exists = db.query(EducationResource).filter(EducationResource.title == item["title"]).first()
        if not exists:
            res = EducationResource(
                title=item["title"],
                description=item["desc"],
                type="Course",
                category=item["cat"],
                level=item["level"],
                link=item["link"],
                image_url="https://source.unsplash.com/random/800x600/?crypto"
            )
            db.add(res)
    
    db.commit()
    print("✅ Done! Academy is ready.")
    db.close()

if __name__ == "__main__":
    init_db()
