import os
import json
import shutil
import time
import asyncio
from typing import List, Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app import crud, models, schemas
from app.api import deps
from app.db.session import get_db

router = APIRouter()

UPLOAD_DIR = "uploads/models"
os.makedirs(UPLOAD_DIR, exist_ok=True)

async def simulate_processing(version_id: str):
    """Background task to finalize model processing after upload.

    Priority order for metrics/explainability:
    1. Reads real values from metadata.json (custom upload)
    2. Falls back to mock data only if no metadata provided
    """
    import random
    from app.db.session import SessionLocal
    await asyncio.sleep(5)

    db = SessionLocal()
    try:
        version = db.query(models.ModelVersion).filter(models.ModelVersion.id == version_id).first()
        if not version or version.status != models.ModelStatus.PROCESSING:
            return

        # --- Try reading from metadata.json ---
        meta = {}
        if version.metadata_path and os.path.exists(version.metadata_path):
            try:
                with open(version.metadata_path, "r") as f:
                    meta = json.load(f)
            except Exception as e:
                print(f"[ML Registry] Could not parse metadata.json for version {version_id}: {e}")
    
        version.status = models.ModelStatus.READY
    
        # --- Metrics: prefer real values from metadata ---
        version.accuracy = (
            meta.get("accuracy") or meta.get("val_accuracy") or meta.get("test_accuracy")
            or meta.get("r2_score") or meta.get("win_rate")
            or (0.85 + random.uniform(-0.05, 0.05))
        )
        version.f1_score = (
            meta.get("f1_score") or meta.get("f1") or meta.get("sharpe_ratio")
            or meta.get("mse") or meta.get("rmse")
            or (0.82 + random.uniform(-0.05, 0.05))
        )
        version.latency = (
            meta.get("inference_latency_ms") or meta.get("latency_ms") or meta.get("latency")
            or (12.5 + random.uniform(-2, 5))
        )
    
        # --- Explainability: build from metadata fields, fall back to mock ---
        if meta:
            explainability = {}
    
            # Feature importance
            if meta.get("feature_importance"):
                fi = meta["feature_importance"]
                if isinstance(fi, dict):
                    explainability["featureImportance"] = [
                        {"name": k, "value": v} for k, v in sorted(fi.items(), key=lambda x: -x[1])
                    ]
                elif isinstance(fi, list):
                    explainability["featureImportance"] = fi
    
            # RL-style metrics
            if meta.get("total_return_pct") is not None:
                explainability["total_return_pct"] = meta["total_return_pct"]
                explainability["win_rate"] = meta.get("win_rate", 0)
                explainability["sharpe_ratio"] = meta.get("sharpe_ratio", 0)
                explainability["trades_count"] = meta.get("trades_count") or meta.get("total_trades", 0)
    
            # Backtest results
            if meta.get("backtest_result"):
                explainability["backtest_result"] = meta["backtest_result"]
    
            # CV scores
            if meta.get("cv_scores"):
                explainability["cv_scores"] = meta["cv_scores"]
    
            # Confusion matrix
            if meta.get("confusion_matrix"):
                cm = meta["confusion_matrix"]
                if isinstance(cm, dict) and "classes" in cm and "matrix" in cm:
                    explainability["confusionMatrix"] = cm
    
            # Pass-through any custom top-level explainability block
            if meta.get("explainability") and isinstance(meta["explainability"], dict):
                explainability.update(meta["explainability"])
    
            # If no structured explainability at all, store raw meta for reference
            if not explainability:
                explainability = {"_raw_metadata": meta}
    
            version.explainability = explainability
        else:
            # Fallback mock explainability (no metadata uploaded)
            version.explainability = {
                "featureImportance": [
                    {"name": "Level2_Imbalance", "value": 0.45},
                    {"name": "Volume_Profile", "value": 0.25},
                    {"name": "RSI_14", "value": 0.15},
                    {"name": "MACD_Hist", "value": 0.10},
                    {"name": "Funding_Rate", "value": 0.05}
                ],
                "shapSummary": [
                    {"feature": "Level2_Imbalance", "impact": 0.08, "value": "High"},
                    {"feature": "Level2_Imbalance", "impact": -0.05, "value": "Low"},
                    {"feature": "Volume_Profile", "impact": 0.04, "value": "High"},
                    {"feature": "RSI_14", "impact": -0.03, "value": "High"}
                ],
                "pdpData": [
                    {"x": 1000, "y": 0.1}, {"x": 5000, "y": 0.4},
                    {"x": 10000, "y": 0.8}, {"x": 20000, "y": 0.95}
                ],
                "timeSeriesData": [
                    {"time": "2026-05-01", "actual": 60000, "predicted": 60100},
                    {"time": "2026-05-02", "actual": 61500, "predicted": 61200},
                    {"time": "2026-05-03", "actual": 59000, "predicted": 59500},
                    {"time": "2026-05-04", "actual": 62000, "predicted": 61800},
                    {"time": "2026-05-05", "actual": 64000, "predicted": 63500}
                ],
                "confusionMatrix": {
                    "classes": ["Buy", "Sell", "Hold"],
                    "matrix": [[85, 5, 10], [2, 90, 8], [12, 15, 73]]
                },
                "decisionTree": {
                    "nodes": [
                        {"id": "1", "label": "Level2 Imbalance > 0.5", "type": "condition"},
                        {"id": "2", "label": "RSI > 70", "type": "condition"},
                        {"id": "3", "label": "Volume Profile > 1M", "type": "condition"},
                        {"id": "4", "label": "SELL", "type": "leaf", "color": "red"},
                        {"id": "5", "label": "HOLD", "type": "leaf", "color": "gray"},
                        {"id": "6", "label": "BUY", "type": "leaf", "color": "green"}
                    ],
                    "edges": [
                        {"source": "1", "target": "2", "label": "Yes"},
                        {"source": "1", "target": "3", "label": "No"},
                        {"source": "2", "target": "4", "label": "Yes"},
                        {"source": "2", "target": "5", "label": "No"},
                        {"source": "3", "target": "6", "label": "Yes"},
                        {"source": "3", "target": "5", "label": "No"}
                    ]
                }
        }

        db.commit()
    finally:
        db.close()

