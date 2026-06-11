import sys
import os

# Ensure the backend directory is in the path
sys.path.append("/app")

from app.db.session import SessionLocal
from app.models import ModelTrainingJob

def check_latest_job():
    db = SessionLocal()
    try:
        job = db.query(ModelTrainingJob).order_by(ModelTrainingJob.id.desc()).first()
        if not job:
            print("No jobs found.")
            return

        print(f"Job ID: {job.id}")
        # Check specific advanced features
        config = job.config or {}
        print(f"Dataset Type: {config.get('dataset_type')}")
        print(f"Config:")
        
        # Check specific advanced features
        config = job.config or {}
        print(f" - Target Rows: {config.get('target_rows')}")
        print(f" - Resample L2: {config.get('resample_l2')}")
        print(f" - Data Augmentation: {config.get('augmentation_strategy')} (Factor: {config.get('augmentation_factor')})")
        print(f" - Purged CV: {config.get('split_method')} (Length: {config.get('purge_length')})")
        print(f" - Fractional Diff: {config.get('fractional_diff')} (d: {config.get('fractional_d_value')})")
        print(f" - Clustered Importance: {config.get('use_clustered_importance')}")
        print(f" - Adversarial Training: {config.get('enable_adversarial')} (Epsilon: {config.get('adversarial_epsilon')})")
        print(f" - EWC (Continual Learning): {config.get('enable_ewc')} (Lambda: {config.get('ewc_lambda')})")
        
        print("\n--- Last 20 Logs ---")
        logs = job.logs.split('\n') if job.logs else []
        for log in logs[-20:]:
            print(log)
            
    finally:
        db.close()

if __name__ == "__main__":
    check_latest_job()
