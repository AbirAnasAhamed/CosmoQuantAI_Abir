import asyncio
import websockets
import json

async def verify_websocket():
    uri = "ws://localhost:8000/api/v1/analytics/ws/correlation"
    print(f"Connecting to {uri}...")
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    
    try:
        async with websockets.connect(uri, extra_headers=headers) as websocket:
            print("Connected!")
            
            # Wait for first message
            print("Waiting for data...")
            message = await websocket.recv()
            
            data = json.loads(message)
            print(f"Received message type: {data.get('type')}")
            
            if data.get('type') == 'update' and 'data' in data:
                payload = data['data']
                if 'matrix' in payload and 'cointegrated_pairs' in payload:
                    print("WEBSOCKET SUCCESS")
                else:
                    print("FAIL: Payload missing matrix or pairs")
            else:
                print(f"FAIL: Unexpected message format: {data}")
                
    except Exception as e:
        print(f"Connection failed: {e}")

if __name__ == "__main__":
    asyncio.run(verify_websocket())
