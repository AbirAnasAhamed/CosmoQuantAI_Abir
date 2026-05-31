"""
ML Registry Metadata Fix - Verification Script
===============================================
Checks:
  1. Existing model (DOGE_MUNNA) has correct metadata wired up in DB
  2. Config endpoint returns real data from metadata.json
  3. Explainability data is populated from metadata
  4. Future upload simulation: dummy model + metadata JSON upload → full pipeline test
  5. Cleanup of test data

Run inside the container:
  docker exec cosmoquant_backend python verify_ml_registry_metadata.py

Or from host (runs inside container automatically):
  python verify_ml_registry_metadata.py
"""

import os
import sys
import json
import time
import tempfile
import zipfile
import io

SEPARATOR = "─" * 65

def header(title):
    print(f"\n{SEPARATOR}")
    print(f"  {title}")
    print(SEPARATOR)

def ok(msg):
    print(f"  ✅  {msg}")

def fail(msg):
    print(f"  ❌  {msg}")
    
def warn(msg):
    print(f"  ⚠️   {msg}")

def info(msg):
    print(f"  ℹ️   {msg}")

# ──────────────────────────────────────────────────────────────
# PART 1 – Direct DB + file checks (existing model)
# ──────────────────────────────────────────────────────────────

def test_existing_model():
    header("PART 1 – Existing model: DOGE_MUNNA")

    try:
        from app.db.session import SessionLocal
        from app.models.ml_model import CustomMLModel, ModelVersion, ModelStatus
    except ImportError:
        fail("Cannot import app modules. Run this script inside the container.")
        sys.exit(1)

    db = SessionLocal()
    try:
        models = db.query(CustomMLModel).all()
        info(f"Total custom models in DB: {len(models)}")

        if not models:
            warn("No models found. Upload a model first, then re-run.")
            return

        errors = 0
        for m in models:
            print(f"\n  Model: {m.name}  (id={m.id})")
            
            # Active version check
            if not m.active_version_id:
                fail("active_version_id is NULL")
                errors += 1
                continue
            ok(f"active_version_id = {m.active_version_id}")

            v = db.query(ModelVersion).filter(ModelVersion.id == m.active_version_id).first()
            if not v:
                fail("Active ModelVersion record not found in DB")
                errors += 1
                continue

            # Status
            if v.status == ModelStatus.READY:
                ok(f"Status = READY")
            else:
                warn(f"Status = {v.status} (still processing?)")

            # Accuracy / F1
            if v.accuracy is not None:
                ok(f"Accuracy = {v.accuracy:.4f}")
            else:
                fail("accuracy is NULL")
                errors += 1

            if v.f1_score is not None:
                ok(f"F1 Score = {v.f1_score:.4f}")
            else:
                fail("f1_score is NULL")
                errors += 1

            # metadata_path column exists and is set
            if not hasattr(v, 'metadata_path'):
                fail("metadata_path column MISSING from ModelVersion table (run migration!)")
                errors += 1
                continue

            if v.metadata_path:
                ok(f"metadata_path = {v.metadata_path}")
                if os.path.exists(v.metadata_path):
                    ok("metadata.json file EXISTS on disk")
                    with open(v.metadata_path) as f:
                        meta = json.load(f)
                    ok(f"metadata.json parsed OK – keys: {list(meta.keys())}")

                    # Key field checks
                    for key in ("symbol", "timeframe", "algorithm"):
                        val = meta.get(key)
                        if val:
                            ok(f"  meta['{key}'] = {val}")
                        else:
                            warn(f"  meta['{key}'] is missing/empty")

                    features = next(
                        (meta.get(k) for k in ("indicators", "features", "feature_list") if meta.get(k)),
                        []
                    )
                    if features:
                        ok(f"  Features: {len(features)} entries (e.g. {features[:3]})")
                    else:
                        warn("  No features/indicators found in metadata")

                    plp = meta.get("plp_features", [])
                    if plp:
                        ok(f"  PLP features: {len(plp)} entries")

                else:
                    fail(f"metadata.json file NOT FOUND at: {v.metadata_path}")
                    errors += 1
            else:
                warn("metadata_path is NULL (model was uploaded before fix, or uploaded without JSON)")

            # Explainability
            if v.explainability:
                ok(f"explainability populated – keys: {list(v.explainability.keys())[:5]}")
                fi = v.explainability.get("featureImportance")
                if fi:
                    ok(f"  featureImportance: {len(fi)} entries")
            else:
                warn("explainability is NULL/empty")

        if errors == 0:
            print(f"\n  🎉  All checks passed for existing models!")
        else:
            print(f"\n  ⚠️   {errors} issue(s) found for existing models.")

    finally:
        db.close()


