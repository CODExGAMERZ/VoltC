#!/bin/bash
# VoltC Linux Packaging Coordinator (.deb, AppImage, Snapcraft)

set -e

echo "=== VoltC IDE Ubuntu Linux Packaging System ==="

# 1. COMPILE BACKEND BINARY
echo "[VoltC Packager] Compiling standalone backend executable..."
python3 -m venv --system-site-packages venv
./venv/bin/pip install pyinstaller fastapi uvicorn websockets pywebview
./venv/bin/python scripts/build_backend.py

# Ensure build artifacts exist
if [ ! -f "dist/voltc-backend" ]; then
    echo "[VoltC Error] Compilation failed! dist/voltc-backend not found."
    exit 1
fi

# 2. BUILD DEBIAN PACKAGE (.deb)
echo "[VoltC Packager] Preparing Debian package file structures..."
DEB_DIR="build/voltc_1.0_amd64"
rm -rf "$DEB_DIR"
mkdir -p "$DEB_DIR/DEBIAN"
mkdir -p "$DEB_DIR/usr/bin"
mkdir -p "$DEB_DIR/usr/share/applications"
mkdir -p "$DEB_DIR/usr/share/pixmaps"

# Write Control file
cat <<EOT > "$DEB_DIR/DEBIAN/control"
Package: voltc
Version: 1.0
Section: devel
Priority: optional
Architecture: amd64
Depends: libc6, gcc, clangd, python3-webview
Maintainer: VoltC Developers <support@voltc.org>
Description: VoltC C IDE
 A lightweight, modern, and beginner-friendly C programming IDE.
 Features Monaco Editor, isolated GCC compile/run processes,
 and custom memory debugger visualizations.
EOT

# Copy executable
cp dist/voltc-backend "$DEB_DIR/usr/bin/voltc"
chmod +x "$DEB_DIR/usr/bin/voltc"

# Write Desktop launcher
cat <<EOT > "$DEB_DIR/usr/share/applications/voltc.desktop"
[Desktop Entry]
Name=VoltC IDE
Comment=Modern C Programming Environment
Exec=voltc
Icon=voltc
Terminal=false
Type=Application
Categories=Development;IDE;C;
MimeType=text/x-csrc;text/x-chdr;text/x-c++src;
EOT

# Create a placeholder icon
echo "Creating dummy icon..."
touch "$DEB_DIR/usr/share/pixmaps/voltc.png"

# Package Debian package
echo "[VoltC Packager] Compiling debian binary package..."
dpkg-deb --build "$DEB_DIR" voltc_1.0_amd64.deb
echo "[VoltC Packager] Debian package successfully created: voltc_1.0_amd64.deb"

# 3. SNAP CONFIGURATION
echo "[VoltC Packager] Creating snapcraft.yaml deployment descriptor..."
mkdir -p build/snap/snap
cat <<EOT > build/snap/snap/snapcraft.yaml
name: voltc
version: '1.0'
summary: VoltC C programming IDE
description: |
  VoltC is a modern, lightweight C programming environment specifically
  engineered for students and beginners. Built on top of FastAPI
  and Monaco Editor, it features isolated compilation, live output streams,
  and variable memory map visualizers.
grade: stable
confinement: classic # Needs filesystem and compiler command executions
base: core24

parts:
  voltc-bin:
    plugin: dump
    source: dist/
    organize:
      voltc-backend: bin/voltc

apps:
  voltc:
    command: bin/voltc
    plugs: [home, network, network-bind]
EOT

echo "[VoltC Packager] Snapcraft setup generated in build/snap/. Run 'snapcraft' to compile snap package."

# 4. APPIMAGE DOCUMENTATION & LAYOUT
echo "[VoltC Packager] Preparing AppImage AppDir structure..."
APPDIR="build/VoltC.AppDir"
rm -rf "$APPDIR"
mkdir -p "$APPDIR/usr/bin"
mkdir -p "$APPDIR/usr/share/applications"

cp dist/voltc-backend "$APPDIR/usr/bin/voltc"
cp "$DEB_DIR/usr/share/applications/voltc.desktop" "$APPDIR/"
touch "$APPDIR/voltc.png"

# AppRun script launcher
cat <<EOT > "$APPDIR/AppRun"
#!/bin/sh
SELF=\$(readlink -f "\$0")
HERE=\$(dirname "\$SELF")
exec "\$HERE/usr/bin/voltc" "\$@"
EOT
chmod +x "$APPDIR/AppRun"

echo "[VoltC Packager] AppDir compiled. Download 'appimagetool' and run: 'appimagetool $APPDIR' to package AppImage."
echo "=== Packaging Complete ==="
