import os
import re

def verify_file_content(filepath, patterns):
    if not os.path.exists(filepath):
        print(f"[ERROR] File not found: {filepath}")
        return False
        
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    all_passed = True
    for pattern_name, regex_pattern in patterns.items():
        if re.search(regex_pattern, content, re.MULTILINE):
            print(f"[PASSED] {pattern_name}")
        else:
            print(f"[FAILED] {pattern_name}")
            all_passed = False
    return all_passed

def run_verification():
    print("=" * 60)
    print(" WALLHUNTER BOT VERIFICATION SCRIPT ")
    print("=" * 60)
    
    # 1. Spot Bot Verification
    print("\n[1] Verifying Spot Bot (wall_hunter_bot.py)")
    spot_file = "e:/CosmoQuantAI/backend/app/strategies/wall_hunter_bot.py"
    spot_patterns = {
        "Supertrend Exit Variable Initialization": r"self\.enable_supertrend_exit\s*=\s*config\.get\([^)]+\)",
        "Strict Limit Maker Enforcement on Entry": r"snipe_order_type\s*=\s*override_order_type\s*if\s*override_order_type\s*else\s*\"limit\"",
        "Supertrend Reversal Detection Logic": r"supertrend_reversal\s*=\s*True",
        "Maker-to-Taker Fallback Method Exists": r"def\s*_execute_fallback_exit\s*\(self\):"
    }
    verify_file_content(spot_file, spot_patterns)

    # 2. Futures Bot Verification
    print("\n[2] Verifying Futures Bot (wall_hunter_futures.py)")
    futures_file = "e:/CosmoQuantAI/backend/app/strategies/wall_hunter_futures.py"
    futures_patterns = {
        "Supertrend Exit Variable Initialization": r"self\.enable_supertrend_exit\s*=\s*self\.config\.get\([^)]+\)",
        "Strict Limit Maker Enforcement on Entry": r"snipe_order_type\s*=\s*override_order_type\s*if\s*override_order_type\s*else\s*\"limit\"",
        "Supertrend Reversal Detection Logic": r"supertrend_reversal\s*=\s*True",
        "Maker-to-Taker Fallback Method Exists": r"def\s*_execute_fallback_exit\s*\(self,\s*current_price:\s*float\):"
    }
    verify_file_content(futures_file, futures_patterns)

    # 3. Frontend Verification
    print("\n[3] Verifying Frontend Modal (WallHunterModal.tsx)")
    frontend_file = "e:/CosmoQuantAI/frontend/src/components/features/market/WallHunterModal.tsx"
    frontend_patterns = {
        "Supertrend Exit States Configured": r"enableSupertrendExit:\s*(true|false)|supertrendExitTimeout:\s*\d+",
        "UI Reversal Dual-Exit Checkbox": r"Reversal Dual-Exit",
        "UI Maker-to-Taker Timeout Slider": r"Maker-to-Taker",
        "Payload Generator Mapping": r"enable_supertrend_exit:\s*form\.enableSupertrendBot\s*\?\s*form\.enableSupertrendExit\s*:\s*false"
    }
    verify_file_content(frontend_file, frontend_patterns)

    print("\n" + "=" * 60)
    print(" Verification Complete! ")
    print("=" * 60)

if __name__ == "__main__":
    run_verification()
