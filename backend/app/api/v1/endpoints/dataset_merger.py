import os
import shutil
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from app.api import deps
from app.services.dataset_merger import DatasetMergerService

router = APIRouter()

UPLOAD_DIR = os.path.join(os.getcwd(), "uploads", "datasets", "temp")
os.makedirs(UPLOAD_DIR, exist_ok=True)

from typing import Optional

@router.post("/merge")
async def merge_historical_dataset(
    symbol: str = Form(...),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    """
    Merge archived Parquet files and the live database to create a continuous dataset.
    Optionally merge with an uploaded historical DVC dataset (CSV).
    """
    temp_file_path = None
    
    if file and file.filename:
        if not file.filename.endswith('.csv'):
            raise HTTPException(status_code=400, detail="Only CSV files are supported for historical DVC datasets.")
        
        # Save the uploaded file temporarily
        temp_file_path = os.path.join(UPLOAD_DIR, f"temp_{current_user.id}_{file.filename}")
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

    try:
        # Call the merger service
        result = DatasetMergerService.merge_datasets(symbol, temp_file_path, db, current_user.id)
        
        return result

    except HTTPException as he:
        raise he
    except Exception as e:
        from app.services.notification import NotificationService
        NotificationService.broadcast_admin_alert_sync(db, f"❌ *Dataset Merger Failed*\nSymbol: {symbol}\nError: {e}", parse_mode="Markdown")
        raise HTTPException(status_code=500, detail=f"Merge failed: {str(e)}")
