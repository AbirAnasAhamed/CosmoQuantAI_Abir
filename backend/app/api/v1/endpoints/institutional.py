from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.institutional import InstitutionalFund
from app.schemas import institutional as schemas
from app.services.institutional_service import InstitutionalService

router = APIRouter()
service = InstitutionalService()

@router.get("/", response_model=List[schemas.InstitutionalFund])
def read_funds(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
) -> Any:
    """
    Retrieve all tracked Institutional Funds (Gurus).
    """
    funds = db.query(InstitutionalFund).offset(skip).limit(limit).all()
    return funds

@router.get("/movers", response_model=List[schemas.TopMover])
def read_top_movers(db: Session = Depends(get_db)) -> Any:
    """
    Get top stocks bought/sold (held) across all funds by value.
    """
    return service.get_top_movers(db)

@router.get("/{fund_id}", response_model=schemas.InstitutionalFund)
def read_fund(
    fund_id: int,
    db: Session = Depends(get_db)
) -> Any:
    """
    Get a specific fund by ID.
    """
    fund = db.query(InstitutionalFund).filter(InstitutionalFund.id == fund_id).first()
    if not fund:
        raise HTTPException(status_code=404, detail="Fund not found")
    return fund

@router.get("/{fund_id}/stats", response_model=schemas.PortfolioStats)
def read_fund_stats(
    fund_id: int,
    db: Session = Depends(get_db)
) -> Any:
    """
    Get portfolio statistics (e.g., sector allocation, top holdings) for a fund.
    """
    fund = db.query(InstitutionalFund).filter(InstitutionalFund.id == fund_id).first()
    if not fund:
        raise HTTPException(status_code=404, detail="Fund not found")
    
    return service.get_portfolio_stats(db, fund_id)

@router.post("/sync")
def sync_gurus_manual(
    db: Session = Depends(get_db)
) -> Any:
    """
    Trigger manual sync of Guru data (Admin only usually).
    """
    # Hardcoded list of popular Gurus for MVP sync
    # Warren Buffett, Ray Dalio, etc.
    target_ciks = [
        "0001067983", # Berkshire Hathaway
        "0001350694", # Bridgewater Associates
        "0001166559", # Gates Foundation
        "000102909",  # Vanguard Group (Example, massive) - Wait, Vanguard CIK is 0000102909
        # Let's start with just Berkshire to avoid rate limits on free usage logic if limited
    ]
    
    # Ideally async task, but for MVP blocking is fine or use BackgroundTasks
    try:
        service.sync_gurus(db, target_ciks)
        return {"message": "Sync triggered successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
