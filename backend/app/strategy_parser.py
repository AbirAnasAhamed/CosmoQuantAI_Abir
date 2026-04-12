import ast
import logging
from typing import List, Dict, Any
from app.schemas.strategy import VisualStrategyConfig, StrategyNode, StrategyEdge

logger = logging.getLogger(__name__)

# Existing AST parser functions for legacy file support
def parse_strategy_params(file_path: str) -> dict:
    """
    Safely extracts parameters from a Backtrader strategy file using AST.
    Returns a dictionary of params: {param_name: default_value}
    """
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            tree = ast.parse(f.read(), filename=file_path)

        for node in tree.body:
            # Look for class definitions
            if isinstance(node, ast.ClassDef):
                # Check for 'params' assignment inside the class
                for item in node.body:
                    if isinstance(item, ast.Assign):
                        # check if targets contains 'params'
                        is_params = False
                        for target in item.targets:
                            if isinstance(target, ast.Name) and target.id == 'params':
                                is_params = True
                                break
                        
                        if is_params:
                            return _extract_params_from_node(item.value)
                            
        return {}

    except Exception as e:
        logger.error(f"Error parsing strategy params for {file_path}: {e}")
        return {}

def _extract_params_from_node(value_node) -> dict:
    """
    Helper to extract values from AST nodes (Dict, Tuple, Call).
    """
    params = {}

    # Case 1: params = (('period', 20), ('rsi_upper', 70), )
    if isinstance(value_node, ast.Tuple):
        for elt in value_node.elts:
            if isinstance(elt, ast.Tuple) and len(elt.elts) == 2:
                key_node = elt.elts[0]
                val_node = elt.elts[1]
                
                key = _get_literal_value(key_node)
                val = _get_literal_value(val_node)
                
                if key is not None:
                    params[key] = val

    # Case 2: params = dict(period=20, rsi_upper=70)
    elif isinstance(value_node, ast.Call) and isinstance(value_node.func, ast.Name) and value_node.func.id == 'dict':
        for keyword in value_node.keywords:
            key = keyword.arg
            val = _get_literal_value(keyword.value)
            if key is not None:
                 params[key] = val
                 
    # Case 3: params = {'period': 20, 'rsi_upper': 70}
    elif isinstance(value_node, ast.Dict):
        for k, v in zip(value_node.keys, value_node.values):
            key = _get_literal_value(k)
            val = _get_literal_value(v)
            if key is not None:
                params[key] = val

    return params

def _get_literal_value(node):
    """
    Safely extracts literal values from AST nodes.
    Supports: Constant (Python 3.8+), Num, Str, NameConstant, UnaryOp (for negative numbers)
    """
    if isinstance(node, ast.Constant):  # Python 3.8+ for Num, Str, Bytes, NameConstant
        return node.value
    
    # Handle negative numbers (e.g. -1)
    elif isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        operand = _get_literal_value(node.operand)
        if isinstance(operand, (int, float)):
            return -operand

    # Fallbacks for older python versions if needed (though 3.8+ is standard now)
    elif isinstance(node, ast.Num):
        return node.n
    elif isinstance(node, ast.Str):
        return node.s
    elif isinstance(node, ast.NameConstant): # True, False, None
        return node.value
        
    return None

# --- NEW: Visual Strategy Compiler ---

