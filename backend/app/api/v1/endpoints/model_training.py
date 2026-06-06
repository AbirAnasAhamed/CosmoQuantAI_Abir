import time
import asyncio
import datetime
from typing import List, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from app.services.websocket_manager import manager

from app import models, schemas
from app.api import deps
from app.db.session import get_db
from app.services.ml_training_engine import train_model_task
from app.services.auto_feature_selector import suggest_optimal_features
from app.services.notification import NotificationService
from pydantic import BaseModel

class SuggestFeaturesRequest(BaseModel):
    symbol: str

class PredictRequest(BaseModel):
    model_id: str
    symbol: Optional[str] = None   # Override symbol (optional)
    sequence_length: Optional[int] = None # Sequence length for dynamic analysis

router = APIRouter()


@router.post("/train", response_model=schemas.TrainingJobResponse)
def start_training_job(
    *,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
    job_in: schemas.TrainingJobCreate,
    background_tasks: BackgroundTasks,
) -> Any:
    """
    Start a new Auto-ML training job.
    """
    job_id = f"train_{int(time.time() * 1000)}"
    
    job = models.ModelTrainingJob(
        id=job_id,
        user_id=current_user.id,
        symbol=job_in.symbol,
        timeframe=job_in.timeframe,
        algorithm=job_in.algorithm,
        config=job_in.config,
        status=models.TrainingStatus.PENDING,
        progress=0.0,
        logs=["Job queued for execution..."]
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    
    # trigger celery background task
    from app.tasks import celery_train_model_task
    celery_train_model_task.apply_async(args=[job_id], task_id=job_id)
    
    return job

@router.get("/jobs", response_model=List[schemas.TrainingJobResponse])
def list_training_jobs(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    List all training jobs for the current user.
    """
    return db.query(models.ModelTrainingJob).filter(
        models.ModelTrainingJob.user_id == current_user.id
    ).order_by(models.ModelTrainingJob.created_at.desc()).all()

@router.get("/jobs/{job_id}", response_model=schemas.TrainingJobResponse)
def get_training_job_status(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Get the status and logs of a specific training job.
    """
    job = db.query(models.ModelTrainingJob).filter(
        models.ModelTrainingJob.id == job_id,
        models.ModelTrainingJob.user_id == current_user.id
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail="Training job not found")
    return job

@router.post("/jobs/{job_id}/cancel", response_model=schemas.TrainingJobResponse)
def cancel_training_job(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Cancel an ongoing training job.
    """
    job = db.query(models.ModelTrainingJob).filter(
        models.ModelTrainingJob.id == job_id,
        models.ModelTrainingJob.user_id == current_user.id
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail="Training job not found")
        
    if job.status in [models.TrainingStatus.COMPLETED, models.TrainingStatus.FAILED]:
        raise HTTPException(status_code=400, detail="Job is already finished")

    job.status = models.TrainingStatus.FAILED
    job.error_message = "Training cancelled by user."
    
    logs = list(job.logs) if job.logs else []
    import datetime
    logs.append(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] 🛑 Training cancelled by user.")
    job.logs = logs

    # Terminate the underlying Celery task to stop background execution
    from app.celery_app import celery_app
    try:
        celery_app.control.revoke(job_id, terminate=True, signal='SIGTERM')
    except Exception as e:
        print(f"Failed to revoke celery task {job_id}: {e}")

    db.commit()
    db.refresh(job)
    return job

@router.post("/jobs/{job_id}/pause", response_model=schemas.TrainingJobResponse)
def pause_training_job(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Pause an ongoing training job gracefully.
    """
    job = db.query(models.ModelTrainingJob).filter(
        models.ModelTrainingJob.id == job_id,
        models.ModelTrainingJob.user_id == current_user.id
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail="Training job not found")
        
    if job.status not in [models.TrainingStatus.RUNNING, models.TrainingStatus.PENDING]:
        raise HTTPException(status_code=400, detail="Only running or pending jobs can be paused")

    job.status = models.TrainingStatus.PAUSED
    
    logs = list(job.logs) if job.logs else []
    logs.append(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] ⏸️ Pause requested. Waiting for engine to save checkpoint and exit gracefully...")
    job.logs = logs

    db.commit()
    db.refresh(job)
    
    # Send Telegram Notification
    try:
        telegram_msg = (
            f"⏸️ *Training Paused*\n"
            f"━━━━━━━━━━━━━━━━━━\n"
            f"🤖 *Job ID:* `{job.id}`\n"
            f"📈 *Symbol:* {job.symbol}\n"
            f"⚙️ *Algorithm:* {job.algorithm}\n"
            f"━━━━━━━━━━━━━━━━━━\n"
            f"Your model training has been gracefully paused."
        )
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(
            NotificationService.send_message(db, current_user.id, telegram_msg, parse_mode="Markdown")
        )
        loop.close()
    except Exception as e:
        print(f"Failed to send telegram notification: {e}")

    return job

@router.post("/jobs/{job_id}/resume", response_model=schemas.TrainingJobResponse)
def resume_training_job(
    job_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Resume a paused or failed training job.
    """
    job = db.query(models.ModelTrainingJob).filter(
        models.ModelTrainingJob.id == job_id,
        models.ModelTrainingJob.user_id == current_user.id
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail="Training job not found")
        
    if job.status in [models.TrainingStatus.RUNNING, models.TrainingStatus.COMPLETED]:
        raise HTTPException(status_code=400, detail="Job is already running or completed")

    job.status = models.TrainingStatus.PENDING
    job.error_message = None
    
    logs = list(job.logs) if job.logs else []
    logs.append(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] ▶️ Resume requested. Queuing job...")
    job.logs = logs

    db.commit()
    db.refresh(job)
    
    # Send Telegram Notification
    try:
        telegram_msg = (
            f"▶️ *Training Resumed*\n"
            f"━━━━━━━━━━━━━━━━━━\n"
            f"🤖 *Job ID:* `{job.id}`\n"
            f"📈 *Symbol:* {job.symbol}\n"
            f"⚙️ *Algorithm:* {job.algorithm}\n"
            f"━━━━━━━━━━━━━━━━━━\n"
            f"Your model training has been successfully resumed."
        )
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(
            NotificationService.send_message(db, current_user.id, telegram_msg, parse_mode="Markdown")
        )
        loop.close()
    except Exception as e:
        print(f"Failed to send telegram notification: {e}")
    
    # trigger celery background task again
    from app.tasks import celery_train_model_task
    celery_train_model_task.apply_async(args=[job_id], task_id=job_id)
    
    return job

@router.post("/suggest-features")
def suggest_l2_features(
    request: SuggestFeaturesRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Analyzes live L2 orderbook data and suggests optimal features to avoid overfitting.
    """
    result = suggest_optimal_features(request.symbol, db)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

@router.websocket("/ws/training-visualizer")
async def websocket_training_visualizer(websocket: WebSocket):
    """
    WebSocket endpoint for the Dataset Visualizer.
    Streams live ticks from the scraper and final merged dataset.
    """
    await manager.connect(websocket, channel_id="training_visualizer")
    try:
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, channel_id="training_visualizer")
    except Exception as e:
        manager.disconnect(websocket, channel_id="training_visualizer")

@router.post("/predict")
def predict_signal(
    request: PredictRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Generate a live prediction signal for a registered ML model.
    Supports all model types: Random Forest, XGBoost, LightGBM, CatBoost,
    LSTM, GRU, 1D-CNN, DeepLOB, Transformer.
    
    Returns: { signal, confidence, price, symbol, algorithm, timestamp }
    """
    from app.services.ml_predictor import predict

    try:
        result = predict(
            model_id=request.model_id,
            symbol_override=request.symbol,
            db=db,
            sequence_length=request.sequence_length
        )
        return result
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

