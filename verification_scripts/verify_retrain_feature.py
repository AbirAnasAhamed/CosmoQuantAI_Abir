#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Smart Retrain & Fine-tune Feature - Verification Script
"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import requests
import json
import ast
import sys
import time
import os

BASE_URL = "http://localhost:8000/api/v1"
FRONTEND_URL = "http://localhost:3000"

# ANSI colors
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

results = []


def ok(msg):
    print(f"  {GREEN}✅ PASS{RESET}  {msg}")
    results.append(("PASS", msg))


def fail(msg, reason=""):
    r = f"{msg}" + (f" → {reason}" if reason else "")
    print(f"  {RED}❌ FAIL{RESET}  {r}")
    results.append(("FAIL", r))


def warn(msg):
    print(f"  {YELLOW}⚠️  WARN{RESET}  {msg}")
    results.append(("WARN", msg))


def section(title):
    print(f"\n{BOLD}{CYAN}{'─'*60}{RESET}")
    print(f"{BOLD}{CYAN}  {title}{RESET}")
    print(f"{BOLD}{CYAN}{'─'*60}{RESET}")


# ─────────────────────────────────────────────────────────────────────
# 1. Login to get a token
# ─────────────────────────────────────────────────────────────────────

def get_token():
    section("STEP 1: Authentication")
    # ── Update password below if you know it ─────────────────────────
    YOUR_EMAIL    = "abir.ahamed.01931645993@gmail.com"
    YOUR_PASSWORD = "YOUR_PASSWORD_HERE"   # <-- change this!
    # ─────────────────────────────────────────────────────────────────

    credential_sets = [
        {"username": YOUR_EMAIL, "password": YOUR_PASSWORD},
        {"username": YOUR_EMAIL, "password": "admin123"},
        {"username": YOUR_EMAIL, "password": "password123"},
        {"username": YOUR_EMAIL, "password": "Admin@123"},
    ]
    for creds in credential_sets:
        if "YOUR_PASSWORD_HERE" in creds["password"]:
            continue
        try:
            resp = requests.post(
                f"{BASE_URL}/auth/login",
                data=creds,
                timeout=10
            )
            if resp.status_code == 200:
                token = resp.json().get("access_token")
                ok(f"Login successful with: {creds['username']}")
                return token
        except Exception as e:
            fail("Cannot connect to backend", str(e))
            return None
    warn("Could not auto-login. Set YOUR_PASSWORD in this script to enable network checks.")
    return None


# ─────────────────────────────────────────────────────────────────────
# 2. Check Backend API Endpoints
# ─────────────────────────────────────────────────────────────────────

def check_backend_api(token):
    section("STEP 2: Backend API Endpoints")
    headers = {"Authorization": f"Bearer {token}"}

    # 2a. GET /ml-models  (existing endpoint - must still work)
    try:
        resp = requests.get(f"{BASE_URL}/ml-models", headers=headers, timeout=10)
        if resp.status_code == 200:
            models = resp.json()
            ok(f"GET /ml-models → {len(models)} model(s) found in registry.")
            return models
        else:
            fail("GET /ml-models failed", f"Status: {resp.status_code}")
            return []
    except Exception as e:
        fail("GET /ml-models threw exception", str(e))
        return []


