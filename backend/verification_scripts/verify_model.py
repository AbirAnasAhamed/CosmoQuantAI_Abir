import os
import joblib
import glob
from pprint import pprint
import lightgbm as lgb

MODEL_DIR = "app/models/saved" # guessing directory, let's see

# Find most recent model file
if not os.path.exists(MODEL_DIR):
    print(f"Directory {MODEL_DIR} not found. Searching for model files...")
    # fallback search
    import subprocess
    result = subprocess.run(['find', '.', '-name', '*.pkl'], stdout=subprocess.PIPE, text=True)
    print(result.stdout)
    files = [f for f in result.stdout.split('\n') if f]
else:
    files = glob.glob(f"{MODEL_DIR}/*.pkl")

if not files:
    print("No .pkl files found.")
    exit(1)

files.sort(key=os.path.getctime, reverse=True)
latest_model_file = files[0]
print(f"Loading {latest_model_file}...")

model = joblib.load(latest_model_file)

print(f"Model type: {type(model).__name__}")

if type(model).__name__ in ['LGBMClassifier', 'LGBMRegressor']:
    try:
        tree_info = model.booster_.dump_model()['tree_info'][0]['tree_structure']
        print("Tree Structure for tree 0:")
        pprint(tree_info)
    except Exception as e:
        print(f"Error extracting tree info: {e}")
        
    print(f"\nModel params: {model.get_params()}")
