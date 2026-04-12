from typing import List, Optional
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from sqlalchemy.orm import Session
from app import crud, models, schemas
from app.api import deps
import shutil
import os
from app.services.exchange_balance_service import fetch_all_exchange_balances, sync_user_balance

router = APIRouter()

@router.post("/me/avatar", response_model=schemas.UserResponse)
def upload_avatar(
    file: UploadFile = File(...),
    current_user: models.User = Depends(deps.get_current_user),
    db: Session = Depends(deps.get_db)
):
    # Validate file type
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    # Create avatar directory if not exists (redundant check but safe)
    avatar_dir = os.path.join("static", "avatars")
    if not os.path.exists(avatar_dir):
        os.makedirs(avatar_dir)
        
    # Generate filename
    file_extension = os.path.splitext(file.filename)[1]
    filename = f"user_{current_user.id}{file_extension}"
    file_path = os.path.join(avatar_dir, filename)
    
    # Save file
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not upload file: {str(e)}")
        
    # Update user avatar URL
    # Assuming the app is served from the root or handling /static routing
    avatar_url = f"/static/avatars/{filename}"
    current_user.avatar_url = avatar_url
    
    db.commit()
    db.refresh(current_user)
    return current_user

@router.post("/api-keys", response_model=schemas.ApiKeyResponse)
def add_api_key(
    api_key_data: schemas.ApiKeyCreate, 
    current_user: models.User = Depends(deps.get_current_user),
    db: Session = Depends(deps.get_db)
):
    return crud.create_user_api_key(db=db, api_key=api_key_data, user_id=current_user.id)

@router.get("/api-keys", response_model=List[schemas.ApiKeyResponse])
def read_api_keys(
    current_user: models.User = Depends(deps.get_current_user),
    db: Session = Depends(deps.get_db)
):
    return crud.get_user_api_keys(db=db, user_id=current_user.id)

@router.delete("/api-keys/{key_id}")
def delete_api_key(
    key_id: int,
    current_user: models.User = Depends(deps.get_current_user),
    db: Session = Depends(deps.get_db)
):
    success = crud.delete_user_api_key(db=db, key_id=key_id, user_id=current_user.id)
    if not success:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="API Key not found")
    return {"message": "API Key deleted successfully"}


@router.get("/exchange-balance")
async def get_exchange_balances(
    current_user: models.User = Depends(deps.get_current_user),
    db: Session = Depends(deps.get_db)
):
    """
    User-এর সকল connected exchange থেকে real-time balance fetch করো।
    Returns per-exchange breakdown with total USDT.
    """
    try:
        balances = await fetch_all_exchange_balances(db=db, user_id=current_user.id)
        return balances
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Balance fetch failed: {str(e)}")


@router.post("/sync-balance")
async def sync_balance(
    current_user: models.User = Depends(deps.get_current_user),
    db: Session = Depends(deps.get_db)
):
    """
    সমস্ত exchange balance sum করে user.balance DB-তে update করো।
    Dashboard-এর Total Equity এই value থেকে আসে।
    """
    try:
        new_balance = await sync_user_balance(db=db, user_id=current_user.id)
        return {
            "success": True,
            "new_balance": new_balance,
            "message": f"Balance synced: ${new_balance:,.2f} USDT"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")

@router.get("/me", response_model=schemas.UserResponse)
def read_users_me(current_user: models.User = Depends(deps.get_current_user)):
    return current_user

@router.put("/me/security", response_model=schemas.UserResponse)
def update_user_security(
    security_update: schemas.UserSecurityUpdate,
    current_user: models.User = Depends(deps.get_current_user),
    db: Session = Depends(deps.get_db)
):
    # Only update fields that are provided
    if security_update.allowed_ips is not None:
        current_user.allowed_ips = security_update.allowed_ips
    
    if security_update.is_ip_whitelist_enabled is not None:
        current_user.is_ip_whitelist_enabled = security_update.is_ip_whitelist_enabled
        
    db.commit()
    db.refresh(current_user)
    return current_user
