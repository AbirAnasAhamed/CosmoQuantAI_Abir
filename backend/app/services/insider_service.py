import requests
import os
import yfinance as yf
import pandas as pd
from sqlalchemy.orm import Session
from app.models.insider import InsiderFiling
from app.schemas.insider import InsiderFilingCreate
from datetime import datetime, timedelta, date

# FMP API Config
FMP_API_URL = "https://financialmodelingprep.com/api/v4/insider-trading"
API_KEY = os.getenv("FMP_API_KEY")

# Fallback Tickers (Yahoo Finance এর জন্য)
# যেহেতু Yahoo গ্লোবাল ইনসাইডার ডেটা দেয় না, তাই আমরা জনপ্রিয় কিছু স্টকের ডেটা আনব ফলব্যাক হিসেবে
FALLBACK_TICKERS = ['AAPL', 'MSFT', 'TSLA', 'NVDA', 'AMZN', 'GOOGL', 'META', 'AMD', 'INTC', 'COIN']

def fetch_from_fmp(ticker: str = None, limit: int = 50):
    """
    Primary Source: Fetch from Financial Modeling Prep API
    """
    print("Attempting to fetch data from FMP API...")
    params = {"apikey": API_KEY, "limit": limit}
    if ticker:
        params["symbol"] = ticker
    
    response = requests.get(FMP_API_URL, params=params, timeout=5) # 5 seconds timeout
    response.raise_for_status() # Raise error if status is not 200
    
    data = response.json()
    if not data:
        raise Exception("Empty response from FMP")

    filings = []
    for item in data:
        filing = {
            "id": hash(f"fmp_{item.get('symbol')}_{item.get('transactionDate')}_{item.get('reportingCik')}"),
            "ticker": item.get("symbol"),
            "insider_name": item.get("reportingName"),
            "insider_role": item.get("typeOfOwner"),
            "transaction_type": "Buy" if "Buy" in item.get("transactionType", "") or "Acquisition" in item.get("transactionType", "") else "Sell",
            "transaction_date": item.get("transactionDate"),
            "shares": float(item.get("securitiesTransacted", 0)),
            "share_price": float(item.get("price", 0)),
            "total_value": float(item.get("securitiesTransacted", 0)) * float(item.get("price", 0)),
            "is_manual": False
        }
        filings.append(filing)
    return filings

def fetch_from_yahoo(tickers: list):
    """
    Fallback Source: Scrape from Yahoo Finance using yfinance
    """
    print("FMP Failed. Switching to Yahoo Finance Scraper...")
    filings = []
    
    for ticker in tickers:
        try:
            stock = yf.Ticker(ticker)
            # Insider transactions DataFrame
            insider_df = stock.insider_transactions
            
            if insider_df is not None and not insider_df.empty:
                # Get latest 5 transactions per ticker to keep it fast
                latest_tx = insider_df.head(5)
                
                for index, row in latest_tx.iterrows():
                    # Yahoo data mapping
                    shares = row.get('Shares', 0)
                    value = row.get('Value', 0)
                    
                    # Calculate price manually if possible, or assume 0 (Yahoo doesn't always give price directly in this df)
                    price = 0
                    if shares > 0 and value > 0:
                        price = value / shares
                    
                    # Determine Buy/Sell based on text
                    tx_text = str(row.get('Text', '')).lower()
                    tx_type = "Buy" if "purchase" in tx_text or "grant" in tx_text else "Sell"
                    
                    # Start Date processing
                    tx_date = row.get('Start Date')
                    if isinstance(tx_date, pd.Timestamp):
                        tx_date = tx_date.strftime('%Y-%m-%d')
                    
                    filing = {
                        "id": hash(f"yf_{ticker}_{index}_{tx_date}"),
                        "ticker": ticker,
                        "insider_name": row.get('Insider', 'Unknown'),
                        "insider_role": row.get('Position', 'Insider'),
                        "transaction_type": tx_type,
                        "transaction_date": str(tx_date),
                        "shares": float(shares) if shares else 0.0,
                        "share_price": float(price),
                        "total_value": float(value) if value else 0.0,
                        "is_manual": False
                    }
                    filings.append(filing)
        except Exception as e:
            print(f"Error fetching Yahoo data for {ticker}: {e}")
            continue

    return filings

def get_all_filings(db: Session, watchlist: list = None):
    """
    Main Orchestrator: Combines Manual DB entries + Live Data (with Fallback)
    """
    # ১. ডাটাবেস থেকে ম্যানুয়াল এন্ট্রিগুলো আনো
    manual_filings = db.query(InsiderFiling).filter(InsiderFiling.is_manual == True).order_by(InsiderFiling.transaction_date.desc()).limit(20).all()
    
    formatted_manual = [
        {
            "id": f"db_{m.id}",
            "ticker": m.ticker,
            "insider_name": m.insider_name,
            "insider_role": m.insider_role,
            "transaction_type": m.transaction_type,
            "transaction_date": str(m.transaction_date),
            "shares": m.shares,
            "share_price": m.share_price,
            "total_value": m.total_value,
            "is_manual": True
        } for m in manual_filings
    ]
    
    # ২. লাইভ ডেটা আনার চেষ্টা (FMP -> Fallback to Yahoo)
    live_data = []
    try:
        # প্রথমে FMP চেষ্টা করো
        target_ticker = watchlist[0] if watchlist and len(watchlist) == 1 else None
        live_data = fetch_from_fmp(ticker=target_ticker)
        
    except Exception as e:
        print(f"Warning: Primary API failed ({e}). Activating fallback...")
        
        # FMP ফেইল করলে Yahoo ব্যবহার করো
        # যদি ইউজারের watchlist থাকে, সেই টিকারগুলোর ডেটা আনো, না থাকলে ডিফল্ট লিস্ট
        target_list = watchlist if watchlist and len(watchlist) > 0 else FALLBACK_TICKERS
        live_data = fetch_from_yahoo(target_list)
    
    # ৩. সব ডেটা মার্জ করো
    combined_data = formatted_manual + live_data
    
    # ডেট অনুযায়ী সর্ট করো (Latest first)
    combined_data.sort(key=lambda x: str(x.get('transaction_date', '')), reverse=True)
    
    return combined_data

def create_manual_filing(db: Session, filing: InsiderFilingCreate):
    print(f"Creating manual filing: {filing}")
    try:
        # Simplified Core Insert Logic to Avoid ORM Issues
        from sqlalchemy import insert
        stmt = insert(InsiderFiling).values(
            ticker=filing.ticker,
            insider_name=filing.insider_name,
            insider_role=filing.insider_role,
            transaction_type=filing.transaction_type,
            transaction_date=filing.transaction_date,
            shares=filing.shares,
            share_price=filing.share_price,
            total_value=filing.shares * filing.share_price,
            is_manual=True
        )
        db.execute(stmt)
        db.commit()
        
        # Fetch the created object to return it (optional but good for response model)
        # For now just return the input as if it was created
        filing_dict = filing.dict()
        filing_dict['id'] = 0 # Placeholder ID as we didn't fetch it
        filing_dict['total_value'] = filing.shares * filing.share_price
        filing_dict['created_at'] = datetime.now() # Placeholder
        
        print("Manual filing created successfully via Core Insert")
        return filing_dict
    except Exception as e:
        import traceback
        print(f"Error creating manual filing: {e}")
        print(traceback.format_exc())
        db.rollback()
        raise e
