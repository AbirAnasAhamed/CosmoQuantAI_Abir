import asyncio
import websockets
import json
import sys

async def test_bot_status():
    uri = "ws://localhost:8000/api/v1/bots/8/ws/status"
    try:
        print(f"Connecting to {uri}...")
        async with websockets.connect(uri) as websocket:
            print("Connected successfully!")
            
            # Wait for exactly one message which should be the initial state
            message = await asyncio.wait_for(websocket.recv(), timeout=2.0)
            print("Received initial state immediately:")
            
            # Pretty print JSON
            try:
                data = json.loads(message)
                print(json.dumps(data, indent=2))
                print("\n✅ Verification SUCCESS: Initial state received correctly on connection!")
            except json.JSONDecodeError:
                print(f"Received non-JSON message: {message}")
                print("\n❌ Verification FAILED: Message is not valid JSON")
                
    except asyncio.TimeoutError:
        print("\n❌ Verification FAILED: Timed out waiting for initial state! The backend is not sending the cached state on connect.")
    except Exception as e:
        print(f"\n❌ Verification FAILED: Connection error: {e}")

if __name__ == "__main__":
    asyncio.run(test_bot_status())
