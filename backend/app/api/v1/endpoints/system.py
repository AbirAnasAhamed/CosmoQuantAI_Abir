from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from app.utils import get_redis_client
import redis
from app import models

from app.api import deps
from app.db.session import SessionLocal
from app.services.market_service import MarketService
from app.services.system_service import SystemService
from sqlalchemy.orm import Session
from datetime import datetime
import pytz

router = APIRouter()

class KillSwitchSchema(BaseModel):
    active: bool

class PruneResponse(BaseModel):
    deleted_count: int
    message: str

class ServiceStatus(BaseModel):
    database: str
    redis: str
    celery_worker: str

class HealthResponse(BaseModel):
    status: str
    services: ServiceStatus
    timestamp: str

@router.get("/kill-switch", response_model=KillSwitchSchema)
def get_kill_switch_status():
    """
    Get the current status of the Global Admin Kill Switch.
    """
    r = get_redis_client()
    status = r.get("global_kill_switch")
    is_active = status == "true"
    return {"active": is_active}

@router.post("/kill-switch", response_model=KillSwitchSchema)
def toggle_kill_switch(payload: KillSwitchSchema):
    """
    Toggle the Global Admin Kill Switch.
    """
    r = get_redis_client()
    r.set("global_kill_switch", "true" if payload.active else "false")
    return {"active": payload.active}

@router.get("/panic", response_model=KillSwitchSchema)
def get_panic_status(
    current_user: models.User = Depends(deps.get_current_user)
):
    """
    Get the panic status for the current user.
    """
    r = get_redis_client()
    key = f"GLOBAL_KILL_SWITCH:{current_user.id}"
    status = r.get(key)
    is_active = status == "true"
    return {"active": is_active}

@router.post("/panic", response_model=KillSwitchSchema)
def toggle_panic_switch(
    payload: KillSwitchSchema,
    current_user: models.User = Depends(deps.get_current_user)
):
    """
    Toggle the User Panic Switch.
    When active (True), all bots for this user MUST stop immediately.
    """
    r = get_redis_client()
    key = f"GLOBAL_KILL_SWITCH:{current_user.id}"
    r.set(key, "true" if payload.active else "false")
    return {"active": payload.active}


@router.post("/prune-db", response_model=PruneResponse)
def prune_database_manually(
    days: int = 30,
    current_user: models.User = Depends(deps.get_current_active_superuser)
):
    """
    Manually trigger data pruning.
    Requires Superuser privileges.
    """
    db = SessionLocal()
    try:
        count = MarketService().prune_old_sentiment_data(db, days=days)
        return {"deleted_count": count, "message": f"Successfully deleted {count} records older than {days} records."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@router.get("/health", response_model=HealthResponse)
async def health_check(
    db: Session = Depends(deps.get_db)
):
    """
    Monitor the pulse of the entire backend infrastructure: Database, Redis, and Celery Worker.
    Returns 503 if unhealthy.
    """
    status_data = await SystemService.check_health(db)
    
    # Overwrite timestamp with current time
    status_data["timestamp"] = datetime.now(pytz.utc).isoformat()
    
    if status_data["status"] != "healthy":
        # We return the data even if 503, so the client knows WHAT is down.
        # FastAPI HTTPException handles content? No, usually just detail string or dict.
        # But for 503 with body, we might need JSONResponse.
        # However, simply raising HTTPException with detail=status_data works for simple clients,
        # but the response_schema validation might fail if we just return.
        # For strict 503, we can use JSONResponse.
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=503, content=status_data)
        
    return status_data
