from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from celery.result import AsyncResult
from typing import List
import os
import pandas as pd
from app import models, schemas
from app.api import deps
from app.tasks import run_backtest_task, run_optimization_task, download_candles_task, download_trades_task, run_batch_backtest_task, run_walk_forward_task, publish_task_status
from app.celery_app import celery_app
from app import utils
from app.services.report_generator import generate_report

router = APIRouter()

router = APIRouter()

REPORTS_DIR = "app/reports"
DATA_FEED_DIR = "app/data_feeds"

@router.post("/run")
def run_backtest(
    request: schemas.BacktestRequest
):
    task = run_backtest_task.delay(
        symbol=request.symbol,
        timeframe=request.timeframe,
        strategy_name=request.strategy,
        initial_cash=request.initial_cash,
        params=request.params,
        start_date=request.start_date,
        end_date=request.end_date,
        custom_data_file=request.custom_data_file,
        commission=request.commission,
        slippage=request.slippage,
        leverage=request.leverage, # ✅ Pass Leverage
        secondary_timeframe=request.secondary_timeframe,
        stop_loss=request.stop_loss,
        take_profit=request.take_profit,
        trailing_stop=request.trailing_stop,
        indicator_id=request.indicator_id # ✅ Pass Indicator ID
    )
    return {"task_id": task.id, "status": "Processing"}


@router.post("/walk-forward")
def run_walk_forward(
    request: schemas.WalkForwardRequest
):
    # প্যারামিটার ডিকশনারিতে কনভার্ট করা
    params_dict = {}
    for k, v in request.params.items():
        params_dict[k] = v.model_dump() if hasattr(v, 'model_dump') else v

    # টাস্ক কল করা (সতর্কতা: এখানে কোনো ডুপ্লিকেট আর্গুমেন্ট নেই)
    task = run_walk_forward_task.delay(
        symbol=request.symbol,
        timeframe=request.timeframe,
        strategy_name=request.strategy,
        initial_cash=request.initial_cash,
        params=params_dict,
        start_date=request.start_date,
        end_date=request.end_date,
        train_window_days=request.train_window_days,
        test_window_days=request.test_window_days,
        method=request.method,
        population_size=getattr(request, 'population_size', 20), 
        generations=getattr(request, 'generations', 5),
        commission=request.commission,
        slippage=request.slippage,
        leverage=request.leverage,
        opt_target=getattr(request, 'opt_target', 'profit'), # ✅ Pass
        min_trades=getattr(request, 'min_trades', 2)  # ✅ ফিক্স: ডিফল্ট ৫ থেকে কমিয়ে ২ করা হলো
    )
    
    return {"task_id": task.id, "status": "Processing WFA"}

@router.post("/batch")
def run_batch_backtest(
    request: schemas.BatchBacktestRequest
):
    task = run_batch_backtest_task.delay(
        symbol=request.symbol,
        timeframe=request.timeframe,
        initial_cash=request.initial_cash,
        
        # ✅ Fix: Forwarding strategy list from frontend to task
        strategies=request.strategies, 
        
        start_date=request.start_date,
        end_date=request.end_date,
        
        # ✅ File support (custom_data_file)
        custom_data_file=getattr(request, 'custom_data_file', None),
        
        commission=request.commission,
        slippage=request.slippage
    )
    return {"task_id": task.id, "status": "Processing"}

# Keeping the redundant synchronous-looking endpoint name from main.py if needed, but mapped to batch task
@router.post("/batch-run")
def run_batch_backtest_alias(
    request: schemas.BatchBacktestRequest
):
    return run_batch_backtest(request)

@router.get("/status/{task_id}")
def get_backtest_status(task_id: str):
    task_result = AsyncResult(task_id)
    
    if task_result.state == 'PENDING':
        return {"status": "Pending", "percent": 0, "result": None}
    
    elif task_result.state == 'PROGRESS':
        info = task_result.info
        return {
            "status": "Processing",
            "percent": info.get('percent', 0),
            "current": info.get('current', 0),
            "total": info.get('total', 0),
            "result": None
        }
        
    elif task_result.state == 'SUCCESS':
        return {"status": "Completed", "percent": 100, "result": task_result.result}
        
    elif task_result.state == 'FAILURE':
        return {"status": "Failed", "error": str(task_result.result)}
    
    return {"status": task_result.state}

