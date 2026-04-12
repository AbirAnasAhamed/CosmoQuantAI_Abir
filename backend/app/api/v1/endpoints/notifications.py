from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api.deps import get_db, get_current_user
from app.schemas.notification import NotificationSettingsCreate, NotificationSettingsUpdate, NotificationSettingsResponse
from app.models.notification import NotificationSettings
from app.models import User
from app.services.notification import NotificationService

router = APIRouter()

@router.get("/settings", response_model=NotificationSettingsResponse)
def get_notification_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    settings = db.query(NotificationSettings).filter(NotificationSettings.user_id == current_user.id).first()
    if not settings:
        # Return default disabled settings if none exist
        return NotificationSettingsResponse(
            user_id=current_user.id,
            telegram_bot_token=None,
            telegram_chat_id=None,
            is_enabled=False,
            created_at=None # This might need handling in schema if validation is strict, but Pydantic handles optional
        )
    return settings

@router.post("/settings", response_model=NotificationSettingsResponse)
def update_notification_settings(
    settings_in: NotificationSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    settings = db.query(NotificationSettings).filter(NotificationSettings.user_id == current_user.id).first()
    
    if not settings:
        settings = NotificationSettings(user_id=current_user.id, **settings_in.model_dump())
        db.add(settings)
    else:
        for field, value in settings_in.model_dump(exclude_unset=True).items():
            setattr(settings, field, value)
            
    db.commit()
    db.refresh(settings)
    return settings

@router.post("/test")
async def send_test_notification(
    settings_in: NotificationSettingsCreate,
    current_user: User = Depends(get_current_user)
):
    if not settings_in.telegram_bot_token or not settings_in.telegram_chat_id:
         raise HTTPException(status_code=400, detail="Bot token and Chat ID are required")

    success, message = await NotificationService.force_send_message(
        bot_token=settings_in.telegram_bot_token,
        chat_id=settings_in.telegram_chat_id,
        message="🔔 Test Notification from CosmoQuantAI"
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=f"Failed to send message: {message}")
        
    return {"status": "success", "message": "Test notification sent"}