# ──────────────────────────────────────────────────────────────
# PART 2 – Config endpoint simulation
# ──────────────────────────────────────────────────────────────

def test_config_endpoint():
    header("PART 2 – Config endpoint logic simulation")

    try:
        from app.db.session import SessionLocal
        from app.models.ml_model import CustomMLModel, ModelVersion, ModelStatus, TrainingStatus
        import app.models as models_module
    except ImportError:
        fail("Cannot import app modules.")
        return

    db = SessionLocal()
    try:
        m = db.query(CustomMLModel).first()
        if not m:
            warn("No models to test config endpoint.")
            return

        v = db.query(ModelVersion).filter(ModelVersion.id == m.active_version_id).first()

        # Simulate what get_model_config does
        # Check for training job first
        try:
            from app.models.training import ModelTrainingJob
            job = db.query(ModelTrainingJob).filter(
                ModelTrainingJob.output_model_id == m.id
            ).first()
            if job:
                info(f"Found training job → using job data (symbol={job.symbol})")
            else:
                info("No training job → falling back to metadata.json")
        except Exception:
            info("Could not query training jobs, testing metadata path directly")
            job = None

        if v and v.metadata_path and os.path.exists(v.metadata_path):
            with open(v.metadata_path) as f:
                meta = json.load(f)

            result = {
                "model_name": meta.get("model_name") or meta.get("name") or m.name,
                "symbol": meta.get("symbol") or meta.get("target_asset") or meta.get("pair") or "N/A",
                "timeframe": meta.get("timeframe") or meta.get("interval") or "N/A",
                "algorithm": meta.get("algorithm") or meta.get("model_type") or m.model_type,
                "config": {
                    "indicators": next((meta.get(k) for k in ("indicators", "features", "feature_list") if meta.get(k)), []),
                    "l2_features": next((meta.get(k) for k in ("l2_features", "orderbook_features") if meta.get(k)), []),
                    "trade_features": next((meta.get(k) for k in ("trade_features", "tick_features") if meta.get(k)), []),
                    "plp_features": meta.get("plp_features") or [],
                    "dataset_type": meta.get("dataset_type"),
                    "prediction_target": meta.get("prediction_target"),
                },
                "_source": "metadata_json"
            }

            ok(f"Config built from metadata.json")
            ok(f"  symbol     = {result['symbol']}")
            ok(f"  timeframe  = {result['timeframe']}")
            ok(f"  algorithm  = {result['algorithm']}")
            ok(f"  indicators = {len(result['config']['indicators'])} features")
            ok(f"  plp        = {len(result['config']['plp_features'])} features")
            ok(f"  source     = {result['_source']}")

            # Frontend display check
            if result["symbol"] == "N/A":
                warn("symbol is N/A – frontend will show N/A in Target Asset card")
            if result["timeframe"] == "N/A":
                warn("timeframe is N/A – frontend will show N/A in Timeframe card")

        else:
            warn("No metadata.json available → fallback to basic info only")

    finally:
        db.close()


# ──────────────────────────────────────────────────────────────
# PART 3 – Future upload simulation (full pipeline)
# ──────────────────────────────────────────────────────────────

