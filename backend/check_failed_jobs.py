import os
import sys

# Add app to path
sys.path.append("/app")

from app.db.session import SessionLocal
from app.models.model_training import ModelTrainingJob

def check_failed():
    db = SessionLocal()
    failed_jobs = db.query(ModelTrainingJob).filter(ModelTrainingJob.status == "FAILED").order_by(ModelTrainingJob.id.desc()).limit(5).all()
    for job in failed_jobs:
        print(f"Job ID: {job.id}, Algorithm: {job.algorithm}, Error: {job.error_message}")
    db.close()

if __name__ == "__main__":
    check_failed()
