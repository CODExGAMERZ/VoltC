import uvicorn
import webbrowser
import threading
import time
import sys

# Ensure PyInstaller bundles these modules
import backend.app
import backend.compiler
import backend.runner
import backend.lsp

# Global flag to open browser fallback if webview fails
USE_BROWSER_FALLBACK = True

def open_browser():
    time.sleep(1.5)
    if USE_BROWSER_FALLBACK:
        print("\n[VoltC] pywebview launcher not active. Launching browser fallback at http://127.0.0.1:5000...")
        webbrowser.open("http://127.0.0.1:5000")

if __name__ == "__main__":
    print("[VoltC] Initializing backend services...")
    reload = "--reload" in sys.argv
    
    try:
        import webview
        # pywebview is installed - run native desktop GUI window instead of a web page
        USE_BROWSER_FALLBACK = False
        
        # Start FastAPI server in a background thread
        # (Must disable reload in thread to prevent uvicorn process restarts)
        server_thread = threading.Thread(
            target=lambda: uvicorn.run("backend.app:app", host="127.0.0.1", port=5000, reload=False),
            daemon=True
        )
        server_thread.start()
        
        # Wait for backend initialization
        time.sleep(1.2)
        
        print("\n[VoltC] Launching native desktop application window...")
        webview.create_window(
            "VoltC IDE",
            "http://127.0.0.1:5000",
            width=1180,
            height=760,
            resizable=True,
            min_size=(900, 600)
        )
        webview.start()
        
    except Exception as e:
        # Fallback to standard web server + default browser tab if webview is unavailable
        USE_BROWSER_FALLBACK = True
        print(f"[VoltC] Webview window unavailable. Starting in web fallback mode. Details: {e}")
        
        threading.Thread(target=open_browser, daemon=True).start()
        
        if 'server_thread' in locals() and server_thread.is_alive():
            # Server is already running in the background thread, keep main thread alive
            try:
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                pass
        else:
            # Server is not running, start it in the main thread
            uvicorn.run("backend.app:app", host="127.0.0.1", port=5000, reload=reload)