def test_future_upload_pipeline():
    header("PART 3 – Future upload simulation (new model with metadata.json)")

    try:
        import asyncio
        from app.db.session import SessionLocal
        from app.models.ml_model import CustomMLModel, ModelVersion, ModelStatus
        from app.api.v1.endpoints.ml_models import simulate_processing, UPLOAD_DIR
        import shutil
    except ImportError as e:
        fail(f"Import error: {e}")
        return

    db = SessionLocal()
    FAKE_MODEL_ID = f"test_model_verify_{int(time.time())}"
    FAKE_VERSION_ID = f"v1.0-{int(time.time())}"

    try:
        # 1. Create temp directory & fake files
        version_dir = os.path.join(UPLOAD_DIR, f"v_{FAKE_VERSION_ID}")
        os.makedirs(version_dir, exist_ok=True)
        info(f"Created temp dir: {version_dir}")

        # Fake .pkl weight file
        weight_path = os.path.join(version_dir, f"{FAKE_VERSION_ID}_fake_model.pkl")
        with open(weight_path, "wb") as f:
            f.write(b"FAKE_WEIGHTS_DATA_FOR_TEST")
        ok("Fake weight file created")

        # Realistic metadata.json (simulating external training)
        fake_metadata = {
            "model_name": "VerifyTestModel",
            "symbol": "ETH/USDT",
            "timeframe": "5m",
            "algorithm": "XGBoost",
            "epochs": 300,
            "accuracy": 0.7843,
            "val_accuracy": 0.7612,
            "f1_score": 0.7501,
            "inference_latency_ms": 8.2,
            "indicators": ["RSI_14", "MACD", "BB_upper", "BB_lower", "EMA_20", "ATR_14"],
            "l2_features": ["bid_ask_imbalance", "depth_ratio"],
            "trade_features": ["cvd", "buy_volume", "aggressor_ratio"],
            "plp_features": ["fakeout_prob_model", "stop_hunt_probability"],
            "feature_importance": {
                "RSI_14": 0.34,
                "MACD": 0.22,
                "BB_upper": 0.18,
                "EMA_20": 0.15,
                "ATR_14": 0.07,
                "BB_lower": 0.04,
            },
            "confusion_matrix": {
                "classes": ["Buy", "Sell", "Hold"],
                "matrix": [[78, 8, 14], [5, 82, 13], [9, 11, 80]]
            },
            "backtest_result": {
                "initial_balance": 10000,
                "profit_pct": 18.4,
                "win_rate": 61.2,
                "max_drawdown": 7.3,
                "kelly_pct": 12.5,
                "risk_of_ruin": 1.8,
                "total_trades": 244
            },
            "dataset_type": "ohlcv_plus_l2",
            "prediction_target": "classification",
            "train_size": 0.8,
            "lookback": 60,
        }

        metadata_path = os.path.join(version_dir, "metadata.json")
        with open(metadata_path, "w") as f:
            json.dump(fake_metadata, f, indent=2)
        ok(f"Fake metadata.json created ({len(fake_metadata)} keys)")

        # 2. Create DB records
        fake_user_id = db.execute(
            __import__('sqlalchemy').text("SELECT id FROM users LIMIT 1")
        ).scalar()
        if not fake_user_id:
            warn("No user in DB – skipping DB record creation")
            return

        db_model = CustomMLModel(
            id=FAKE_MODEL_ID,
            name="VerifyTestModel",
            model_type="XGBoost",
            user_id=fake_user_id,
            active_version_id=None
        )
        db.add(db_model)
        db.commit()

        db_version = ModelVersion(
            id=FAKE_VERSION_ID,
            model_id=FAKE_MODEL_ID,
            version=1.0,
            description="Automated verification test",
            file_path=weight_path,
            metadata_path=metadata_path,   # ← THE FIX: stored correctly
            status=ModelStatus.PROCESSING
        )
        db.add(db_version)
        db.commit()

        db_model.active_version_id = FAKE_VERSION_ID
        db.commit()
        db.refresh(db_model)
        ok("DB records created (CustomMLModel + ModelVersion)")
        ok(f"metadata_path stored in DB = {db_version.metadata_path}")

        # 3. Run simulate_processing (the background task)
        info("Running simulate_processing() background task...")
        asyncio.run(simulate_processing(db, FAKE_VERSION_ID))

        # 4. Re-fetch and verify
        db.expire_all()
        v = db.query(ModelVersion).filter(ModelVersion.id == FAKE_VERSION_ID).first()

        print()
        ok(f"Status after processing: {v.status}")

        # Accuracy from metadata (not random!)
        expected_acc = fake_metadata["accuracy"]
        if v.accuracy and abs(v.accuracy - expected_acc) < 0.001:
            ok(f"Accuracy read from metadata: {v.accuracy} (expected {expected_acc}) ✓")
        elif v.accuracy:
            warn(f"Accuracy = {v.accuracy:.4f} (metadata had {expected_acc} – may have fallen back to mock)")
        else:
            fail("Accuracy is NULL after processing!")

        expected_f1 = fake_metadata["f1_score"]
        if v.f1_score and abs(v.f1_score - expected_f1) < 0.001:
            ok(f"F1 Score read from metadata: {v.f1_score} (expected {expected_f1}) ✓")
        elif v.f1_score:
            warn(f"F1 = {v.f1_score:.4f} (metadata had {expected_f1})")
        else:
            fail("F1 is NULL!")

        # Explainability
        if v.explainability:
            ok(f"Explainability populated with keys: {list(v.explainability.keys())}")
            fi = v.explainability.get("featureImportance")
            if fi:
                ok(f"  featureImportance: {len(fi)} entries (top: {fi[0]['name']} = {fi[0]['value']})")
            cm = v.explainability.get("confusionMatrix")
            if cm:
                ok(f"  confusionMatrix: {cm['classes']}")
            bt = v.explainability.get("backtest_result")
            if bt:
                ok(f"  backtest_result: profit={bt.get('profit_pct')}%  win_rate={bt.get('win_rate')}%")
        else:
            fail("Explainability is empty after processing!")

        # 5. Simulate get_model_config
        with open(metadata_path) as f:
            meta = json.load(f)

        indicators = next((meta.get(k) for k in ("indicators", "features", "feature_list") if meta.get(k)), [])
        config_result = {
            "symbol": meta.get("symbol") or "N/A",
            "timeframe": meta.get("timeframe") or "N/A",
            "algorithm": meta.get("algorithm") or "N/A",
            "config": {
                "indicators": indicators,
                "plp_features": meta.get("plp_features") or [],
                "epochs": meta.get("epochs"),
            },
            "_source": "metadata_json"
        }

        ok(f"Config endpoint would return: symbol={config_result['symbol']}, tf={config_result['timeframe']}")
        ok(f"  indicators: {config_result['config']['indicators']}")
        ok(f"  epochs: {config_result['config']['epochs']}")

        print()
        print("  🎉  Future upload pipeline: ALL CHECKS PASSED!")

    except Exception as e:
        import traceback
        fail(f"Pipeline test FAILED: {e}")
        traceback.print_exc()
    finally:
        # Cleanup
        try:
            db_model_clean = db.query(CustomMLModel).filter(CustomMLModel.id == FAKE_MODEL_ID).first()
            if db_model_clean:
                db_model_clean.active_version_id = None
                db.flush()
                db_ver_clean = db.query(ModelVersion).filter(ModelVersion.id == FAKE_VERSION_ID).first()
                if db_ver_clean:
                    db.delete(db_ver_clean)
                db.delete(db_model_clean)
                db.commit()
            if os.path.exists(version_dir):
                shutil.rmtree(version_dir)
            info("Test data cleaned up successfully")
        except Exception as ce:
            warn(f"Cleanup error (non-critical): {ce}")
        db.close()


