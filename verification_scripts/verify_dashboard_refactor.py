import os
import json

def verify_refactor():
    print("Verifying Dashboard Refactor...")
    
    # Get current working directory
    cwd = os.getcwd()
    print(f"Current working directory: {cwd}")

    # 1. Check package.json
    # Check if we are in root or frontend
    package_json_path = os.path.join(cwd, "frontend", "package.json")
    if not os.path.exists(package_json_path):
        package_json_path = os.path.join(cwd, "package.json")
    
    if os.path.exists(package_json_path):
        try:
            with open(package_json_path, 'r') as f:
                data = json.load(f)
                deps = data.get('dependencies', {})
                if 'react-grid-layout' in deps:
                    print("[PASS] react-grid-layout found in package.json")
                else:
                    print("[FAIL] react-grid-layout NOT found in package.json")
                    return False
        except Exception as e:
            print(f"[FAIL] Error reading package.json: {e}")
            return False
    else:
        print(f"[FAIL] package.json not found. Searched at: {package_json_path}")
        return False

    # 2. Check SentimentEngine.tsx
    engine_path = os.path.join(cwd, "frontend", "src", "pages", "app", "SentimentEngine.tsx")
    if not os.path.exists(engine_path):
        engine_path = os.path.join(cwd, "src", "pages", "app", "SentimentEngine.tsx")
        
    if os.path.exists(engine_path):
        try:
            with open(engine_path, 'r', encoding='utf-8') as f:
                content = f.read()
                
                # Check for ResponsiveGridLayout
                if "<ResponsiveGridLayout" in content or "<GridLayout" in content:
                     print("[PASS] <ResponsiveGridLayout> or <GridLayout> component found")
                else:
                     print("[FAIL] Grid Layout component NOT found in SentimentEngine.tsx")
                     return False

                # Check for keys using string searching
                required_keys = ["metrics", "header", "priceChart", "divergenceChart", "heatmap", "voting", "narratives", "whale", "news"]
                found_all = True
                for key in required_keys:
                    # Look for key="value" or key='value' or key={"value"}
                    if f'key="{key}"' in content or f"key='{key}'" in content or f'key={{"{key}"}}' in content:
                        print(f"[PASS] Widget key '{key}' found")
                    else:
                        print(f"[FAIL] Widget key '{key}' NOT found")
                        found_all = False
                
                if not found_all:
                    return False
                    
        except Exception as e:
            print(f"[FAIL] Error reading SentimentEngine.tsx: {e}")
            return False
    else:
        print(f"[FAIL] SentimentEngine.tsx not found. Searched at: {engine_path}")
        return False

    print("\nSUCCESS: Dashboard refactor verified!")
    return True

if __name__ == "__main__":
    verify_refactor()