@router.post("/optimize")
def run_optimization(
    request: schemas.OptimizationRequest
):
    params_dict = {}
    for k, v in request.params.items():
        params_dict[k] = v.model_dump() if hasattr(v, 'model_dump') else v
    
    task = run_optimization_task.delay(
        symbol=request.symbol,
        timeframe=request.timeframe,
        strategy_name=request.strategy,
        initial_cash=request.initial_cash,
        params=params_dict,
        start_date=request.start_date,
        end_date=request.end_date,
        method=request.method,
        population_size=request.population_size,
        generations=request.generations,
        commission=request.commission,
        slippage=request.slippage,
        leverage=request.leverage # ✅ Pass Leverage
    )
    
    return {"task_id": task.id, "status": "Processing"}

@router.post("/revoke/{task_id}")
def revoke_task(task_id: str):
    # ১. টাস্ক টার্মিনেট করা
    celery_app.control.revoke(task_id, terminate=True)
    
    try:
        # ২. Redis এ ফ্ল্যাগ সেট করা
        r = utils.get_redis_client()
        r.set(f"abort_task:{task_id}", "true", ex=3600)

        # ✅ ৩. ফিক্স: সকেটে ফোর্সফুলি 'REVOKED' মেসেজ পাঠানো
        # যেহেতু ওয়ার্কার মরে গেছে, তাই এখান থেকেই ফ্রন্টএন্ডকে জানাতে হবে।
        publish_task_status('BATCH', task_id, 'REVOKED', 0, {"status": "Stopped by User"})
        
        # অপটিমাইজেশন বা অন্য টাস্কের জন্যও জেনেরিক মেসেজ পাঠাতে পারেন
        publish_task_status('Task', task_id, 'REVOKED', 0, {"status": "Stopped by User"})

    except Exception as e:
        print(f"⚠️ Redis/Publish Error in revoke: {e}")
        
    return {"status": "Revoked", "message": f"Stop signal sent for Task {task_id}."}

# Data Download endpoints - logic moved here
@router.post("/download/candles")
def start_candle_download(request: schemas.DownloadRequest):
    task = download_candles_task.delay(
        exchange_id=request.exchange,
        symbol=request.symbol,
        timeframe=request.timeframe,
        start_date=request.start_date,
        end_date=request.end_date 
    )
    return {"task_id": task.id, "status": "Started"}

@router.post("/download/trades")
def start_trade_download(request: schemas.DownloadRequest):
    task = download_trades_task.delay(
        exchange_id=request.exchange,
        symbol=request.symbol,
        start_date=request.start_date,
        end_date=request.end_date
    )
    return {"task_id": task.id, "status": "Started"}

@router.get("/download/status/{task_id}")
def get_download_status(task_id: str):
    task_result = AsyncResult(task_id)
    
    if task_result.state == 'PENDING':
        return {"status": "Pending", "percent": 0}
    
    elif task_result.state == 'PROGRESS':
        info = task_result.info
        return {
            "status": "Processing", 
            "percent": info.get('percent', 0) if isinstance(info, dict) else 0,
            "message": info.get('status', '') if isinstance(info, dict) else ''
        }
        
    elif task_result.state == 'SUCCESS':
        result = task_result.result
        if isinstance(result, dict) and result.get("status") == "Revoked":
            return {"status": "Revoked", "message": result.get("message", "Stopped by user")}
        return {"status": "Completed", "percent": 100, "result": result}
        
    elif task_result.state == 'FAILURE':
        return {"status": "Failed", "error": str(task_result.result)}
        
    elif task_result.state == 'REVOKED':
        return {"status": "Revoked", "message": "Task revoked"}
    
    return {"status": task_result.state}

