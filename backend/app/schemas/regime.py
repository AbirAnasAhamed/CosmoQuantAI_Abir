from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime

class RegimeHistoryItem(BaseModel):
    timestamp: datetime
    close: float
    regime: str
    log_return: float
    volatility: float

class RegimeResponse(BaseModel):
    current_regime: str
    trend_score: float
    volatility_score: float
    transition_matrix: List[List[float]]
    regime_map: Dict[int, str]
    history: List[RegimeHistoryItem]
