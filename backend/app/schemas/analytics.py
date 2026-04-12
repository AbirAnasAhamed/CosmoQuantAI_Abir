from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List, Dict, Any

class PerformanceMetrics(BaseModel):
    sharpe_ratio: float
    max_drawdown: float
    win_rate: float
    total_trades: int
    total_pnl: float
    start_date: Optional[datetime]
    end_date: Optional[datetime]

class CorrelationRequest(BaseModel):
    symbols: List[str]
    timeframe: str = "1h"
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None

class CointegrationPair(BaseModel):
    asset_a: str
    asset_b: str
    score: float
    p_value: float
    is_cointegrated: bool
    z_score: float

class CorrelationResponse(BaseModel):
    matrix: Dict[str, Dict[str, float]]
    lead_lag_matrix: Dict[str, Dict[str, int]]
    cointegrated_pairs: List[CointegrationPair]

class RollingCorrelationPoint(BaseModel):
    time: str
    value: float

