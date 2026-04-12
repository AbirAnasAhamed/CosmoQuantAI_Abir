
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services.event_driven.engine import EventDrivenEngine
import asyncio

router = APIRouter()

@router.websocket("/ws/simulation")
async def websocket_simulation(websocket: WebSocket):
    await websocket.accept()
    
    engine = None
    simulation_task = None
    
    try:
        while True:
            # Wait for command from client
            data = await websocket.receive_json()
            
            action = data.get("action")
            msg_type = data.get("type")
            
            if action:
                print(f"WS Action Received: {action}", flush=True)

            if action == "START":
                if engine:
                    # If already running, ignore or restart? Let's restart.
                    engine.stop()
                    if simulation_task:
                        simulation_task.cancel()
                        try:
                            await simulation_task
                        except asyncio.CancelledError:
                            pass

                symbol = data.get("symbol", "BTC/USDT")
                # Initialize Engine
                engine = EventDrivenEngine(symbol=symbol, websocket=websocket)
                
                # Run the engine in background
                simulation_task = asyncio.create_task(engine.run())
                
            elif action == "STOP":
                if engine:
                    engine.stop()
                    if simulation_task:
                        # Wait for it to finish explicitly
                        try:
                            await simulation_task
                            print("WS: Simulation Task finished.", flush=True)
                        except asyncio.CancelledError:
                             print("WS: Simulation Task cancelled.", flush=True)
                        except Exception as e:
                             print(f"WS: Error awaiting task: {e}", flush=True)
                    
                    print("WS: Sending Simulation Stopped message...", flush=True)
                    await websocket.send_json({"type": "SYSTEM", "message": "Simulation Stopped"})
                    engine = None
                    simulation_task = None
            
            elif msg_type == "UPDATE_SPEED":
                if engine:
                    await engine.process_command(data)

    except WebSocketDisconnect:
        print("Client disconnected from Simulation Socket")
    except Exception as e:
        print(f"Error in Simulation Socket: {e}")
    finally:
        # Cleanup
        if engine:
            engine.stop()
        if simulation_task:
            simulation_task.cancel()
            try:
                await simulation_task
            except asyncio.CancelledError:
                pass
            except Exception as e:
                print(f"Error waiting for task cleanup: {e}")
