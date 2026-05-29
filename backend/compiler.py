import os
import re
import asyncio
import tempfile
import logging
from pathlib import Path
from typing import List, Optional
from backend.config import DEFAULT_CFLAGS, IS_WINDOWS
from backend.models import CompileResponse

logger = logging.getLogger("voltc-compiler")

# Regex to match GCC compiler warning/error lines:
# e.g., "C:\path\to\file.c:12:5: error: expected ';' before 'return'"
DIAGNOSTIC_PATTERN = re.compile(
    r"^(.+?):(\d+):(\d+):\s+(error|warning|note):\s+(.+)$", 
    re.MULTILINE
)

async def compile_c_file(file_path: str, custom_flags: Optional[List[str]] = None) -> CompileResponse:
    """Compiles a C file in an isolated temporary directory, parsing all errors and warnings."""
    path = Path(file_path).resolve()
    if not path.exists():
        return CompileResponse(
            success=False,
            stdout="",
            stderr=f"Error: File '{file_path}' does not exist.",
            errors=[{"line": 1, "col": 1, "type": "error", "message": "File not found."}]
        )

    # Prepare compilation flags
    flags = custom_flags if custom_flags is not None else DEFAULT_CFLAGS
    # Sanitize flags to prevent command injections
    sanitized_flags = [f for f in flags if f.startswith("-")]

    # Create isolated temp directory for compiler artifacts
    temp_dir = tempfile.TemporaryDirectory()
    temp_path = Path(temp_dir.name)
    
    # We name the output binary based on the source file name
    output_bin_name = path.stem + (".exe" if IS_WINDOWS else "")
    output_bin_path = temp_path / output_bin_name
    
    # Target C file copy to temp path to achieve build isolation (prevents folder pollution)
    temp_src_path = temp_path / path.name
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as sf:
            temp_src_content = sf.read()
        with open(temp_src_path, "w", encoding="utf-8") as tf:
            tf.write(temp_src_content)
    except Exception as e:
        temp_dir.cleanup()
        return CompileResponse(
            success=False,
            stdout="",
            stderr=f"Failed to isolate file: {e}",
            errors=[]
        )

    # Construct arguments
    # gcc temp_src -o temp_bin flags...
    cmd_args = ["gcc", str(temp_src_path.resolve()), "-o", str(output_bin_path.resolve())] + sanitized_flags
    logger.info(f"Invoking compiler: {' '.join(cmd_args)}")

    try:
        # Run compiler subprocess asynchronously
        process = await asyncio.create_subprocess_exec(
            cmd_args[0],
            *cmd_args[1:],
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout_bytes, stderr_bytes = await process.communicate()
        stdout = stdout_bytes.decode("utf-8", errors="replace")
        stderr = stderr_bytes.decode("utf-8", errors="replace")
        exit_code = process.returncode

        # Parse diagnostics
        errors = []
        for match in DIAGNOSTIC_PATTERN.finditer(stderr):
            # The matches contain: 1=file, 2=line, 3=col, 4=type (error/warning), 5=message
            err_line = int(match.group(2))
            err_col = int(match.group(3))
            err_type = match.group(4)
            err_msg = match.group(5)
            
            errors.append({
                "line": err_line,
                "col": err_col,
                "type": err_type,
                "message": err_msg
            })

        success = exit_code == 0
        
        # Keep temp directory alive if compile succeeded (so we can run the binary from there),
        # but store its reference in a global runner registry or compile cache so we can clean it up later.
        # For simplicity, we write the executable back to a subfolder ".voltc/bin/" in workspace 
        # to ensure it's run cleanly while maintaining workspace isolation, and clean up temp_dir immediately.
        bin_target_dir = path.parent / ".voltc_bin"
        bin_target_dir.mkdir(parents=True, exist_ok=True)
        final_executable = bin_target_dir / output_bin_name
        
        if success and output_bin_path.exists():
            # Copy output binary to workspace build folder
            import shutil
            shutil.copy2(output_bin_path, final_executable)
            logger.info(f"Compiled binary moved to {final_executable}")
            exec_path_str = str(final_executable.resolve())
        else:
            exec_path_str = None

        temp_dir.cleanup()
        
        return CompileResponse(
            success=success,
            stdout=stdout,
            stderr=stderr,
            executable_path=exec_path_str,
            errors=errors
        )
        
    except Exception as e:
        temp_dir.cleanup()
        logger.error(f"GCC execution failed: {e}")
        return CompileResponse(
            success=False,
            stdout="",
            stderr=f"GCC error: GCC compiler not found in system PATH. Install build-essential or MinGW. Details: {e}",
            errors=[]
        )
