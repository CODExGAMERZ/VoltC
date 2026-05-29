<p align="center">
  <strong>⚡ VoltC</strong><br>
  <em>A modern, lightweight, native C programming IDE for Ubuntu Linux</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/language-C%2FC%2B%2B-blue?style=flat-square" alt="Language">
  <img src="https://img.shields.io/badge/platform-Ubuntu%20Linux-orange?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/badge/backend-FastAPI-009688?style=flat-square" alt="Backend">
  <img src="https://img.shields.io/badge/editor-Monaco-blueviolet?style=flat-square" alt="Editor">
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License">
</p>

---

## What is VoltC?

VoltC is a **native desktop IDE** purpose-built for C/C++ development on Ubuntu Linux. It combines a high-performance **FastAPI** backend with Microsoft's **Monaco Editor** (the engine behind VS Code) inside a native **PyWebView** desktop window — no browser required.

VoltC is designed to be the missing middle ground between basic text editors (Nano, Gedit) and heavyweight IDEs (CLion, Eclipse). It's fast, beautiful, and beginner-friendly.

---

## Features

### Editor
- Monaco Editor with full syntax highlighting, minimap, and split-pane editing
- Multi-tab file management with unsaved change indicators
- Keyboard shortcuts: `Ctrl+S` Save, `Ctrl+B` Build, `Ctrl+R` Run, `Ctrl+\` Split
- Autosave recovery via localStorage drafts
- Drag-and-drop file import

### Compiler Integration
- One-click GCC compilation with customizable flags (`-Wall -Wextra -std=c11`)
- Debug and Release build configurations
- **Sandboxed execution** — all compilation runs in isolated temp directories
- Structured error parsing with inline Monaco gutter decorations
- Subprocess timeout protection (10s default) prevents infinite loops

### Live Terminal
- Interactive WebSocket-based terminal with real-time `stdout`/`stderr` streaming
- Send `stdin` input to running programs directly from the IDE
- Process exit code reporting

### Beginner Tools
- **Error Translator** — converts cryptic GCC messages into plain-English explanations
- **Memory Visualizer** — scans your code for variable/pointer declarations and renders a virtual stack diagram
- Starter templates (Hello World, Pointer Demo)

### Developer Experience
- Session persistence — reopens your tabs and settings on restart
- File explorer with inline create/delete/refresh
- Status bar with cursor position, build status, and system metrics
- `clangd` LSP proxy for autocomplete and diagnostics (when installed)

---

## Screenshots

> VoltC launches as a native desktop window — not a browser tab.

---

## Quick Start

### Prerequisites

| Dependency | Install Command |
|---|---|
| Python 3.10+ | `sudo apt install python3 python3-pip` |
| GCC | `sudo apt install build-essential` |
| WebKit GTK (for native window) | `sudo apt install python3-webview` |
| clangd *(optional, for IntelliSense)* | `sudo apt install clangd` |

### Install & Run

```bash
# Clone the repository
git clone https://github.com/CODExGAMERZ/VoltC.git
cd VoltC

# Install Python dependencies
pip3 install -r requirements.txt

# Launch VoltC
python3 server.py
```

VoltC will open as a native desktop window. If `pywebview` is unavailable, it falls back to your default browser at `http://127.0.0.1:5000`.

---

## Project Structure

```
VoltC/
├── backend/                   # FastAPI backend modules
│   ├── __init__.py
│   ├── app.py                 # API routes and static file serving
│   ├── compiler.py            # GCC subprocess runner and error parser
│   ├── runner.py              # WebSocket live execution engine
│   ├── lsp.py                 # clangd Language Server proxy
│   ├── files.py               # Workspace filesystem manager
│   ├── models.py              # Pydantic request/response schemas
│   └── config.py              # Runtime configuration
├── public/                    # Frontend assets
│   ├── index.html             # IDE layout
│   ├── style.css              # Midnight Crimson theme
│   └── app.js                 # Editor controller and WebSocket client
├── templates/                 # Starter C code templates
│   ├── hello.c
│   └── pointer_demo.c
├── snap/                      # Snapcraft packaging
│   └── snapcraft.yaml
├── scripts/                   # Build and packaging scripts
│   ├── build_backend.py       # PyInstaller bundler
│   └── package_linux.sh       # .deb, AppImage, and Snap builder
├── server.py                  # Application entry point
├── requirements.txt           # Python dependencies
├── run.sh                     # Linux launcher
├── run.bat                    # Windows launcher
├── LICENSE                    # MIT License
└── README.md
```

---

## Distribution

### Install via Snap (Ubuntu)

```bash
sudo snap install voltc
```

### Build from Source

#### Standalone Binary (PyInstaller)
```bash
python3 scripts/build_backend.py
# Output: dist/voltc-backend
```

#### Debian Package (.deb)
```bash
bash scripts/package_linux.sh
# Output: voltc_1.0_amd64.deb
sudo dpkg -i voltc_1.0_amd64.deb
```

#### Snap Package
```bash
cd snap && snapcraft
# Output: voltc_1.0_amd64.snap
sudo snap install voltc_1.0_amd64.snap --classic
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3, FastAPI, Uvicorn, WebSockets |
| Editor | Monaco Editor (CDN) |
| Desktop Shell | PyWebView (GTK WebKit on Linux) |
| Compiler | GCC, clangd (optional) |
| Styling | Vanilla CSS, Google Fonts |
| Packaging | PyInstaller, dpkg, Snapcraft, appimagetool |

---

## Roadmap

- [x] Monaco Editor + multi-tab editing
- [x] File explorer with create/delete/drag-drop
- [x] GCC compilation in sandboxed temp directories
- [x] WebSocket live terminal streaming
- [x] Error parser + beginner translator
- [x] Session persistence and autosave recovery
- [x] Native desktop window (PyWebView)
- [x] Snap, .deb, and AppImage packaging scripts
- [ ] Git integration
- [ ] Cloud sync and collaborative editing
- [ ] Plugin marketplace
- [ ] Tauri desktop wrapper (Rust)

---

## Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Built with ⚡ by the VoltC team
</p>