@router.get("", response_model=List[schemas.CustomMLModelResponse])
def get_custom_models(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve all custom models for the current user.
    """
    models_list = db.query(models.CustomMLModel).filter(models.CustomMLModel.user_id == current_user.id).order_by(models.CustomMLModel.created_at.desc()).all()
    return models_list

@router.post("", response_model=schemas.CustomMLModelResponse)
async def create_custom_model(
    background_tasks: BackgroundTasks,
    name: str = Form(...),
    model_type: str = Form(...),
    version: float = Form(...),
    description: str = Form(...),
    file: UploadFile = File(...),
    metadata_file: UploadFile = File(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Create a new custom ML model and upload its first version.
    """
    timestamp = int(time.time() * 1000)
    model_id = f"model_{timestamp}"
    version_id = f"v{version}-{timestamp}"
    
    # Save file
    version_dir = os.path.join(UPLOAD_DIR, f"v_{version_id}")
    os.makedirs(version_dir, exist_ok=True)
    file_path = os.path.join(version_dir, f"{version_id}_{file.filename}")
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Save metadata file if provided
    saved_metadata_path = None
    if metadata_file and metadata_file.filename:
        metadata_path = os.path.join(version_dir, "metadata.json")
        with open(metadata_path, "wb") as buffer:
            shutil.copyfileobj(metadata_file.file, buffer)
        saved_metadata_path = metadata_path

    # Create model entry without active_version_id initially
    db_model = models.CustomMLModel(
        id=model_id,
        name=name,
        model_type=model_type,
        user_id=current_user.id,
        active_version_id=None
    )
    db.add(db_model)
    db.commit()

    # Create version entry
    db_version = models.ModelVersion(
        id=version_id,
        model_id=model_id,
        version=version,
        description=description,
        file_path=file_path,
        metadata_path=saved_metadata_path,
        status=models.ModelStatus.PROCESSING
    )
    db.add(db_version)
    db.commit()
    
    # Set active version now that both exist
    db_model.active_version_id = version_id
    db.commit()
    db.refresh(db_model)
    
    # Trigger background processing
    background_tasks.add_task(simulate_processing, version_id)

    return db_model

@router.post("/{model_id}/versions", response_model=schemas.CustomMLModelResponse)
async def upload_new_version(
    model_id: str,
    background_tasks: BackgroundTasks,
    version: float = Form(...),
    description: str = Form(...),
    file: UploadFile = File(...),
    metadata_file: UploadFile = File(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Upload a new version for an existing model.
    """
    db_model = db.query(models.CustomMLModel).filter(models.CustomMLModel.id == model_id, models.CustomMLModel.user_id == current_user.id).first()
    if not db_model:
        raise HTTPException(status_code=404, detail="Model not found")

    timestamp = int(time.time() * 1000)
    version_id = f"v{version}-{timestamp}"
    
    # Save file
    version_dir = os.path.join(UPLOAD_DIR, f"v_{version_id}")
    os.makedirs(version_dir, exist_ok=True)
    file_path = os.path.join(version_dir, f"{version_id}_{file.filename}")
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Save metadata file if provided
    saved_metadata_path = None
    if metadata_file and metadata_file.filename:
        metadata_path = os.path.join(version_dir, "metadata.json")
        with open(metadata_path, "wb") as buffer:
            shutil.copyfileobj(metadata_file.file, buffer)
        saved_metadata_path = metadata_path

    # Create version entry
    db_version = models.ModelVersion(
        id=version_id,
        model_id=model_id,
        version=version,
        description=description,
        file_path=file_path,
        metadata_path=saved_metadata_path,
        status=models.ModelStatus.PROCESSING
    )
    db.add(db_version)
    db.commit()
    db.refresh(db_model)

    # Trigger background processing
    background_tasks.add_task(simulate_processing, version_id)

    return db_model

@router.put("/{model_id}/active-version", response_model=schemas.CustomMLModelResponse)
def set_active_version(
    model_id: str,
    update_data: schemas.CustomMLModelUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Set the active version for a model.
    """
    db_model = db.query(models.CustomMLModel).filter(models.CustomMLModel.id == model_id, models.CustomMLModel.user_id == current_user.id).first()
    if not db_model:
        raise HTTPException(status_code=404, detail="Model not found")

    # Verify version exists and belongs to this model
    db_version = db.query(models.ModelVersion).filter(models.ModelVersion.id == update_data.active_version_id, models.ModelVersion.model_id == model_id).first()
    if not db_version:
        raise HTTPException(status_code=404, detail="Version not found")
        
    if db_version.status != models.ModelStatus.READY:
        raise HTTPException(status_code=400, detail="Cannot activate a version that is not Ready")

    db_model.active_version_id = update_data.active_version_id
    db.commit()
    db.refresh(db_model)

    return db_model

@router.delete("/{model_id}")
def delete_model(
    model_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Delete a custom ML model and its files.
    """
    db_model = db.query(models.CustomMLModel).filter(models.CustomMLModel.id == model_id, models.CustomMLModel.user_id == current_user.id).first()
    if not db_model:
        raise HTTPException(status_code=404, detail="Model not found")

    # Delete physical files and folders
    for version in db_model.versions:
        if version.file_path and os.path.exists(version.file_path):
            try:
                parent_dir = os.path.dirname(version.file_path)
                # If the file is in a subdirectory of UPLOAD_DIR, remove the whole directory
                if parent_dir != os.path.abspath(UPLOAD_DIR) and parent_dir != UPLOAD_DIR:
                    shutil.rmtree(parent_dir)
                else:
                    os.remove(version.file_path)
                    # Also try to remove associated .json if exists
                    json_path = version.file_path.replace(".pkl", ".json").replace(".pt", ".json")
                    if os.path.exists(json_path):
                        os.remove(json_path)
            except Exception as e:
                print(f"Error removing files for version {version.id}: {e}")

    # Break circular foreign key dependency before deletion
    db_model.active_version_id = None
    db.flush()

    db.delete(db_model)
    db.commit()

    return {"status": "success"}

@router.get("/{model_id}/config")
def get_model_config(
    model_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Get the training configuration for a specific model.
    Priority: (1) Most recent COMPLETED training job, (2) metadata.json from custom upload.
    """
    db_model = db.query(models.CustomMLModel).filter(
        models.CustomMLModel.id == model_id, 
        models.CustomMLModel.user_id == current_user.id
    ).first()
    
    if not db_model:
        raise HTTPException(status_code=404, detail="Model not found")

    # Priority 1: Find the most recent COMPLETED training job for this model
    job = db.query(models.ModelTrainingJob).filter(
        models.ModelTrainingJob.output_model_id == model_id,
        models.ModelTrainingJob.status == models.TrainingStatus.COMPLETED
    ).order_by(models.ModelTrainingJob.completed_at.desc()).first()

    if job:
        job_config = dict(job.config) if job.config else {}
        if job_config.get("dataset_type") == "hybrid_deep" and "hybrid_deep_trade_features" in job_config:
            job_config["trade_features"] = job_config["hybrid_deep_trade_features"]
            
        return {
            "model_name": db_model.name,
            "symbol": job.symbol,
            "timeframe": job.timeframe,
            "algorithm": db_model.model_type,
            "config": job_config
        }

    # Priority 2: Read from metadata.json on the active version
    if db_model.active_version_id:
        version = db.query(models.ModelVersion).filter(
            models.ModelVersion.id == db_model.active_version_id
        ).first()
        if version and version.metadata_path and os.path.exists(version.metadata_path):
            try:
                with open(version.metadata_path, "r") as f:
                    meta = json.load(f)
                # Flexible key mapping - support multiple common metadata schemas
                return {
                    "model_name": meta.get("model_name") or meta.get("name") or db_model.name,
                    "symbol": meta.get("symbol") or meta.get("target_asset") or meta.get("pair") or "N/A",
                    "timeframe": meta.get("timeframe") or meta.get("interval") or "N/A",
                    "algorithm": db_model.model_type or meta.get("algorithm") or meta.get("model_type") or meta.get("arch"),
                    "config": {
                        # Flexible epoch/steps lookup for all model types:
                        # - Neural nets (LSTM, GRU, CNN, Transformer): epochs
                        # - RL agents (SAC-RL, PPO-RL): total_timesteps / total_steps / training_steps / n_steps
                        # - Tree models (RF, XGB, LGB, CatBoost): n_estimators / num_trees / num_boost_round
                        "epochs": next((meta.get(k) for k in (
                            "epochs",
                            "total_timesteps", "total_steps", "training_steps", "n_steps", "max_steps",
                            "n_episodes", "max_episodes",
                            "n_estimators", "num_trees", "num_boost_round", "num_leaves",
                        ) if meta.get(k) is not None), None),
                        # indicators: prefer existing keys even if empty
                        "indicators": meta.get("indicators") if "indicators" in meta else meta.get("features", meta.get("feature_list", [])),
                        "l2_features": meta.get("l2_features") if "l2_features" in meta else meta.get("orderbook_features", []),
                        "trade_features": meta.get("trade_features") if "trade_features" in meta else meta.get("tick_features", []),
                        "plp_features": meta.get("plp_features", []),
                        "lookback": meta.get("lookback") or meta.get("sequence_length") or meta.get("window"),
                        "train_size": meta.get("train_size") or meta.get("train_split"),
                        "dataset_type": meta.get("dataset_type"),
                        "prediction_target": meta.get("prediction_target"),
                        # Include all remaining raw metadata fields
                        **{k: v for k, v in meta.items() if k not in (
                            "symbol", "timeframe", "algorithm", "model_type", "arch",
                            "epochs", "n_estimators", "indicators", "features", "feature_list",
                            "l2_features", "trade_features", "plp_features", "lookback",
                            "sequence_length", "window", "train_size", "train_split",
                            "dataset_type", "prediction_target"
                        )}
                    },
                    "_source": "metadata_json"
                }
            except Exception as e:
                print(f"[ML Registry] Warning: Could not parse metadata.json for {model_id}: {e}")

    # Fallback: basic info only
    return {
        "symbol": "N/A",
        "algorithm": db_model.model_type,
        "config": {}
    }

@router.get("/{model_id}/explainability")
def get_model_explainability(
    model_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Get the explainability data for the currently active version of a model.
    """
    db_model = db.query(models.CustomMLModel).filter(
        models.CustomMLModel.id == model_id, 
        models.CustomMLModel.user_id == current_user.id
    ).first()
    
    if not db_model:
        raise HTTPException(status_code=404, detail="Model not found")

    if not db_model.active_version_id:
        raise HTTPException(status_code=400, detail="Model has no active version")

    version = db.query(models.ModelVersion).filter(models.ModelVersion.id == db_model.active_version_id).first()
    if not version:
        raise HTTPException(status_code=404, detail="Active version not found")

    if not version.explainability:
        return {} # No explainability data available yet

    return version.explainability


@router.get("/{model_id}/download")
def download_model(
    model_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Download the active version file of a model.
    """
    db_model = db.query(models.CustomMLModel).filter(
        models.CustomMLModel.id == model_id,
        models.CustomMLModel.user_id == current_user.id
    ).first()

    if not db_model:
        raise HTTPException(status_code=404, detail="Model not found")

    if not db_model.active_version_id:
        raise HTTPException(status_code=400, detail="Model has no active version set")

    version = db.query(models.ModelVersion).filter(
        models.ModelVersion.id == db_model.active_version_id
    ).first()

    if not version:
        raise HTTPException(status_code=404, detail="Active version record not found")

    if version.status != models.ModelStatus.READY:
        raise HTTPException(status_code=400, detail="Model is not ready for download yet")

    file_path = version.file_path
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Model file not found on server")

    # Build a clean download filename: <model_name>_v<version>.<ext>
    original_filename = os.path.basename(file_path)
    # Try to get the extension from the stored filename (after the version prefix)
    ext = os.path.splitext(original_filename)[1] or ".bin"
    safe_model_name = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in db_model.name)
    
    # Check if metadata exists
    json_path = file_path.replace(".pkl", ".json").replace(".pt", ".json").replace(".zip", ".json").replace(".onnx", ".json").replace(".h5", ".json")
    
    if os.path.exists(json_path):
        import zipfile
        import io
        from fastapi.responses import StreamingResponse
        
        # Create a ZIP file in memory
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            zip_file.write(file_path, arcname=original_filename)
            zip_file.write(json_path, arcname=os.path.basename(json_path))
            
        zip_buffer.seek(0)
        download_filename = f"{safe_model_name}_v{version.version:.1f}_bundle.zip"
        
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename={download_filename}"}
        )
    else:
        download_filename = f"{safe_model_name}_v{version.version:.1f}{ext}"
        return FileResponse(
            path=file_path,
            filename=download_filename,
            media_type="application/octet-stream",
        )


@router.get("/{model_id}/dataset/download")
def download_model_dataset(
    model_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Download the dataset snapshot used to train the active version of a model.
    """
    db_model = db.query(models.CustomMLModel).filter(
        models.CustomMLModel.id == model_id,
        models.CustomMLModel.user_id == current_user.id
    ).first()

    if not db_model:
        raise HTTPException(status_code=404, detail="Model not found")

    if not db_model.active_version_id:
        raise HTTPException(status_code=400, detail="Model has no active version set")

    version = db.query(models.ModelVersion).filter(
        models.ModelVersion.id == db_model.active_version_id
    ).first()

    if not version:
        raise HTTPException(status_code=404, detail="Active version record not found")
        
    dataset_path = version.dataset_path
    if not dataset_path or not os.path.exists(dataset_path):
        raise HTTPException(status_code=404, detail="Dataset snapshot not found for this version. It may have been trained before DVC was enabled.")

    safe_model_name = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in db_model.name)
    download_filename = f"{safe_model_name}_v{version.version:.1f}_dataset.csv"

    return FileResponse(
        path=dataset_path,
        filename=download_filename,
        media_type="text/csv",
    )
