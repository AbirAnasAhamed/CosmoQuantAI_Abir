from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.api import deps
from app.models.token_unlock import TokenUnlockEvent
from app.schemas.token_unlock import TokenUnlockResponse, TokenUnlockCreate
from app.services.token_unlock_service import TokenUnlockService
from app.services.unlock_intelligence_service import UnlockIntelligenceService

router = APIRouter()

# ─────────────────────────────────────────────────
# Existing Endpoints
# ─────────────────────────────────────────────────

@router.get("/", response_model=List[TokenUnlockResponse])
def read_unlocks(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
):
    """Retrieve token unlock events."""
    unlocks = db.query(TokenUnlockEvent).order_by(TokenUnlockEvent.unlock_date).offset(skip).limit(limit).all()
    return unlocks

@router.post("/sync/{symbol}", response_model=TokenUnlockResponse)
async def sync_token_unlock(
    symbol: str,
    db: Session = Depends(deps.get_db),
):
    """Trigger manual sync for a token's unlock data."""
    service = TokenUnlockService(db)
    try:
        event = await service.sync_token(symbol)
        return event
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{id}/analysis", response_model=TokenUnlockResponse)
async def get_unlock_analysis(
    id: int,
    db: Session = Depends(deps.get_db)
):
    """Get or generate AI analysis for a specific event."""
    event = db.query(TokenUnlockEvent).filter(TokenUnlockEvent.id == id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Unlock event not found")

    if not event.ai_summary or not event.impact_score:
        service = TokenUnlockService(db)
        await service.analyze_impact(event)
        db.add(event)
        db.commit()
        db.refresh(event)

    return event


# ─────────────────────────────────────────────────
# Intelligence Suite Endpoints
# ─────────────────────────────────────────────────

def _get_event_or_404(id: int, db: Session) -> TokenUnlockEvent:
    event = db.query(TokenUnlockEvent).filter(TokenUnlockEvent.id == id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Unlock event not found")
    return event


@router.get("/contagion", response_model=Dict[str, Any])
def get_contagion_map(
    days: int = Query(default=30, ge=7, le=90),
    db: Session = Depends(deps.get_db)
):
    """Feature 4: Multi-Unlock Contagion Map."""
    intel = UnlockIntelligenceService(db)
    return intel.get_contagion_data(days)


@router.get("/sector-rotation", response_model=Dict[str, Any])
def get_sector_rotation(
    days: int = Query(default=30, ge=7, le=90),
    db: Session = Depends(deps.get_db)
):
    """Feature 10: Sector Rotation Intelligence."""
    intel = UnlockIntelligenceService(db)
    return intel.get_sector_rotation(days)


@router.get("/{id}/dna", response_model=Dict[str, Any])
def get_dna_fingerprint(
    id: int,
    db: Session = Depends(deps.get_db)
):
    """Feature 1: Unlock DNA Fingerprint."""
    event = _get_event_or_404(id, db)
    intel = UnlockIntelligenceService(db)
    return intel.get_dna_fingerprint(event)


@router.get("/{id}/deposits", response_model=Dict[str, Any])
def get_exchange_deposit_radar(
    id: int,
    db: Session = Depends(deps.get_db)
):
    """Feature 2: Exchange Deposit Radar."""
    event = _get_event_or_404(id, db)
    intel = UnlockIntelligenceService(db)
    return intel.get_exchange_deposit_radar(event)


@router.get("/{id}/funding", response_model=Dict[str, Any])
def get_funding_divergence(
    id: int,
    db: Session = Depends(deps.get_db)
):
    """Feature 3: Funding Rate Divergence Tracker."""
    event = _get_event_or_404(id, db)
    intel = UnlockIntelligenceService(db)
    return intel.get_funding_divergence(event)


@router.get("/{id}/allocators", response_model=Dict[str, Any])
def get_allocator_intelligence(
    id: int,
    db: Session = Depends(deps.get_db)
):
    """Feature 6: Allocator Behavior Intelligence."""
    event = _get_event_or_404(id, db)
    intel = UnlockIntelligenceService(db)
    return intel.get_allocator_intelligence(event)


@router.get("/{id}/hedge", response_model=Dict[str, Any])
def get_hedge_calculation(
    id: int,
    holding_usd: float = Query(default=10000.0, ge=100),
    db: Session = Depends(deps.get_db)
):
    """Feature 5: Delta-Neutral Hedge Calculator."""
    event = _get_event_or_404(id, db)
    intel = UnlockIntelligenceService(db)
    return intel.calculate_hedge(event, holding_usd)


@router.get("/{id}/arbitrage", response_model=Dict[str, Any])
def get_arbitrage_opportunity(
    id: int,
    db: Session = Depends(deps.get_db)
):
    """Feature 7: Pre-Unlock Arbitrage Screener."""
    event = _get_event_or_404(id, db)
    intel = UnlockIntelligenceService(db)
    return intel.get_arbitrage_opportunities(event)


@router.get("/{id}/options-iv", response_model=Dict[str, Any])
def get_options_iv_analysis(
    id: int,
    db: Session = Depends(deps.get_db)
):
    """Feature 8: Options IV Surface Analyzer."""
    event = _get_event_or_404(id, db)
    intel = UnlockIntelligenceService(db)
    return intel.get_options_iv_analysis(event)


@router.get("/{id}/trap-signal", response_model=Dict[str, Any])
def get_bullish_trap_signal(
    id: int,
    db: Session = Depends(deps.get_db)
):
    """Feature 9: Bullish Trap Detector."""
    event = _get_event_or_404(id, db)
    intel = UnlockIntelligenceService(db)
    return intel.get_bullish_trap_signal(event)
