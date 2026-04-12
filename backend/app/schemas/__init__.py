from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, Any, List
from datetime import datetime

# --- User Schemas ---
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str

class UserResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: Optional[str] = None
    is_active: bool
    is_pro: bool
    created_at: Optional[datetime] = None
    allowed_ips: Optional[List[str]] = []
    is_ip_whitelist_enabled: Optional[bool] = False
    avatar_url: Optional[str] = None

    class Config:
        from_attributes = True

class UserSecurityUpdate(BaseModel):
    allowed_ips: Optional[List[str]] = None
    is_ip_whitelist_enabled: Optional[bool] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

# --- API Key Schemas ---
class ApiKeyCreate(BaseModel):
    exchange: str
    name: str  # User defined label
    api_key: str
    secret_key: str
    passphrase: Optional[str] = None

class ApiKeyResponse(BaseModel):
    id: int
    exchange: str
    name: str  # User defined label
    api_key: str
    is_enabled: bool
    
    class Config:
        from_attributes = True

# --- Backtest & Strategy Schemas ---
class BacktestRequest(BaseModel):
    symbol: str
    timeframe: str
    secondary_timeframe: Optional[str] = None
    strategy: str
    initial_cash: float = 10000.0
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    params: Dict[str, Any] = {}
    custom_data_file: Optional[str] = None
    commission: float = 0.001
    slippage: float = 0.0
    leverage: float = 1.0
    stop_loss: Optional[float] = 0.0
    take_profit: Optional[float] = 0.0
    trailing_stop: Optional[float] = 0.0
    indicator_id: Optional[int] = None

class BatchBacktestRequest(BaseModel):
    symbol: str
    timeframe: str
    initial_cash: float = 10000.0
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    commission: float = 0.001
    slippage: float = 0.0
    strategies: Optional[List[str]] = None 
    custom_data_file: Optional[str] = None

class GenerateStrategyRequest(BaseModel):
    prompt: str

class OptimizationParam(BaseModel):
    start: float
    end: float
    step: float

class OptimizationRequest(BaseModel):
    symbol: str
    timeframe: str
    strategy: str
    initial_cash: float = 10000.0
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    params: Dict[str, OptimizationParam]
    method: str = "grid"
    population_size: int = 50
    generations: int = 10
    commission: float = 0.001
    slippage: float = 0.0
    leverage: float = 1.0

class WalkForwardRequest(BaseModel):
    symbol: str
    timeframe: str
    strategy: str
    initial_cash: float = 10000.0
    params: Dict[str, Any]
    start_date: str
    end_date: str
    train_window_days: int = 90
    test_window_days: int = 30
    method: str = "grid"
    population_size: int = 20
    generations: int = 5
    commission: float = 0.001
    slippage: float = 0.0
    leverage: float = 1.0
    opt_target: str = "profit"
    min_trades: int = 5

class DownloadRequest(BaseModel):
    exchange: str
    symbol: str
    start_date: str
    end_date: Optional[str] = None
    timeframe: Optional[str] = "1h"

class ConversionRequest(BaseModel):
    filename: str
    timeframe: str = "1min"

# --- Bot & Indicator Schemas ---
from .bot import Bot, BotCreate, BotUpdate
from .indicator import *

# 👇 This is the new line
from .education import *
