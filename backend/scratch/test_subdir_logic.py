import os
import sys
import shutil

# Add the parent directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.db.session import SessionLocal
from app import models
from fastapi.testclient import TestClient
from app.main import app
from app.api import deps

# Setup mock user and db
def override_get_db():
    try:
        db = SessionLocal()
        yield db
    finally:
        db.close()

def get_test_user(db):
    user = db.query(models.User).filter(models.User.email == "test_subdir@example.com").first()
    if not user:
        user = models.User(email="test_subdir@example.com", full_name="Test Subdir", hashed_password="fake", is_active=True)
        db.add(user)
        db.commit()
        db.refresh(user)
    return user

db = SessionLocal()
test_user = get_test_user(db)
db.close()

def override_get_current_user():
    return test_user

app.dependency_overrides[deps.get_db] = override_get_db
app.dependency_overrides[deps.get_current_user] = override_get_current_user

client = TestClient(app)

def verify_subdir_logic():
    print("--- Verifying Model Subdirectory Logic ---")
    UPLOAD_DIR = "uploads/models"
    
    # 1. Test Manual Upload
    print("\n1. Testing manual upload...")
    with open("test_subdir.pkl", "wb") as f:
        f.write(b"test data")
        
    with open("test_subdir.pkl", "rb") as f:
        response = client.post(
            "/api/v1/ml-models/",
            data={
                "name": "Test Subdir Model",
                "model_type": "Random Forest",
                "version": 1.0,
                "description": "Subdir test"
            },
            files={"file": ("test_subdir.pkl", f, "application/octet-stream")}
        )
    
    assert response.status_code == 200
    model_data = response.json()
    model_id = model_data["id"]
    version_id = model_data["active_version_id"]
    
    # Check if folder exists
    version_dir = os.path.join(UPLOAD_DIR, f"v_{version_id}")
    file_path = os.path.join(version_dir, f"{version_id}_test_subdir.pkl")
    
    print(f"Checking if folder exists: {version_dir} -> {os.path.exists(version_dir)}")
    print(f"Checking if file exists: {file_path} -> {os.path.exists(file_path)}")
    
    assert os.path.exists(version_dir)
    assert os.path.exists(file_path)
    
    # 2. Test Deletion
    print("\n2. Testing deletion...")
    response = client.delete(f"/api/v1/ml-models/{model_id}")
    assert response.status_code == 200
    
    print(f"Checking if folder was deleted: {version_dir} -> {not os.path.exists(version_dir)}")
    assert not os.path.exists(version_dir)
    
    # Clean up
    if os.path.exists("test_subdir.pkl"):
        os.remove("test_subdir.pkl")
        
    print("\n--- Subdirectory Logic Verification Success! ---")

if __name__ == "__main__":
    verify_subdir_logic()
