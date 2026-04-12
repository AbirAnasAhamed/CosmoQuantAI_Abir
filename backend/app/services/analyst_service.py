from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from app.models.analyst_rating import AnalystRating
from app.models.research_report import ResearchReport
import random

class AnalystDataService:
    @staticmethod
    def fetch_and_store_ratings(db: Session, ticker: str):
        """
        Mock data fetching logic for analyst ratings.
        In production, this would make external HTTP requests to a data provider.
        """
        try:
            firms = ["Morgan Stanley", "Goldman Sachs", "JPMorgan", "Bank of America"]
            mock_ratings = [
                {
                    "ticker": ticker,
                    "firm_name": firms[i],
                    "date": datetime.now(),
                    "rating_action": random.choice(["Upgrade", "Downgrade", "Initiated", "Maintained"]),
                    "rating": random.choice(["Buy", "Hold", "Sell", "Overweight"]),
                    "price_target": round(random.uniform(100.0, 500.0), 2)
                }
                for i in range(3) # Generate 3 mock ratings per ticker
            ]

            for rating_data in mock_ratings:
                # Basic update/insert logic
                existing_rating = db.query(AnalystRating).filter_by(
                    ticker=rating_data["ticker"],
                    firm_name=rating_data["firm_name"]
                ).first()

                if existing_rating:
                    existing_rating.rating = rating_data["rating"]
                    existing_rating.rating_action = rating_data["rating_action"]
                    existing_rating.price_target = rating_data["price_target"]
                    existing_rating.date = rating_data["date"]
                else:
                    new_rating = AnalystRating(**rating_data)
                    db.add(new_rating)
            
            db.commit()
            return True
            
        except SQLAlchemyError as e:
            db.rollback()
            print(f"Error saving analyst ratings for {ticker}: {e}")
            return False

    @staticmethod
    def fetch_and_store_reports(db: Session, ticker: str):
        """
        Mock data fetching logic for research reports.
        """
        try:
            # Mock reports data
            mock_reports = [
                {
                    "ticker": ticker,
                    "publish_date": datetime.now(),
                    "title": f"Deep Dive: {ticker} Q{i} Outlook",
                    "summary": f"Comprehensive analysis on {ticker}'s market position.",
                    "source_name": random.choice(["Bloomberg", "Internal Quant Team", "Reuters"]),
                    "report_link": f"https://reports.cosmoquant.ai/{ticker.lower()}_{i}"
                }
                for i in range(1, 3) # Generate 2 mock reports per ticker
            ]

            for report_data in mock_reports:
                # Basic update/insert logic (assume title + ticker makes it unique for mocked data purposes)
                existing_report = db.query(ResearchReport).filter_by(
                    ticker=report_data["ticker"],
                    title=report_data["title"]
                ).first()

                if existing_report:
                    existing_report.summary = report_data["summary"]
                    existing_report.publish_date = report_data["publish_date"]
                    existing_report.report_link = report_data["report_link"]
                else:
                    new_report = ResearchReport(**report_data)
                    db.add(new_report)
            
            db.commit()
            return True
            
        except SQLAlchemyError as e:
            db.rollback()
            print(f"Error saving research reports for {ticker}: {e}")
            return False
