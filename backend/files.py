import os
import json
from pathlib import Path
from typing import List, Optional
from backend.config import WORKSPACE_DIR, SUPPORTED_EXTENSIONS
from backend.models import FileItem, SessionState

# Ensure workspace directory exists
WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)

# Path to local settings storage
SESSION_FILE = WORKSPACE_DIR / ".voltc" / "session.json"
SESSION_FILE.parent.mkdir(parents=True, exist_ok=True)

def is_safe_path(target_path: str) -> bool:
    """Enforces workspace isolation by resolving paths and validating they stay within workspace."""
    try:
        resolved_workspace = WORKSPACE_DIR.resolve()
        # Resolve target path (handle potential non-existent files during creation)
        target = Path(target_path)
        if not target.is_absolute():
            resolved_target = (resolved_workspace / target).resolve()
        else:
            resolved_target = target.resolve()
        
        # Check if the target is within the workspace
        return resolved_workspace in resolved_target.parents or resolved_workspace == resolved_target
    except Exception:
        return False

def get_relative_path(absolute_path: str) -> str:
    """Returns path relative to workspace."""
    try:
        return str(Path(absolute_path).relative_to(WORKSPACE_DIR))
    except ValueError:
        return absolute_path

def list_workspace_files(dir_path: Path = WORKSPACE_DIR) -> List[FileItem]:
    """Recursively lists files and folders inside the workspace."""
    items = []
    try:
        for entry in os.scandir(dir_path):
            entry_path = Path(entry.path)
            
            # Skip hidden files/directories and build/deployment folders
            if entry.name.startswith('.') or entry.name in ('parts', 'stage', 'prime', 'build', 'dist', 'venv'):
                continue
                
            is_dir = entry.is_dir()
            size = entry.stat().st_size if not is_dir else None
            
            children = None
            if is_dir:
                children = list_workspace_files(entry_path)
                # Sort folders first, then files alphabetically
                children.sort(key=lambda x: (not x.is_dir, x.name.lower()))
            
            items.append(FileItem(
                name=entry.name,
                path=str(entry_path.resolve()),
                is_dir=is_dir,
                size=size,
                children=children
            ))
    except Exception as e:
        print(f"Error scanning workspace {dir_path}: {e}")
        
    items.sort(key=lambda x: (not x.is_dir, x.name.lower()))
    return items

def read_workspace_file(path: str) -> str:
    """Reads file content from the workspace after verifying path safety."""
    if not is_safe_path(path):
        raise PermissionError("Access denied: File is outside the workspace.")
    
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        return f.read()

def write_workspace_file(path: str, content: str) -> None:
    """Writes file content to the workspace after verifying path safety."""
    if not is_safe_path(path):
        raise PermissionError("Access denied: File is outside the workspace.")
        
    target_path = Path(path)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(target_path, "w", encoding="utf-8") as f:
        f.write(content)

def create_workspace_item(path: str, is_dir: bool, content: str = "") -> str:
    """Creates a file or folder inside the workspace."""
    if not is_safe_path(path):
        raise PermissionError("Access denied: Path is outside the workspace.")
        
    target_path = Path(path)
    if is_dir:
        target_path.mkdir(parents=True, exist_ok=True)
    else:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        if not target_path.exists():
            with open(target_path, "w", encoding="utf-8") as f:
                f.write(content)
    return str(target_path.resolve())

def delete_workspace_item(path: str) -> None:
    """Deletes a file or directory inside the workspace."""
    if not is_safe_path(path):
        raise PermissionError("Access denied: Path is outside the workspace.")
        
    target_path = Path(path)
    if target_path.is_file():
        target_path.unlink()
    elif target_path.is_dir():
        import shutil
        shutil.rmtree(target_path)

def save_session_state(state: SessionState) -> None:
    """Persists the editor state (open tabs, settings, active file)."""
    with open(SESSION_FILE, "w", encoding="utf-8") as f:
        f.write(state.model_dump_json(indent=2))

def load_session_state() -> SessionState:
    """Loads the persisted editor state, falling back to defaults if not found."""
    if not SESSION_FILE.exists():
        return SessionState()
    try:
        with open(SESSION_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            # Filter out non-existent tab files that were deleted
            open_tabs = [p for p in data.get("open_tabs", []) if Path(p).exists()]
            active_tab = data.get("active_tab")
            if active_tab and not Path(active_tab).exists():
                active_tab = open_tabs[0] if open_tabs else None
            
            return SessionState(
                open_tabs=open_tabs,
                active_tab=active_tab,
                compiler_flags=data.get("compiler_flags", []),
                theme=data.get("theme", "midnight-crimson"),
                autosave=data.get("autosave", True)
            )
    except Exception as e:
        print(f"Error loading session: {e}")
        return SessionState()
