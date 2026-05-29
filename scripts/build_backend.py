import os
import sys
import subprocess
from pathlib import Path

def build():
    print("[VoltC Build] Initiating PyInstaller standalone backend build...")
    
    # Ensure dependencies are installed
    try:
        import PyInstaller
    except ImportError:
        print("[VoltC Build] PyInstaller not found. Installing via pip...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])

    # Determine separator based on OS platform
    sep = ";" if os.name == "nt" else ":"
    
    # Define add-data paths
    # Bundles the static public directory inside the compiled binary
    public_dir = Path("public").resolve()
    add_data_param = f"{public_dir}{sep}public"
    
    # Collect starter templates as well
    templates_dir = Path("templates").resolve()
    add_templates_param = f"{templates_dir}{sep}templates"
    
    args = [
        "server.py",
        "--name=voltc-backend",
        "--onefile",
        f"--add-data={add_data_param}",
        f"--add-data={add_templates_param}",
        "--clean",
        "--noconfirm"
    ]
    
    print(f"[VoltC Build] Running PyInstaller with arguments: {' '.join(args)}")
    
    import PyInstaller.__main__
    PyInstaller.__main__.run(args)
    
    print("[VoltC Build] PyInstaller build completed successfully. Artifact created in dist/")

if __name__ == "__main__":
    build()