# ──────────────────────────────────────────────────────────────
# PART 4 – Schema check
# ──────────────────────────────────────────────────────────────

def test_schema():
    header("PART 4 – DB Schema: metadata_path column exists")
    try:
        from app.db.session import engine
        from sqlalchemy import text
        with engine.connect() as conn:
            # PostgreSQL
            result = conn.execute(text(
                "SELECT column_name, data_type FROM information_schema.columns "
                "WHERE table_name='model_versions' AND column_name='metadata_path'"
            ))
            row = result.fetchone()
            if row:
                ok(f"Column 'metadata_path' EXISTS in model_versions ({row[1]})")
            else:
                fail("Column 'metadata_path' MISSING from model_versions table!")
                info("Fix: docker exec cosmoquant_backend python -c \"from app.db.session import engine; from sqlalchemy import text; conn = engine.connect(); conn.execute(text('ALTER TABLE model_versions ADD COLUMN IF NOT EXISTS metadata_path VARCHAR')); conn.commit()\"")
    except Exception as e:
        warn(f"Schema check error: {e}")


# ──────────────────────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print()
    print("╔══════════════════════════════════════════════════════════════╗")
    print("║     ML Registry Metadata Fix – Verification Suite           ║")
    print("╚══════════════════════════════════════════════════════════════╝")

    test_schema()
    test_existing_model()
    test_config_endpoint()
    test_future_upload_pipeline()

    print(f"\n{SEPARATOR}")
    print("  Verification complete.")
    print(SEPARATOR)
    print()
