
import sys
import os
from pprint import pprint

# Ensure the backend directory is in the python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))

from app.services.ai_service import ai_service

def test_ai_strategy_generation():
    print("--- Testing AI Strategy Generation (Mock) ---\n")

    prompts = [
        "Create a risky bitcoin strategy with high leverage",
        "I need a safe, conservative strategy for ETH",
        "Standard trend following strategy"
    ]

    for p in prompts:
        print(f"Input Prompt: '{p}'")
        try:
            config = ai_service.generate_strategy_config(p)
            print("Generated Config:")
            pprint(config)
        except Exception as e:
            print(f"Error: {e}")
        print("-" * 30)

if __name__ == "__main__":
    test_ai_strategy_generation()
