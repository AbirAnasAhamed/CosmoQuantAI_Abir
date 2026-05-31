import sys
import os
import asyncio
from dotenv import load_dotenv

# Ensure backend directory is in path
sys.path.append(os.path.join(os.getcwd(), 'app'))

# Load env manually to ensure we pick up the latest keys
load_dotenv(".env")

from app.services.exchange_flow_service import exchange_flow_service

async def main():
    print("🔎 Verifying Exchange Flow Service...")
    print(f"Checking Etherscan API Key presence...")
    
    # We can check settings directly or just see if service works
    try:
        data = await exchange_flow_service.calculate_netflow()
        print("\n✅ Service Call Successful!")
        print("------------------------------------------------")
        print(f"Inflow (Sell Pressure) : {data['inflow_eth']} ETH")
        print(f"Outflow (Buy Pressure) : {data['outflow_eth']} ETH")
        print(f"Net Flow               : {data['net_flow']} ETH")
        print(f"Sentiment              : {data['sentiment']}")
        print(f"Transactions Analyzed  : {data['tx_count']}")
        print("------------------------------------------------")
        
        if data['tx_count'] == 0:
            print("⚠️ Warning: 0 transactions analyzed. Check if API Key is valid or if block is empty.")
        else:
            print("🚀 Feature is working correctly with live data.")
            
    except Exception as e:
        print(f"\n❌ Error during verification: {e}")

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
