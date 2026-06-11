import os
import json
import logging
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app import models
from app import models

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

UPLOAD_DIR = "uploads/models"



def sync_directory(dir_path, db, user):
    if not os.path.isdir(dir_path):
        return

    model_id = os.path.basename(dir_path)

    # Check if model already exists in DB by ID
    existing_model = db.query(models.CustomMLModel).filter(models.CustomMLModel.id == model_id).first()
    if existing_model:
        logger.info(f"Model {model_id} already exists in database. Skipping.")
        return existing_model

    # Check if the directory is already mapped to an existing model version
    # This prevents duplicate registration when the training engine saves files in job_train_... 
    # but registers the model as model_...
    existing_version = db.query(models.ModelVersion).filter(
        models.ModelVersion.file_path.like(f"%{model_id}%")
    ).first()
    
    if existing_version:
        logger.info(f"Directory {model_id} is already mapped to model {existing_version.model_id}. Skipping.")
        return None

    # Look for model files and metadata
    json_file = None
    model_file = None

    for file in os.listdir(dir_path):
        if file.endswith(".json") and not file.startswith("replay") and not file.startswith("training_state") and file != "metadata.json":
            json_file = os.path.join(dir_path, file)
        elif file == "metadata.json":
            json_file = os.path.join(dir_path, file)
        elif file.endswith((".zip", ".pkl", ".pt", ".onnx", ".h5")) and "checkpoint" not in file:
            model_file = os.path.join(dir_path, file)

    # fallback for metadata.json if exists
    if not json_file and os.path.exists(os.path.join(dir_path, "metadata.json")):
        json_file = os.path.join(dir_path, "metadata.json")

    if not model_file and os.path.exists(os.path.join(dir_path, f"{model_id}.zip")):
         model_file = os.path.join(dir_path, f"{model_id}.zip")

    if not model_file:
        logger.warning(f"No model file found in {dir_path}. Skipping.")
        return None

    # Parse metadata
    name = model_id
    algorithm = "Unknown"
    accuracy, f1_score, latency = None, None, None
    explainability = {}

    if json_file and os.path.exists(json_file):
        try:
            with open(json_file, "r") as f:
                meta = json.load(f)

            name = meta.get("model_name", meta.get("name", meta.get("symbol", model_id)))
            algorithm = meta.get("algorithm", meta.get("model_type", meta.get("arch", "Unknown")))
            accuracy = meta.get("accuracy") or meta.get("val_accuracy") or meta.get("r2_score")
            f1_score = meta.get("f1_score") or meta.get("f1") or meta.get("mse")
            latency = meta.get("latency", meta.get("inference_latency_ms", 10.0))

            if "explainability" in meta:
                explainability = meta["explainability"]
            else:
                explainability = {"_raw_metadata": meta}
        except Exception as e:
            logger.error(f"Error parsing {json_file}: {e}")

    logger.info(f"Syncing model {model_id} (Name: {name}, Alg: {algorithm})")

    # Create CustomMLModel
    db_model = models.CustomMLModel(
        id=model_id,
        name=f"{name} ({algorithm})",
        model_type=algorithm,
        user_id=user.id,
        active_version_id=None
    )
    db.add(db_model)
    db.commit()

    # Create ModelVersion
    version_id = f"v1.0-{model_id}"
    db_version = models.ModelVersion(
        id=version_id,
        model_id=model_id,
        version=1.0,
        description="Auto-synced from filesystem",
        file_path=model_file,
        metadata_path=json_file,
        status=models.ModelStatus.READY,
        accuracy=accuracy,
        f1_score=f1_score,
        latency=latency,
        explainability=explainability
    )
    db.add(db_version)
    db.commit()

    # Update active version
    db_model.active_version_id = version_id
    db.commit()
    db.refresh(db_model)
    return db_model

def sync_models():
    if not os.path.exists(UPLOAD_DIR):
        logger.info(f"Directory {UPLOAD_DIR} does not exist. Nothing to sync.")
        return

    db = SessionLocal()
    try:
        user = db.query(models.User).first()
        if not user:
            logger.warning("No users found in database. Cannot assign models to a user. Skipping sync.")
            return

        for entry in os.listdir(UPLOAD_DIR):
            dir_path = os.path.join(UPLOAD_DIR, entry)
            sync_directory(dir_path, db, user)

        logger.info("Sync complete.")
    except Exception as e:
        logger.error(f"Sync failed: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    sync_models()
