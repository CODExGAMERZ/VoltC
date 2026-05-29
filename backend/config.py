import os
from pathlib import Path

# Workspace settings - dynamically set from environment variable or current directory
WORKSPACE_DIR = Path(os.environ.get("VOLTC_WORKSPACE", os.getcwd())).resolve()

# Default compile flags
DEFAULT_CFLAGS = ["-Wall", "-Wextra", "-std=c11"]

# Subprocess timeouts (in seconds) to prevent infinite loops
EXECUTION_TIMEOUT = 10.0

# Supported C/C++ extensions
SUPPORTED_EXTENSIONS = {".c", ".cpp", ".h", ".hpp"}

# Host detection for compiler selection and packaging
IS_WINDOWS = os.name == "nt"
