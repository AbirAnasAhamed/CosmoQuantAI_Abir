from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any, Union

class StrategyNode(BaseModel):
    id: str
    type: str  # 'TRIGGER', 'INDICATOR', 'CONDITION', 'ACTION'
    data: Dict[str, Any] = {}
    position: Dict[str, float] = Field(default_factory=lambda: {"x": 0, "y": 0})

class StrategyEdge(BaseModel):
    id: str
    source: str
    target: str
    sourceHandle: Optional[str] = None
    targetHandle: Optional[str] = None

class VisualStrategyConfig(BaseModel):
    nodes: List[StrategyNode]
    edges: List[StrategyEdge]

class CompiledStrategy(BaseModel):
    source_code: str
    class_name: str
    config: VisualStrategyConfig

class AIStrategyConfig(BaseModel):
    strategy_name: str
    description: str
    leverage: int = Field(..., ge=1, le=125)
    stop_loss: float = Field(..., description="Percentage stop loss")
    take_profit: float = Field(..., description="Percentage take profit")
    timeframe: str = Field(..., description="Timeframe like 15m, 1h, 4h")
    amount_per_trade: float = Field(..., description="Amount in USD or percentage")