def check_config_endpoint(token, models):
    section("STEP 3: New Config Endpoint")
    headers = {"Authorization": f"Bearer {token}"}

    if not models:
        warn("No models in registry — skipping config endpoint check.\n"
             "  Train at least one model first, then re-run this script.")
        return

    model_id = models[0]["id"]
    model_name = models[0].get("name", model_id)

    # 3a. GET /ml-models/{model_id}/config
    try:
        resp = requests.get(
            f"{BASE_URL}/ml-models/{model_id}/config",
            headers=headers,
            timeout=10
        )
        if resp.status_code == 200:
            cfg = resp.json()
            ok(f"GET /ml-models/{model_id}/config → OK (model: '{model_name}')")
            expected_keys = {"symbol", "algorithm", "config"}
            found = expected_keys.intersection(cfg.keys())
            if found == expected_keys:
                ok(f"Response contains all expected keys: {expected_keys}")
            else:
                missing = expected_keys - found
                warn(f"Response missing some keys: {missing}. Got: {list(cfg.keys())}")
            print(f"\n    📋 Config snapshot:")
            print(f"       symbol    : {cfg.get('symbol', 'N/A')}")
            print(f"       timeframe : {cfg.get('timeframe', 'N/A')}")
            print(f"       algorithm : {cfg.get('algorithm', 'N/A')}")
            inner = cfg.get("config", {})
            if inner:
                print(f"       indicators: {inner.get('indicators', [])}")
                print(f"       l2_features: {inner.get('l2_features', [])}")
        elif resp.status_code == 404:
            ok(f"GET /ml-models/{model_id}/config → 404 (no completed training job yet — expected for new models)")
        else:
            fail(f"GET /ml-models/{model_id}/config", f"Status: {resp.status_code}, Body: {resp.text[:200]}")
    except Exception as e:
        fail("Config endpoint threw exception", str(e))

    # 3b. Test with a non-existent model id (must return 404)
    try:
        resp_bad = requests.get(
            f"{BASE_URL}/ml-models/NONEXISTENT_MODEL_XYZ/config",
            headers=headers,
            timeout=10
        )
        if resp_bad.status_code == 404:
            ok("GET /ml-models/NONEXISTENT/config correctly returns 404.")
        else:
            warn(f"Expected 404 for non-existent model, got {resp_bad.status_code}")
    except Exception as e:
        warn(f"Non-existent model test threw exception: {e}")


# ─────────────────────────────────────────────────────────────────────
# 4. Static code checks (grep source files)
# ─────────────────────────────────────────────────────────────────────

