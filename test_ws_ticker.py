import asyncio
import websockets
import json

async def test_market_overview():
    uri = "ws://localhost:8000/ws"  # Assuming default port 8000 based on main.py
    print(f"Connecting to {uri}...")
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected! Waiting for messages...")
            
            # Listen for 5 messages or until we see market_overview
            for i in range(10):
                message = await websocket.recv()
                data = json.loads(message)
                
                if data.get("type") == "market_overview":
                    print("\n✅ Success! Received Market Overview Data:")
                    print(json.dumps(data, indent=2))
                    return
                else:
                    print(f"Received other message type: {data.get('type')}")
                    
            print("\n⚠️ Timed out waiting for 'market_overview' message.")
            
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        print("Note: Ensure the backend server is running (e.g., uvicorn app.main:app --reload)")

if __name__ == "__main__":
    asyncio.run(test_market_overview())
