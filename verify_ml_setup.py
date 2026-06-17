import sys
import os

# Add backend directory to path so we can import the module
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), 'backend')))

from app.strategies.helpers.ml_advanced_setup_generator import MLAdvancedSetupGenerator

class MockWickTracker:
    def __init__(self):
        self.levels = [
            {'type': 'support', 'price': 59000},
            {'type': 'resistance', 'price': 61000}
        ]

class MockBot:
    def __init__(self):
        self.current_atr = 500  # $500 ATR
        self.wick_sr_tracker = MockWickTracker()
        self.enable_auto_fibo_tp = False

def print_result(desc, res, current_price):
    print(f"\n[{desc}]")
    print(f"Current Price: {current_price}")
    print(f"SL Price:      {res['sl_price']} (Dist: {abs(current_price - res['sl_price'])})")
    print(f"TP Price:      {res['tp_price']} (Dist: {abs(res['tp_price'] - current_price)})")
    print(f"R:R Ratio:     {res['rr_ratio']}")
    print(f"Nearest S/R:   {res['nearest_sr']}")
    print(f"ATR Used:      {res['atr_used']}")

if __name__ == "__main__":
    print("Initializing ML Advanced Setup Generator Verification...\n")
    
    bot = MockBot()
    generator = MLAdvancedSetupGenerator(bot)
    
    current_price = 60000
    
    # Test 1: High Confidence Long
    print("--------------------------------------------------")
    print("Test 1: High Confidence (0.90) LONG")
    print("Expected: Tight SL (50% ATR + below support), Wide TP (300% ATR)")
    res1 = generator.generate_setup(current_price, 'long', 0.90)
    print_result("High Confidence Long Result", res1, current_price)
    
    # Test 2: Low Confidence Long
    print("--------------------------------------------------")
    print("Test 2: Low Confidence (0.60) LONG")
    print("Expected: Wide SL (150% ATR + below support), Tight TP (100% ATR)")
    res2 = generator.generate_setup(current_price, 'long', 0.60)
    print_result("Low Confidence Long Result", res2, current_price)

    # Test 3: High Confidence Short
    print("--------------------------------------------------")
    print("Test 3: High Confidence (0.90) SHORT")
    print("Expected: Tight SL (50% ATR + above resistance), Wide TP (300% ATR)")
    res3 = generator.generate_setup(current_price, 'short', 0.90)
    print_result("High Confidence Short Result", res3, current_price)
    
    # Test 4: Low Confidence Short
    print("--------------------------------------------------")
    print("Test 4: Low Confidence (0.60) SHORT")
    print("Expected: Wide SL (150% ATR + above resistance), Tight TP (100% ATR)")
    res4 = generator.generate_setup(current_price, 'short', 0.60)
    print_result("Low Confidence Short Result", res4, current_price)
    
    # Test 5: No S/R Levels Available (Fallback)
    print("--------------------------------------------------")
    print("Test 5: No Support/Resistance Levels Available (High Conf Long)")
    print("Expected: SL based purely on Current Price - (0.5 * ATR)")
    bot.wick_sr_tracker = None
    generator_no_sr = MLAdvancedSetupGenerator(bot)
    res5 = generator_no_sr.generate_setup(current_price, 'long', 0.90)
    print_result("No S/R Fallback Result", res5, current_price)
