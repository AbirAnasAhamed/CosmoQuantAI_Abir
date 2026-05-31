import asyncio
import websockets

async def test_ws():
    uri = "ws://localhost:3000/api/v1/bots/3/ws/logs"
    print(f"Connecting to {uri}")
    try:
        async with websockets.connect(uri, origin="http://localhost:3000") as ws:
            print("Connected!")
            while True:
                msg = await ws.recv()
                print(f"Received: {msg}")
    except Exception as e:
        print(f"Error: {e}")

asyncio.run(test_ws())
