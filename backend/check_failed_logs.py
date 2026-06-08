import os
import sys

# Add app to path
sys.path.append("/app")

from app.db.session import SessionLocal
from app.models.model_training import ModelTrainingJob

def check_failed_logs():
    db = SessionLocal()
    job = db.query(ModelTrainingJob).filter(ModelTrainingJob.id == "train_1780914165288").first()
    if job:
        print(f"Job ID: {job.id}, Status: {job.status}, Error: {job.error_message}")
        print("Logs:")
        if job.logs:
            for log in job.logs:
                print(log)
        else:
            print("No logs.")
    else:
        print("Job not found.")
    db.close()

if __name__ == "__main__":
    check_failed_logs()