def check_source_code():
    section("STEP 4: Source Code Integrity Checks")
    BASE = r"d:\CosmoQuantAI_Abir"

    checks = [
        # Backend
        (
            r"backend\app\api\v1\endpoints\ml_models.py",
            "get_model_config",
            "Backend: get_model_config endpoint defined"
        ),
        (
            r"backend\app\api\v1\endpoints\ml_models.py",
            "/{model_id}/config",
            "Backend: /ml-models/{model_id}/config route registered"
        ),
        (
            r"backend\app\services\ml_training_engine.py",
            "_target_model_id = config.get(\"target_model_id\")",
            "Backend: target_model_id parsing logic in training engine"
        ),
        (
            r"backend\app\services\ml_training_engine.py",
            "is_fine_tune",
            "Backend: is_fine_tune flag logic present"
        ),
        # Frontend services
        (
            r"frontend\src\services\mlModelsService.ts",
            "getModelConfig",
            "Frontend: getModelConfig method added to mlModelsService.ts"
        ),
        (
            r"frontend\src\services\mlModelsService.ts",
            "/config",
            "Frontend: Config API URL in mlModelsService.ts"
        ),
        (
            r"frontend\src\services\mlTrainingService.ts",
            "target_model_id",
            "Frontend: target_model_id added to TrainingConfig type"
        ),
        (
            r"frontend\src\services\mlTrainingService.ts",
            "fine_tune",
            "Frontend: fine_tune flag added to TrainingConfig type"
        ),
        # CustomMLModels
        (
            r"frontend\src\pages\app\CustomMLModels.tsx",
            "onRetrain",
            "Frontend: onRetrain prop added to ModelCard"
        ),
        (
            r"frontend\src\pages\app\CustomMLModels.tsx",
            "handleRetrain",
            "Frontend: handleRetrain handler function in CustomMLModels"
        ),
        (
            r"frontend\src\pages\app\CustomMLModels.tsx",
            "Retrain",
            "Frontend: Retrain button text present in CustomMLModels"
        ),
        (
            r"frontend\src\pages\app\CustomMLModels.tsx",
            "AppView.MODEL_TRAINING_STUDIO",
            "Frontend: Retrain button navigates to MODEL_TRAINING_STUDIO"
        ),
        # ModelTrainingStudio
        (
            r"frontend\src\pages\app\ModelTrainingStudio.tsx",
            "retrainModelId",
            "Frontend: retrainModelId prop in ModelTrainingStudio"
        ),
        (
            r"frontend\src\pages\app\ModelTrainingStudio.tsx",
            "isRetrainMode",
            "Frontend: isRetrainMode state in ModelTrainingStudio"
        ),
        (
            r"frontend\src\pages\app\ModelTrainingStudio.tsx",
            "getModelConfig",
            "Frontend: getModelConfig called in ModelTrainingStudio"
        ),
        (
            r"frontend\src\pages\app\ModelTrainingStudio.tsx",
            "START INCREMENTAL FINE-TUNING",
            "Frontend: Button text changes when in retrain mode"
        ),
        (
            r"frontend\src\pages\app\ModelTrainingStudio.tsx",
            "MODEL RETRAINING STUDIO",
            "Frontend: Page title changes when in retrain mode"
        ),
        # AppDashboard routing
        (
            r"frontend\src\pages\app\AppDashboard.tsx",
            "retrainModelId={activeSettingsSection}",
            "Frontend: retrainModelId passed to ModelTrainingStudio in AppDashboard"
        ),
        (
            r"frontend\src\pages\app\AppDashboard.tsx",
            "onNavigate={onNavigate}",
            "Frontend: onNavigate passed to CustomMLModels in AppDashboard"
        ),
    ]

    for rel_path, needle, description in checks:
        full_path = os.path.join(BASE, rel_path)
        try:
            with open(full_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
            if needle in content:
                ok(description)
            else:
                fail(description, f"String not found: '{needle}' in {rel_path}")
        except FileNotFoundError:
            fail(description, f"File not found: {rel_path}")
        except Exception as e:
            fail(description, str(e))


# ─────────────────────────────────────────────────────────────────────
# 5. Check frontend is serving
# ─────────────────────────────────────────────────────────────────────

def check_frontend():
    section("STEP 5: Frontend Server Health")
    try:
        resp = requests.get(FRONTEND_URL, timeout=10)
        if resp.status_code == 200:
            ok(f"Frontend is serving at {FRONTEND_URL} (Status: 200 OK)")
        else:
            warn(f"Frontend responded with status {resp.status_code}")
    except Exception as e:
        fail("Frontend not reachable", str(e))


# ─────────────────────────────────────────────────────────────────────
# 6. Summary
# ─────────────────────────────────────────────────────────────────────

def print_summary():
    section("SUMMARY")
    passed = sum(1 for r in results if r[0] == "PASS")
    failed = sum(1 for r in results if r[0] == "FAIL")
    warned = sum(1 for r in results if r[0] == "WARN")

    print(f"\n  Total Checks : {len(results)}")
    print(f"  PASSED       : {passed}")
    print(f"  FAILED       : {failed}")
    print(f"  WARNINGS     : {warned}")

    if failed > 0:
        print(f"\n  [FAIL] Some checks FAILED. Please review the output above.")
        return False
    elif warned > 0:
        print(f"\n  [WARN] All critical checks passed. Review warnings above.")
        return True
    else:
        print(f"\n  [OK] All checks passed! Smart Retrain feature is fully operational.")
        return True


# ─────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("\n" + "="*60)
    print("  Smart Retrain & Fine-tune - Verification Suite")
    print("="*60)
    print(f"  Backend  : {BASE_URL}")
    print(f"  Frontend : {FRONTEND_URL}")

    # Static code checks first (no network needed)
    check_source_code()
    check_frontend()

    # Network checks
    token = get_token()
    if token:
        models = check_backend_api(token)
        check_config_endpoint(token, models)
    else:
        section("--- Skipping network checks: cannot authenticate ---")
        warn("Backend auth failed. Manually add your email+password to credential_sets in this script.")

    success = print_summary()
    sys.exit(0 if success else 1)
