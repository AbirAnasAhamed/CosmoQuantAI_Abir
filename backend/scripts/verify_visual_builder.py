import sys
import os
import json

# Add backend to path
sys.path.append("e:/CosmoQuantAI/backend")

from app.schemas.strategy import VisualStrategyConfig, StrategyNode, StrategyEdge
from app.strategy_parser import compile_visual_to_python

def test_compiler():
    print("Testing Visual Strategy Compiler...")
    
    # Mock Data matching frontend structure
    nodes = [
        StrategyNode(id="1", type="TRIGGER", data={"label": "Market Data 1m"}),
        StrategyNode(id="2", type="INDICATOR", data={"label": "RSI(14)", "params": {"period": 14}}),
        StrategyNode(id="3", type="CONDITION", data={"label": "RSI < 30"}),
        StrategyNode(id="4", type="ACTION", data={"label": "Buy Market"}),
        StrategyNode(id="5", type="ACTION", data={"label": "Sell Market"})
    ]
    
    edges = [
        StrategyEdge(id="e1", source="1", target="2"),
        StrategyEdge(id="e2", source="2", target="3"),
        StrategyEdge(id="e3", source="3", target="4")
    ]
    
    config = VisualStrategyConfig(nodes=nodes, edges=edges)
    
    code = compile_visual_to_python(config.dict(), class_name="TestStrategy")
    
    print("\n--- Generated Code ---")
    print(code)
    print("\n----------------------")
    
    # Validate Syntax
    try:
        compile(code, "<string>", "exec")
        print("✅ Syntax is Valid")
    except SyntaxError as e:
        print(f"❌ Syntax Error: {e}")

if __name__ == "__main__":
    test_compiler()
