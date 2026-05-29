from pydantic import BaseModel, Field
from typing import List, Optional

class FileItem(BaseModel):
    name: str
    path: str
    is_dir: bool
    size: Optional[int] = None
    children: Optional[List['FileItem']] = None

class FileContentResponse(BaseModel):
    path: str
    content: str
    success: bool
    error: Optional[str] = None

class FileSaveRequest(BaseModel):
    path: str
    content: str

class FileCreateRequest(BaseModel):
    path: str
    is_dir: bool
    content: Optional[str] = ""

class FileDeleteRequest(BaseModel):
    path: str

class CompileRequest(BaseModel):
    path: str
    flags: Optional[List[str]] = None

class CompileResponse(BaseModel):
    success: bool
    stdout: str
    stderr: str
    executable_path: Optional[str] = None
    errors: List[dict] = []

class SessionState(BaseModel):
    open_tabs: List[str] = Field(default_factory=list)
    active_tab: Optional[str] = None
    compiler_flags: List[str] = Field(default_factory=list)
    theme: str = "midnight-crimson"
    autosave: bool = True
