import json
import asyncio
import logging
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger("voltc-lsp")

async def read_lsp_stdout(process, ws: WebSocket):
    """Reads LSP messages from clangd stdout, decodes Content-Length framing, and forwards to WebSocket."""
    try:
        while True:
            # Read header line
            line = await process.stdout.readline()
            if not line:
                break
                
            line_str = line.decode("utf-8", errors="replace").strip()
            if not line_str.startswith("Content-Length:"):
                continue
                
            try:
                content_length = int(line_str.split(":")[1].strip())
            except Exception:
                logger.error(f"Invalid Content-Length line: {line_str}")
                continue
                
            # Read the empty boundary line (\r\n)
            boundary = await process.stdout.readline()
            
            # Read the actual JSON payload
            payload_bytes = await process.stdout.readexactly(content_length)
            payload_str = payload_bytes.decode("utf-8", errors="replace")
            
            # Send raw JSON payload over WebSocket
            await ws.send_text(payload_str)
            
    except asyncio.CancelledError:
        pass
    except asyncio.IncompleteReadError:
        logger.info("Clangd stream closed EOF.")
    except Exception as e:
        logger.error(f"Error reading from clangd stdout: {e}")

async def handle_ws_lsp(ws: WebSocket):
    """FastAPI WebSocket endpoint for proxying Monaco LSP requests to clangd."""
    await ws.accept()
    logger.info("LSP WebSocket connection accepted.")
    
    process = None
    stdout_task = None
    
    try:
        # Spawn clangd compiler service process
        # Using --compile-commands-dir can be supported if compile_commands.json is present
        process = await asyncio.create_subprocess_exec(
            "clangd",
            "--log=error",
            "--background-index",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL
        )
        logger.info("Spawned clangd Language Server process.")
        
        # Start reading stdout from clangd in a background task
        stdout_task = asyncio.create_task(read_lsp_stdout(process, ws))
        
        # Main loop: receive LSP messages from WebSocket and forward to clangd stdin
        while True:
            msg_text = await ws.receive_text()
            
            # Wrap message in standard LSP framing: Content-Length: <len>\r\n\r\n<json>
            payload = msg_text.encode("utf-8")
            header = f"Content-Length: {len(payload)}\r\n\r\n".encode("utf-8")
            
            if process.stdin:
                process.stdin.write(header + payload)
                await process.stdin.drain()
                
    except WebSocketDisconnect:
        logger.info("LSP WebSocket disconnected.")
    except FileNotFoundError:
        logger.warning("clangd compiler service binary not found on this system. Falling back to default parser.")
        try:
            await ws.send_json({
                "type": "error", 
                "message": "clangd not installed. Install clangd via apt-get or llvm for autocomplete."
            })
        except Exception:
            pass
    except Exception as e:
        logger.error(f"Error in LSP proxy handler: {e}")
    finally:
        # Cleanup tasks and processes
        if stdout_task:
            stdout_task.cancel()
            
        if process and process.returncode is None:
            logger.info("Terminating clangd process...")
            try:
                process.terminate()
                await process.wait()
            except Exception as e:
                logger.error(f"Error terminating clangd: {e}")
        try:
            await ws.close()
        except Exception:
            pass
