import sys
sys.path.append('.')
from app.services.log_monitor_service import classify_log_line

line = '2026-06-03T17:46:43.311608129Z ERROR:WallHunterFutures6:[REAL] Order execution failed for sell 4317.0 DOGE/USDC:USDC at 0.09254: binance {"code":-2022,"msg":"ReduceOnly Order is rejected."}'
print('Result:', classify_log_line(line))
