import json
import asyncio
import logging
from fastapi import WebSocket, WebSocketDisconnect
from pathlib import Path

from backend.config import EXECUTION_TIMEOUT
from backend.compiler import compile_c_file

logger = logging.getLogger("voltc-runner")

async def read_stream(stream, ws: WebSocket, stream_type: str):
    """Asynchronously reads data from subprocess stdout/stderr and forwards to WebSocket."""
    try:
        while True:
            # Read in chunks of 1024 bytes
            data = await stream.read(1024)
            if not data:
                break
            text = data.decode("utf-8", errors="replace")
            await ws.send_json({"type": stream_type, "data": text})
    except asyncio.CancelledError:
        pass
    except Exception as e:
        logger.error(f"Error reading {stream_type} stream: {e}")

async def handle_ws_run(ws: WebSocket):
    """Handles WebSocket connections for C program interactive executions."""
    await ws.accept()
    logger.info("WebSocket connection established for code execution.")

    process = None
    stdout_task = None
    stderr_task = None
    timeout_task = None
    
    try:
        # Wait for compilation instructions
        init_data = await ws.receive_text()
        init_msg = json.loads(init_data)
        
        if init_msg.get("type") != "start":
            await ws.send_json({"type": "status", "event": "error", "data": "Protocol error: Expected start message."})
            await ws.close()
            return
            
        file_path = init_msg.get("path")
        flags = init_msg.get("flags", [])
        
        # Notify compiling phase
        await ws.send_json({"type": "status", "event": "compiling"})
        
        # Trigger compile
        compile_res = await compile_c_file(file_path, flags)
        
        if not compile_res.success:
            await ws.send_json({
                "type": "status", 
                "event": "error", 
                "data": "Compilation failed.",
                "errors": compile_res.errors
            })
            await ws.close()
            return

        executable_path = compile_res.executable_path
        if not executable_path or not Path(executable_path).exists():
            await ws.send_json({"type": "status", "event": "error", "data": "Executable artifact not found."})
            await ws.close()
            return

        # Start execution phase
        await ws.send_json({"type": "status", "event": "running"})
        logger.info(f"Spawning executable binary: {executable_path}")

        # Spawn C program subprocess
        process = await asyncio.create_subprocess_exec(
            executable_path,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        # Launch concurrent background stream readers
        stdout_task = asyncio.create_task(read_stream(process.stdout, ws, "stdout"))
        stderr_task = asyncio.create_task(read_stream(process.stderr, ws, "stderr"))

        # Timeout safeguard task
        async def monitor_timeout():
            await asyncio.sleep(EXECUTION_TIMEOUT)
            if process.returncode is None:
                logger.warning(f"Process timeout reached ({EXECUTION_TIMEOUT}s). Force-terminating.")
                try:
                    process.terminate()
                    await ws.send_json({"type": "status", "event": "timeout"})
                except Exception as e:
                    logger.error(f"Error terminating process on timeout: {e}")

        timeout_task = asyncio.create_task(monitor_timeout())

        # Main websocket listening loop for interactive stdin
        while process.returncode is None:
            try:
                # Wait for user input from the browser console
                client_msg_text = await asyncio.wait_for(ws.receive_text(), timeout=0.5)
                client_msg = json.loads(client_msg_text)
                
                if client_msg.get("type") == "stdin" and process.stdin:
                    stdin_data = client_msg.get("data", "").encode("utf-8")
                    process.stdin.write(stdin_data)
                    await process.stdin.drain()
            except asyncio.TimeoutError:
                # Normal timeout check to check process state
                pass

        # Wait for streams to finish parsing remaining bytes
        await asyncio.gather(stdout_task, stderr_task, return_exceptions=True)
        
        # Send termination code back to client
        await ws.send_json({"type": "status", "event": "finished", "code": process.returncode})

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected by user.")
    except Exception as e:
        logger.error(f"Error in runner socket handler: {e}")
        try:
            await ws.send_json({"type": "status", "event": "error", "data": str(e)})
        except Exception:
            pass
    finally:
        # Cleanup subprocess and background monitors
        if timeout_task:
            timeout_task.cancel()
        if stdout_task:
            stdout_task.cancel()
        if stderr_task:
            stderr_task.cancel()

        if process and process.returncode is None:
            logger.info("Cleaning up running process...")
            try:
                process.kill()
                await process.wait()
            except Exception as e:
                logger.error(f"Failed to kill running subprocess: {e}")
        
        try:
            await ws.close()
        except Exception:
            pass
