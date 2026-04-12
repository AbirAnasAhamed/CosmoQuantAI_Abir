from pydantic import BaseModel
from typing import List, Optional

class BotSummary(BaseModel):
    id: int
    name: str
    market: str
    strategy: str
    pnl: float
    pnl_percent: float
    status: str

class PortfolioValuePoint(BaseModel):
    name: str
    value: float

class AllocationPoint(BaseModel):
    name: str
    value: float

class BacktestSummary(BaseModel):
    id: int
    strategy: str
    market: str
    timeframe: str
    date: str
    profit_percent: float
    max_drawdown: float
    win_rate: float
    sharpe_ratio: float

class DashboardSummary(BaseModel):
    total_equity: float
    equity_change_24h: float
    total_profit_24h: float
    profit_change_24h: float
    active_bots: int
    avg_win_rate: float
    win_rate_change_24h: float
    bots: List[BotSummary]
    portfolio_value: List[PortfolioValuePoint]
    portfolio_allocation: List[AllocationPoint]
    recent_backtests: List[BacktestSummary]
