import os
import sys
import logging
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from backend.config import WORKSPACE_DIR
from backend.models import (
    FileSaveRequest, FileCreateRequest, FileDeleteRequest, 
    CompileRequest, CompileResponse, SessionState
)
from backend.files import (
    list_workspace_files, read_workspace_file, write_workspace_file,
    create_workspace_item, delete_workspace_item, save_session_state,
    load_session_state
)

# Set up logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("voltc-backend")

app = FastAPI(title="VoltC IDE Backend", version="1.0.0")

# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# REST API Endpoints for File Operations
@app.get("/api/files")
async def get_files():
    try:
        return list_workspace_files()
    except Exception as e:
        logger.error(f"Error listing files: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/file")
async def get_file(path: str):
    try:
        content = read_workspace_file(path)
        return {"path": path, "content": content, "success": True}
    except PermissionError as e:
        logger.warning(f"Permission denied: {e}")
        raise HTTPException(status_code=403, detail=str(e))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except Exception as e:
        logger.error(f"Error reading file {path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/file")
async def save_file(req: FileSaveRequest):
    try:
        write_workspace_file(req.path, req.content)
        return {"success": True}
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        logger.error(f"Error saving file {req.path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/create")
async def create_item(req: FileCreateRequest):
    try:
        created_path = create_workspace_item(req.path, req.is_dir, req.content)
        return {"success": True, "path": created_path}
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating item {req.path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/delete")
async def delete_item(req: FileDeleteRequest):
    try:
        delete_workspace_item(req.path)
        return {"success": True}
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Item not found")
    except Exception as e:
        logger.error(f"Error deleting item {req.path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# REST API Endpoints for Session/Settings Persistence
@app.get("/api/session")
async def get_session():
    try:
        return load_session_state()
    except Exception as e:
        logger.error(f"Error loading session: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/session")
async def save_session(req: SessionState):
    try:
        save_session_state(req)
        return {"success": True}
    except Exception as e:
        logger.error(f"Error saving session: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Compile API Stub (implemented in compiler.py later)
@app.post("/api/compile", response_model=CompileResponse)
async def compile_code(req: CompileRequest):
    # Import here to avoid circular dependencies
    from backend.compiler import compile_c_file
    try:
        return await compile_c_file(req.path, req.flags)
    except Exception as e:
        logger.error(f"Compilation error handler: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# WebSockets Endpoint Stubs
@app.websocket("/ws/run")
async def ws_run_endpoint(websocket: WebSocket):
    from backend.runner import handle_ws_run
    await handle_ws_run(websocket)

@app.websocket("/ws/lsp")
async def ws_lsp_endpoint(websocket: WebSocket):
    from backend.lsp import handle_ws_lsp
    await handle_ws_lsp(websocket)

# Configuration API Endpoint
@app.get("/api/config")
async def get_config():
    from backend.config import IS_WINDOWS
    return {
        "workspace_dir": str(WORKSPACE_DIR.resolve()),
        "os": "windows" if IS_WINDOWS else "linux"
    }

# Mount frontend public static directory
# Ensure public directory exists relative to app.py location or PyInstaller extraction folder
if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
    PUBLIC_DIR = Path(sys._MEIPASS) / "public"
else:
    PUBLIC_DIR = (Path(__file__).parent.parent / "public").resolve()

PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/", StaticFiles(directory=str(PUBLIC_DIR), html=True), name="public")
