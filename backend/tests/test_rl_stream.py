import asyncio
import json
import websockets
import sys
import os

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

async def mock_publisher(job_id: str):
    """Simulates the engine.py Celery task publishing RL steps to Redis."""
    try:
        import redis.asyncio as aioredis
    except ImportError:
        print("[Publisher] redis.asyncio not found. Is it installed?")
        return

    print(f"[Publisher] Connecting to Redis at {REDIS_URL}...")
    try:
        redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
        # Test connection
        await redis_client.ping()
    except Exception as e:
        print(f"[Publisher] Failed to connect to Redis: {e}")
        return
    
    print("[Publisher] Starting to publish mock RL steps every 1 second...")
    step = 0
    net_worth = 10000.0
    price = 50000.0
    
    try:
        while True:
            step += 1
            action = step % 3  # 0, 1, 2
            reward = 0.5 if action == 1 else -0.2
            net_worth += reward * 10
            price += (reward * 50)
            
            payload = {
                "step": step,
                "net_worth": net_worth,
                "position": 1 if action == 1 else 0,
                "balance": net_worth - 100,
                "action": action,
                "reward": reward,
                "price": price,
            }
            
            message = {
                "task_type": "RL_TRAINING_STEP",
                "task_id": job_id,
                "status": "processing",
                "progress": min(100, int((step / 10) * 100)),
                "data": payload
            }
            
            await redis_client.publish("task_updates", json.dumps(message))
            print(f"[Publisher] -> Published step {step}")
            await asyncio.sleep(1)
            
            if step >= 10:
                print("[Publisher] Finished mock training.")
                break
    finally:
        await redis_client.close()

async def mock_subscriber():
    """Simulates the Frontend connecting to the WebSocket and receiving data."""
    uri = "ws://localhost:8000/api/v1/ws/backtest"
    print(f"[Subscriber] Connecting to WebSocket at {uri}...")
    try:
        async with websockets.connect(uri) as websocket:
            print("[Subscriber] Connected! Waiting for messages...")
            while True:
                response = await websocket.recv()
                data = json.loads(response)
                if data.get("type") == "RL_TRAINING_STEP":
                    payload = data.get("payload", {})
                    print(f"[Subscriber] <- Received RL Step Update: {payload.get('step')} | Net Worth: ${payload.get('net_worth', 0):.2f} | Action: {payload.get('action')}")
                    if payload.get("step") >= 10:
                        print("[Subscriber] Received all mock steps. Exiting subscriber.")
                        break
    except ConnectionRefusedError:
        print("[Subscriber] ❌ Connection refused. Is the FastAPI server running on port 8000?")
    except Exception as e:
        print(f"[Subscriber] WebSocket error: {e}")

async def run_publisher_after_delay(job_id):
    await asyncio.sleep(2)
    await mock_publisher(job_id)

async def main():
    job_id = "test_mock_job_123"
    print("=== RL Training Stream Verification ===")
    print("This script will act as both the Celery backend (publishing to Redis)")
    print("and the React frontend (listening to FastAPI WebSocket).")
    print("Make sure your FastAPI server is running before executing this!\n")
    
    # Run both concurrently
    await asyncio.gather(
        mock_subscriber(),
        asyncio.create_task(run_publisher_after_delay(job_id))
    )
    print("=== Verification Complete ===")

if __name__ == "__main__":
    asyncio.run(main())
