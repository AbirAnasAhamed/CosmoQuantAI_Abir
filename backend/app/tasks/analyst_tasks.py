from app.celery_app import celery_app
from app.db.session import SessionLocal
from app.services.analyst_service import AnalystDataService

DEFAULT_TICKERS = ["AAPL", "TSLA", "MSFT", "NVDA", "GOOGL"]

@celery_app.task(name="app.tasks.analyst_tasks.update_analyst_intelligence_task")
def update_analyst_intelligence_task():
    """
    Celery task to automate fetching of analyst ratings and research reports 
    for a standard list of tickers.
    """
    db = SessionLocal()
    try:
        results = {"ratings_success": 0, "reports_success": 0, "failed": 0}
        
        for ticker in DEFAULT_TICKERS:
            # Fetch and store ratings
            rating_success = AnalystDataService.fetch_and_store_ratings(db, ticker)
            if rating_success:
                results["ratings_success"] += 1
            else:
                results["failed"] += 1
                
            # Fetch and store reports
            report_success = AnalystDataService.fetch_and_store_reports(db, ticker)
            if report_success:
                results["reports_success"] += 1
            else:
                results["failed"] += 1
                
        return results
    finally:
        db.close()
