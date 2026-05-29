#!/bin/bash
set -e

echo "========================================="
echo "       ⚡ VoltC C IDE for Ubuntu"
echo "========================================="

# Check dependencies
command -v python3 >/dev/null 2>&1 || { echo "[VoltC] Error: python3 is required. Install with: sudo apt install python3"; exit 1; }
command -v gcc >/dev/null 2>&1 || { echo "[VoltC] Warning: gcc not found. Install with: sudo apt install build-essential"; }

# Install Python dependencies if needed
if ! python3 -c "import fastapi" 2>/dev/null; then
    echo "[VoltC] Installing Python dependencies..."
    pip3 install -r requirements.txt
fi

echo "[VoltC] Starting VoltC IDE..."
python3 server.py "$@"
