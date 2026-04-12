from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Any
from app.api import deps
from app.services import insider_service
from app.schemas.insider import InsiderFilingCreate, InsiderFiling

router = APIRouter()

@router.get("/", response_model=List[Any])
def read_filings(
    db: Session = Depends(deps.get_db),
    # current_user: models.User = Depends(deps.get_current_active_user) # যদি ইউজার অথেন্টিকেশন চাও
):
    """
    Get all insider filings (Live + Manual)
    """
    filings = insider_service.get_all_filings(db)
    return filings

@router.post("/", response_model=InsiderFiling)
def create_filing(
    *,
    db: Session = Depends(deps.get_db),
    filing_in: InsiderFilingCreate,
):
    """
    Create a manual insider filing record
    """
    filing = insider_service.create_manual_filing(db, filing_in)
    return filing
