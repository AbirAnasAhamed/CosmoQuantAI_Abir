import sys
import os

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))

from backend.app.services.regime_service import RegimeService

def verify_regime():
    print("Initializing Regime Service...")
    service = RegimeService()
    
    print("Fetching data and running HMM...")
    try:
        result = service.execute()
        
        print("\n=== Market Regime Detection Verification ===")
        print(f"Current Regime: {result['current_regime']}")
        print(f"Trend Score: {result['trend_score']}")
        print(f"Volatility Score: {result['volatility_score']}")
        
        print("\n=== Transition Matrix ===")
        print(result['transition_matrix'])
        
        print("\n=== Sample Data (Last 5 Points) ===")
        history = result['history']
        last_5 = history[-5:]
        for point in last_5:
            print(f"Time: {point['timestamp']}, Close: {point['close']}, Regime: {point['regime']}")
            
        print("\n=== Status Mapping ===")
        print(result['regime_map'])
            
        print("\nVERIFICATION SUCCESSFUL")
        
    except Exception as e:
        print(f"\nVERIFICATION FAILED: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    # Redirect stdout to a file for clean capture
    with open("verify_output.txt", "w") as f:
        sys.stdout = f
        verify_regime()
        sys.stdout = sys.__stdout__
    
    # Also print to console
    with open("verify_output.txt", "r") as f:
        print(f.read())