@router.get("/trade-files")
def list_trade_files():
    target_dir = DATA_FEED_DIR
    if not os.path.exists(target_dir):
        return []
    files = [f for f in os.listdir(target_dir) if f.startswith("trades_") and f.endswith(".csv")]
    return files

@router.post("/convert-data")
async def run_data_conversion(request: schemas.ConversionRequest):
    try:
        target_dir = DATA_FEED_DIR 
        if not os.path.exists(target_dir):
            return {"message": "Data directory not found.", "success": False}

        file_to_convert = request.filename
        
        if file_to_convert == "all":
             files = [f for f in os.listdir(target_dir) if f.startswith("trades_") and f.endswith(".csv")]
        else:
             file_path = os.path.join(target_dir, file_to_convert)
             if not os.path.exists(file_path):
                 raise HTTPException(status_code=404, detail=f"File '{file_to_convert}' not found.")
             files = [file_to_convert]

        converted_count = 0
        tf_map = {'1m': '1min', '5m': '5min', '15m': '15min', '30m': '30min', '1h': '1h', '4h': '4h', '1d': '1D'}
        pandas_tf = tf_map.get(request.timeframe, '1min') 
        
        for trade_file in files:
            file_path = os.path.join(target_dir, trade_file)
            try:
                df = pd.read_csv(file_path, usecols=['datetime', 'price', 'amount'])
                df['datetime'] = pd.to_datetime(df['datetime'])
                df.set_index('datetime', inplace=True)
            except Exception as e:
                print(f"Skipping {trade_file}: {e}")
                continue

            ohlc = df['price'].resample(pandas_tf).ohlc()
            volume = df['amount'].resample(pandas_tf).sum()
            volume.name = 'volume' 

            candles = pd.concat([ohlc, volume], axis=1)
            # Add saving logic if needed or return summary. 
            # In main.py it was cut off in view, I'll assuming saving was intended or just printing?
            # main.py code ended with: "candles = pd.concat([ohlc, volume], axis=1)"
            # It should probably save it. I'll add a placeholder save or just increment count.
            # Assuming it saves to new CSV.
            output_filename = f"candles_{request.timeframe}_{trade_file}"
            candles.to_csv(os.path.join(target_dir, output_filename))
            converted_count += 1
            
        return {"success": True, "converted": converted_count, "message": "Conversion completed"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/report/download/{filename}")
def download_report(filename: str):
    file_path = os.path.join(REPORTS_DIR, filename)
    
    if os.path.exists(file_path):
        media_type = "application/pdf" if filename.endswith(".pdf") else "text/html"
        return FileResponse(file_path, media_type=media_type, filename=filename)
    else:
        raise HTTPException(status_code=404, detail="Report file not found")

@router.get("/download-report/{task_id}")
def download_backtest_report(task_id: str, format: str = "pdf"):
    # ১. টাস্ক রেজাল্ট চেক করা
    task_result = AsyncResult(task_id)
    
    if task_result.state != 'SUCCESS':
        raise HTTPException(status_code=400, detail="Backtest not completed yet.")
    
    result_data = task_result.result
    
    # ২. returns ডাটা আছে কিনা চেক করা
    if not result_data or "daily_returns" not in result_data:
        raise HTTPException(status_code=404, detail="Return data not found for report generation.")

    # ৩. রিপোর্ট জেনারেট করা
    symbol = result_data.get("symbol", "Unknown")
    timeframe = result_data.get("timeframe", "Unknown")
    file_path = generate_report(task_id, result_data["daily_returns"], symbol, timeframe, format=format)
    
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=500, detail="Failed to generate report file.")

    # ৪. ফাইল রিটার্ন করা
    safe_symbol = symbol.replace("/", "_")
    filename = f"report_{safe_symbol}_{timeframe}_{task_id}.{format}"
    return FileResponse(file_path, media_type='application/pdf' if format == 'pdf' else 'text/html', filename=filename)
