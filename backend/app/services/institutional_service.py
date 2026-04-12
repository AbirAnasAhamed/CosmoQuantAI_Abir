import requests
import logging
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from datetime import datetime, date
from app.models.institutional import InstitutionalFund, FundHolding
from app.core.config import settings
from app.core.logger import get_task_logger

logger = get_task_logger("institutional_service", "institutional.log")

class InstitutionalService:
    def __init__(self):
        self.api_key = settings.FMP_API_KEY
        self.base_url = "https://financialmodelingprep.com/stable"
        if not self.api_key:
            logger.warning("FMP_API_KEY is not set. InstitutionalService will fail.")

    def _get_current_price(self, symbol: str) -> float:
        """
        Fetches real-time price from FMP for accurate valuation.
        """
        try:
            # Stable API uses query params: /quote?symbol=AAPL
            url = f"{self.base_url}/quote?symbol={symbol}&apikey={self.api_key}"
            response = requests.get(url, timeout=5)
            if response.status_code == 200:
                data = response.json()
                if data and isinstance(data, list) and len(data) > 0:
                    return float(data[0].get('price', 0.0))
        except Exception as e:
            logger.error(f"Error fetching price for {symbol}: {e}")
        return 0.0

    def sync_gurus(self, db: Session, cik_list: list[str]):
        """
        Fetches 13F data for a list of CIKs (Gurus) and updates the database.
        """
        if not self.api_key:
            logger.error("Cannot sync gurus: FMP_API_KEY missing.")
            return

        for cik in cik_list:
            try:
                # 1. Fetch 13F Data
                # Attempting Stable API pattern: /form-13f?cik={cik}
                url = f"{self.base_url}/form-13f?cik={cik}&apikey={self.api_key}"
                logger.info(f"Fetching 13F data for CIK {cik}...")
                
                # DEBUG PRINT
                print(f"DEBUG: Calling URL: {self.base_url}/form-13f?cik={cik}&apikey=...{self.api_key[-4:] if self.api_key else 'None'}")
                
                response = requests.get(url, timeout=10)
                
                if response.status_code != 200:
                    logger.error(f"Failed to fetch data for CIK {cik}: {response.text}")
                    print(f"DEBUG: API Error: {response.status_code} - {response.text}")
                    continue

                data = response.json()
                if not data:
                    logger.info(f"No 13F data found for CIK {cik}")
                    print(f"DEBUG: No data found in response (Empty List/None). Raw: {response.text[:100]}")
                    continue
                
                # FMP returns a list of holdings. 
                # We need to determine the filing date. It's usually in each holding object.
                filing_date = None
                
                if isinstance(data, list) and len(data) > 0:
                    first_item = data[0]
                    filing_date_str = first_item.get('date', None) # Reporting period end date
                    
                    if not filing_date_str:
                        # Sometimes date is 'reportDate' or 'fillingDate'
                        filing_date_str = first_item.get('fillingDate', first_item.get('reportDate'))

                    if filing_date_str:
                         try:
                            filing_date = datetime.strptime(filing_date_str, "%Y-%m-%d").date()
                         except ValueError:
                            logger.warning(f"Invalid date format for {cik}: {filing_date_str}")
                            continue
                    else:
                        logger.warning(f"No date found in 13F data for {cik}")
                        continue

                    # 2. Get or Create Fund
                    # Check if fund exists
                    fund = db.query(InstitutionalFund).filter(InstitutionalFund.cik == cik).first()
                    if not fund:
                        fund = InstitutionalFund(
                            name=f"Fund {cik}", # Placeholder
                            cik=cik,
                            filing_date=filing_date
                        )
                        db.add(fund)
                        db.commit()
                        db.refresh(fund)
                    else:
                        # Update filing date
                        fund.filing_date = filing_date
                        db.commit()
                        
                    # 3. Process Holdings (Snapshot Strategy)
                    # Delete existing holdings for this fund to replace with fresh snapshot
                    db.query(FundHolding).filter(FundHolding.fund_id == fund.id).delete()
                    
                    total_assets = 0.0
                    holdings_objects = []
                    
                    # Fix loop syntax error from previous attempt
                    for item in data:
                        symbol = item.get('tickerm', item.get('symbol'))
                        if not symbol: continue
                        
                        shares = float(item.get('shares', 0))
                        if shares == 0: continue
                        
                        # Real-time Value Calculation
                        current_price = self._get_current_price(symbol)
                        current_value = 0.0
                        
                        if current_price > 0:
                            current_value = shares * current_price
                        else:
                            # Fallback to reported value
                            current_value = float(item.get('value', 0))
                        
                        total_assets += current_value
                        
                        holding = FundHolding(
                            fund_id=fund.id,
                            ticker=symbol,
                            shares=shares,
                            value=current_value,
                            date_reported=filing_date,
                            percent_portfolio=0.0 # Calc later
                        )
                        holdings_objects.append(holding)
                    
                    # Calculate Percent Portfolio
                    if total_assets > 0:
                        for h in holdings_objects:
                            h.percent_portfolio = (h.value / total_assets) * 100
                            
                    db.add_all(holdings_objects)
                    
                    # Update Fund Totals
                    fund.total_assets = total_assets
                    db.commit()
                    logger.info(f"Synced {len(holdings_objects)} holdings for {fund.name} ({cik}). Total Assets: ${total_assets:,.2f}")

            except Exception as e:
                logger.error(f"Error syncing {cik}: {e}")
                db.rollback()

    def get_portfolio_stats(self, db: Session, fund_id: int):
        """
        Returns sector allocation for a fund.
        """
        # MVP: Return holdings count and top 5 holdings as 'sector' stats proxy for now
        # until we have full sector data
        total_holdings = db.query(FundHolding).filter(FundHolding.fund_id == fund_id).count()
        top_holdings = db.query(FundHolding).filter(FundHolding.fund_id == fund_id).order_by(desc(FundHolding.percent_portfolio)).limit(5).all()
        
        return {
            "total_holdings_count": total_holdings,
            "top_holdings": [
                {"ticker": h.ticker, "percent": h.percent_portfolio, "value": h.value}
                for h in top_holdings
            ]
        }

    def get_top_movers(self, db: Session):
        """
        Identify stocks with highest holding value across all funds.
        """
        common_holdings = db.query(
            FundHolding.ticker,
            func.sum(FundHolding.value).label('total_value'),
            func.count(FundHolding.id).label('fund_count')
        ).group_by(FundHolding.ticker).order_by(desc('total_value')).limit(10).all()
        
        return [
            {"ticker": r.ticker, "total_value": r.total_value, "fund_count": r.fund_count}
            for r in common_holdings
        ]