class VisualStrategyCompiler:
    def __init__(self, config: VisualStrategyConfig):
        self.nodes = {node.id: node for node in config.nodes}
        self.edges = config.edges
        self.adj = {node.id: [] for node in config.nodes}
        for edge in self.edges:
            if edge.source in self.adj:
                self.adj[edge.source].append(edge.target)
        
        self.indicators = []
        self.logic_lines = []
        self.node_vars = {} # Maps node_id -> variable_name
        self.indent = "        " # 8 spaces

    def compile(self, class_name: str = "GeneratedStrategy") -> str:
        # 1. First Pass: Identify Indicators and generate __init__ code
        self._scan_indicators()
        
        # 2. Second Pass: Build Logic Flow (next method)
        self._build_logic()

        # 3. Assemble the full class code
        return self._generate_code(class_name)

    def _scan_indicators(self):
        """Finds all indicator nodes and prepares them for __init__"""
        count = 0
        for node in self.nodes.values():
            if node.type == 'INDICATOR' or 'RSI' in node.data.get('label', '') or 'MACD' in node.data.get('label', ''):
                # Generate a variable name
                var_name = f"self.ind_{count}"
                self.node_vars[node.id] = var_name
                count += 1
                
                # Extract params
                label = node.data.get('label', 'SMA')
                params = node.data.get('params', {})
                
                if 'RSI' in label or label == 'RSI':
                    period = params.get('period', 14)
                    self.indicators.append(f"{var_name} = bt.indicators.RSI(period={period})")
                
                elif 'MACD' in label or label == 'MACD':
                    period_me1 = params.get('fast', 12)
                    period_me2 = params.get('slow', 26)
                    period_signal = params.get('signal', 9)
                    self.indicators.append(f"{var_name} = bt.indicators.MACD(period_me1={period_me1}, period_me2={period_me2}, period_signal={period_signal})")
                
                elif 'SMA' in label or 'Mov' in label:
                    period = params.get('period', 20)
                    self.indicators.append(f"{var_name} = bt.indicators.SMA(period={period})")

    def _build_logic(self):
        """Constructs the decision tree for the 'next' method"""
        # Start from Trigger nodes
        trigger_nodes = [n for n in self.nodes.values() if n.type == 'TRIGGER' or 'Trigger' in n.data.get('label', '')]
        
        if not trigger_nodes:
             # If no explicit trigger, assume we check conditions every bar (implicit trigger)
             # Find condition nodes that are root of logic
             pass

        # For now, we iterate through 'Condition' nodes and linked Actions
        # A simple approach: Find edges: Condition -> Action
        
        for edge in self.edges:
            source = self.nodes.get(edge.source)
            target = self.nodes.get(edge.target)
            
            if not source or not target:
                continue
                
            # If Source is a Condition (e.g., RSI < 30)
            if source.type == 'CONDITION' or 'Condition' in source.data.get('label', ''):
                cond_code = self._parse_condition(source)
                
                if target.type == 'ACTION' or 'Action' in target.data.get('label', ''):
                    action_code = self._parse_action(target)
                    
                    block = f"if {cond_code}:\n{self.indent}    {action_code}"
                    self.logic_lines.append(block)

    def _parse_condition(self, node: StrategyNode) -> str:
        # Expected format: "RSI(14) < 30" in label or detailed params
        # We need to map this to our created indicators
        
        # Heuristic: Try to find which indicator this condition is connected to
        # BUT current UI mocks often embed the indicator IN the condition or just text.
        # Let's support the static strings from the UI mock first: "RSI(14) < 30"
        
        text = node.data.get('label', '')
        
        # 1. Check for linked indicators (more robust)
        # Find incoming edge to this condition
        incoming = [e for e in self.edges if e.target == node.id]
        lhs = "self.data.close[0]" # Default
        
        if incoming:
            prev_node_id = incoming[0].source
            if prev_node_id in self.node_vars:
                # It's an indicator
                lhs = f"{self.node_vars[prev_node_id]}[0]"
        
        # If text contains manual parsing logic
        if "RSI" in text and "<" in text:
            # Try to find a matching rsi indicator
            rsi_var = next((v for k,v in self.node_vars.items() if "ind" in v), "self.rsi") # Fallback
            # Extract number
            import re
            val = re.findall(r'\d+', text.split('<')[1])
            thresh = val[0] if val else "30"
            return f"{rsi_var}[0] < {thresh}"
            
        elif "RSI" in text and ">" in text:
            rsi_var = next((v for k,v in self.node_vars.items() if "ind" in v), "self.rsi")
            val = re.findall(r'\d+', text.split('>')[1])
            thresh = val[0] if val else "70"
            return f"{rsi_var}[0] > {thresh}"

        return "True" # Fallback

    def _parse_action(self, node: StrategyNode) -> str:
        text = node.data.get('label', '').lower()
        if "buy" in text:
            return "self.buy()"
        elif "sell" in text:
             return "self.sell()"
        return "pass"

    def _generate_code(self, class_name: str) -> str:
        header = f"""
import backtrader as bt
from app.strategies.base_strategy import BaseStrategy

class {class_name}(BaseStrategy):
    # Auto-generated by BotLab Compiler
    
    params = (
        ('stop_loss', 1.0),
        ('take_profit', 2.0),
    )

    def __init__(self):
        super().__init__()
        # Indicators
"""
        
        # Indent indicators
        ind_code = ""
        if self.indicators:
            for ind in self.indicators:
                ind_code += f"        {ind}\n"
        else:
            ind_code = "        pass\n"

        logic_header = f"""
    def next(self):
        if self.order: # Waiting for order execution
            return

        # Strategy Logic
"""
        logic_code = ""
        if self.logic_lines:
            for line in self.logic_lines:
                logic_code += f"        {line}\n"
        else:
            logic_code = "        pass\n"

        return header + ind_code + logic_header + logic_code

def compile_visual_to_python(config_dict: Dict[str, Any], class_name: str = "VisualStrategy") -> str:
    try:
        # Convert dict to Pydantic model
        config = VisualStrategyConfig(**config_dict)
        compiler = VisualStrategyCompiler(config)
        return compiler.compile(class_name)
    except Exception as e:
        logger.error(f"Compilation Error: {e}")
        return f"# Error compiling strategy: {e}"
