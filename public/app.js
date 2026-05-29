// VoltC Frontend Controller

let monacoLoaded = false;
let editorLeft = null;
let editorRight = null;
let activeEditor = null; // References currently focused editor (left or right)
let openTabs = []; // Array of { path, name, isUnsaved }
let activeTabPath = null;
let fileCache = {}; // Cache of { path: { content, originalContent } }
let runSocket = null;
let activeWorkspace = null;

// Mock environment resource statistics
let cpuUsage = 2;
let ramUsage = 38;

async function fetchConfig() {
    try {
        const res = await fetch('/api/config');
        const data = await res.json();
        activeWorkspace = data.workspace_dir;
    } catch (e) {
        console.error("Error fetching config:", e);
        activeWorkspace = "";
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    await fetchConfig();
    initLayout();
    initMonaco();
    initFileTreeActions();
    initTemplateSelection();
    startAutosaveTimer();
    startStatsPoller();
});

/* =========================================================================
   1. LAYOUT & RESIZING SETUP
   ========================================================================= */
function initLayout() {
    const sidebar = document.getElementById('sidebar');
    const sidebarResizer = document.getElementById('sidebar-resizer');
    const bottomPanel = document.getElementById('bottom-panel');
    const bottomResizer = document.getElementById('bottom-resizer');
    const rightDrawer = document.getElementById('right-drawer');
    const rightResizer = document.getElementById('right-resizer');
    
    // Sidebar Resizer
    sidebarResizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        document.body.classList.add('resizing');
        document.addEventListener('mousemove', resizeSidebar);
        document.addEventListener('mouseup', stopResizeSidebar);
    });

    function resizeSidebar(e) {
        let width = e.clientX;
        if (width < 150) width = 150;
        if (width > 400) width = 400;
        document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
        if (editorLeft) editorLeft.layout();
        if (editorRight) editorRight.layout();
    }

    function stopResizeSidebar() {
        document.body.classList.remove('resizing');
        document.removeEventListener('mousemove', resizeSidebar);
        document.removeEventListener('mouseup', stopResizeSidebar);
    }

    // Bottom Panel Resizer
    bottomResizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        document.body.classList.add('resizing-h');
        document.addEventListener('mousemove', resizeBottomPanel);
        document.addEventListener('mouseup', stopResizeBottomPanel);
    });

    function resizeBottomPanel(e) {
        let height = window.innerHeight - e.clientY;
        if (height < 40) height = 40;
        if (height > 500) height = 500;
        document.documentElement.style.setProperty('--bottom-panel-height', `${height}px`);
        if (editorLeft) editorLeft.layout();
        if (editorRight) editorRight.layout();
    }

    function stopResizeBottomPanel() {
        document.body.classList.remove('resizing-h');
        document.removeEventListener('mousemove', resizeBottomPanel);
        document.removeEventListener('mouseup', stopResizeBottomPanel);
    }

    // Right Drawer Resizer
    rightResizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        document.body.classList.add('resizing');
        document.addEventListener('mousemove', resizeRightDrawer);
        document.addEventListener('mouseup', stopResizeRightDrawer);
    });

    function resizeRightDrawer(e) {
        let width = window.innerWidth - e.clientX;
        if (width < 200) width = 200;
        if (width > 500) width = 500;
        document.documentElement.style.setProperty('--right-drawer-width', `${width}px`);
        if (editorLeft) editorLeft.layout();
        if (editorRight) editorRight.layout();
    }

    function stopResizeRightDrawer() {
        document.body.classList.remove('resizing');
        document.removeEventListener('mousemove', resizeRightDrawer);
        document.removeEventListener('mouseup', stopResizeRightDrawer);
    }

    // Right Drawer Toggle
    document.getElementById('btn-toggle-drawer').addEventListener('click', () => {
        const drawer = document.getElementById('right-drawer');
        const resizer = document.getElementById('right-resizer');
        if (drawer.style.display === 'none') {
            drawer.style.display = 'flex';
            resizer.style.display = 'block';
            document.documentElement.style.setProperty('--right-drawer-width', '320px');
            document.getElementById('btn-toggle-drawer').innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
        } else {
            drawer.style.display = 'none';
            resizer.style.display = 'none';
            document.documentElement.style.setProperty('--right-drawer-width', '0px');
            document.getElementById('btn-toggle-drawer').innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
        }
        setTimeout(() => {
            if (editorLeft) editorLeft.layout();
            if (editorRight) editorRight.layout();
        }, 50);
    });

    // Panel tabs switching
    const tabBtns = document.querySelectorAll('.panel-tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.panel-content').forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            const targetId = btn.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');
        });
    });

    // Split editor layout action
    document.getElementById('btn-split-editor').addEventListener('click', toggleSplitEditor);

    // Main buttons binding
    document.getElementById('btn-save').addEventListener('click', () => triggerSave());
    document.getElementById('btn-compile').addEventListener('click', () => triggerCompile());
    document.getElementById('btn-run').addEventListener('click', () => triggerRun());
    document.getElementById('btn-settings').addEventListener('click', async () => {
        await customAlert("VoltC IDE v1.0\nSettings are saved automatically in .voltc/session.json", "VoltC Settings");
    });

    // GCC custom compile flags change handler
    document.getElementById('compiler-flags').addEventListener('change', () => {
        saveSessionToBackend();
    });
    document.getElementById('build-config').addEventListener('change', () => {
        saveSessionToBackend();
    });

    // Keyboard Shortcuts binding
    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            triggerSave();
        }
        if (e.ctrlKey && e.key === 'b') {
            e.preventDefault();
            triggerCompile();
        }
        if (e.ctrlKey && e.key === 'r') {
            e.preventDefault();
            triggerRun();
        }
        if (e.ctrlKey && e.key === '\\') {
            e.preventDefault();
            toggleSplitEditor();
        }
    });

    // Setup terminal enter action
    const terminalInput = document.getElementById('terminal-input');
    terminalInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            sendTerminalInput();
        }
    });
}

function updateModeStatus(mode, labelClass) {
    const statusMode = document.getElementById('status-mode');
    statusMode.className = labelClass;
    statusMode.innerHTML = `<i class="fa-solid fa-circle"></i> ${mode}`;
}

/* =========================================================================
   2. MONACO EDITOR SETUP
   ========================================================================= */
function initMonaco() {
    require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.48.0/min/vs' }});
    require(['vs/editor/editor.main'], function() {
        monacoLoaded = true;

        // Custom Midnight Crimson Monaco Theme definition
        monaco.editor.defineTheme('midnight-crimson', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { token: 'comment', foreground: '556655', fontStyle: 'italic' },
                { token: 'keyword', foreground: 'ff2a5f', fontStyle: 'bold' },
                { token: 'number', foreground: 'a78bfa' },
                { token: 'string', foreground: '34d399' },
                { token: 'type', foreground: '60a5fa', fontStyle: 'bold' },
                { token: 'preprocessor', foreground: 'f59e0b' }
            ],
            colors: {
                'editor.background': '#0c0c0f',
                'editor.foreground': '#f3f4f6',
                'editor.lineHighlightBackground': '#181824',
                'editorLineNumber.foreground': '#555566',
                'editorLineNumber.activeForeground': '#ff2a5f',
                'editor.selectionBackground': '#ff2a5f33',
                'editor.inactiveSelectionBackground': '#ff2a5f1a'
            }
        });

        // Editor left instance
        editorLeft = monaco.editor.create(document.getElementById('editor-left'), {
            value: '/* Welcome to VoltC IDE.\n   Create or open a C file from the File Explorer\n   to start coding. */\n',
            language: 'c',
            theme: 'midnight-crimson',
            automaticLayout: true,
            fontSize: 13,
            fontFamily: "'JetBrains Mono', monospace",
            minimap: { enabled: true },
            tabSize: 4,
            roundedSelection: true,
            scrollBeyondLastLine: false,
            cursorBlinking: "smooth"
        });

        // Editor right instance
        editorRight = monaco.editor.create(document.getElementById('editor-right'), {
            value: '',
            language: 'c',
            theme: 'midnight-crimson',
            automaticLayout: true,
            fontSize: 13,
            fontFamily: "'JetBrains Mono', monospace",
            minimap: { enabled: false },
            tabSize: 4,
            roundedSelection: true,
            scrollBeyondLastLine: false,
            cursorBlinking: "smooth"
        });

        activeEditor = editorLeft;

        // Sync updates on focus
        editorLeft.onDidFocusEditorWidget(() => { activeEditor = editorLeft; });
        editorRight.onDidFocusEditorWidget(() => { activeEditor = editorRight; });

        // Add value change listeners to flag changes
        editorLeft.onDidChangeModelContent(() => {
            handleEditorContentChange(editorLeft);
        });
        editorRight.onDidChangeModelContent(() => {
            handleEditorContentChange(editorRight);
        });

        // Add cursor position listener for status bar updates
        editorLeft.onDidChangeCursorPosition(e => updateCursorStatus(e.position));
        editorRight.onDidChangeCursorPosition(e => updateCursorStatus(e.position));

        // Load Session state from backend
        loadSessionFromBackend();
    });
}

function handleEditorContentChange(editor) {
    if (!activeTabPath) return;
    const currentVal = editor.getValue();
    const cache = fileCache[activeTabPath];
    if (cache) {
        cache.content = currentVal;
        const wasUnsaved = cache.isUnsaved;
        cache.isUnsaved = currentVal !== cache.originalContent;
        
        if (wasUnsaved !== cache.isUnsaved) {
            updateTabListUI();
        }
    }
    // Update pointer visualization on content change (simple scanner)
    updatePointerVisualizer(currentVal);
}

function updateCursorStatus(position) {
    document.getElementById('status-cursor').innerText = `Ln ${position.lineNumber}, Col ${position.column}`;
}

function toggleSplitEditor() {
    const rightWrapper = document.getElementById('editor-wrapper-right');
    if (rightWrapper.classList.contains('hidden')) {
        rightWrapper.classList.remove('hidden');
        document.getElementById('btn-split-editor').classList.add('crimson-text');
        
        // Copy current file to the right editor as well
        if (activeTabPath && fileCache[activeTabPath]) {
            const model = activeEditor.getModel();
            editorRight.setModel(model);
        }
    } else {
        rightWrapper.classList.add('hidden');
        document.getElementById('btn-split-editor').classList.remove('crimson-text');
        activeEditor = editorLeft;
    }
    setTimeout(() => {
        if (editorLeft) editorLeft.layout();
        if (editorRight) editorRight.layout();
    }, 50);
}

/* =========================================================================
   3. FILES & WORKSPACE INTEGRATION
   ========================================================================= */
function initFileTreeActions() {
    // Top-right Refresh
    document.getElementById('btn-refresh-explorer').addEventListener('click', () => {
        fetchFilesList();
    });

    // Create file
    document.getElementById('btn-new-file').addEventListener('click', async () => {
        const filename = await customPrompt("Enter new C/C++ file name:", "untitled.c", "New File");
        if (!filename) return;
        
        // Safety check extension
        const targetPath = filename.includes('/') || filename.includes('\\') 
            ? filename 
            : `${activeWorkspace}/${filename}`;
        
        await createWorkspaceItemAPI(targetPath, false);
    });

    // Create folder
    document.getElementById('btn-new-folder').addEventListener('click', async () => {
        const foldername = await customPrompt("Enter new folder name:", "untitled_folder", "New Folder");
        if (!foldername) return;
        const targetPath = `${activeWorkspace}/${foldername}`;
        await createWorkspaceItemAPI(targetPath, true);
    });

    // Setup Drag-and-drop workspace triggers
    const appEl = document.querySelector('.app-container');
    
    appEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        appEl.classList.add('drag-active');
    });

    appEl.addEventListener('dragleave', (e) => {
        e.preventDefault();
        appEl.classList.remove('drag-active');
    });

    appEl.addEventListener('drop', async (e) => {
        e.preventDefault();
        appEl.classList.remove('drag-active');
        
        const files = e.dataTransfer.files;
        if (files.length === 0) return;

        for (let file of files) {
            const reader = new FileReader();
            reader.onload = async function(event) {
                const content = event.target.result;
                const path = `${activeWorkspace}/${file.name}`;
                await createWorkspaceItemAPI(path, false, content);
            };
            reader.readAsText(file);
        }
    });

    fetchFilesList();
}

async function fetchFilesList() {
    const treeEl = document.getElementById('file-tree');
    try {
        const res = await fetch('/api/files');
        const fileItems = await res.json();
        renderFileTree(fileItems, treeEl);
    } catch (e) {
        console.error("Error fetching files:", e);
        treeEl.innerHTML = `<div class="error-line">Failed to load workspace files.</div>`;
    }
}

function renderFileTree(items, container, depth = 0) {
    if (depth === 0) container.innerHTML = '';
    
    items.forEach(item => {
        const node = document.createElement('div');
        node.className = 'tree-node';
        
        const row = document.createElement('div');
        row.className = 'tree-row';
        if (activeTabPath === item.path) {
            row.classList.add('active');
        }
        row.style.paddingLeft = `${depth * 12 + 6}px`;

        // Arrow for folders
        const arrow = document.createElement('span');
        arrow.className = 'tree-arrow';
        if (item.is_dir) {
            arrow.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
        }
        row.appendChild(arrow);

        // Icon
        const icon = document.createElement('span');
        icon.className = 'tree-icon';
        if (item.is_dir) {
            icon.innerHTML = '<i class="fa-solid fa-folder tree-icon-folder"></i>';
        } else {
            if (item.name.endsWith('.c') || item.name.endsWith('.cpp')) {
                icon.innerHTML = '<i class="fa-solid fa-file-code tree-icon-c"></i>';
            } else if (item.name.endsWith('.h') || item.name.endsWith('.hpp')) {
                icon.innerHTML = '<i class="fa-solid fa-file-shield crimson-text"></i>';
            } else {
                icon.innerHTML = '<i class="fa-solid fa-file tree-icon-file"></i>';
            }
        }
        row.appendChild(icon);

        // Name
        const name = document.createElement('span');
        name.className = 'tree-name';
        name.innerText = item.name;
        row.appendChild(name);

        // Delete button
        const delBtn = document.createElement('span');
        delBtn.className = 'explorer-actions';
        delBtn.innerHTML = `<button class="btn-del-file" title="Delete"><i class="fa-solid fa-trash"></i></button>`;
        delBtn.style.opacity = '0';
        row.appendChild(delBtn);

        row.addEventListener('mouseenter', () => { delBtn.style.opacity = '1'; });
        row.addEventListener('mouseleave', () => { delBtn.style.opacity = '0'; });

        // Delete event
        delBtn.querySelector('button').addEventListener('click', async (e) => {
            e.stopPropagation();
            const confirmed = await customConfirm(`Are you sure you want to delete ${item.name}?`, "Delete Item");
            if (confirmed) {
                await deleteWorkspaceItemAPI(item.path);
            }
        });

        node.appendChild(row);

        // Sub tree container
        if (item.is_dir && item.children) {
            const subContainer = document.createElement('div');
            subContainer.style.display = 'none';
            node.appendChild(subContainer);
            
            renderFileTree(item.children, subContainer, depth + 1);
            
            row.addEventListener('click', () => {
                const isExpanded = node.classList.toggle('expanded');
                subContainer.style.display = isExpanded ? 'block' : 'none';
            });
        } else {
            row.addEventListener('click', () => {
                selectFileTab(item.path, item.name);
            });
        }

        container.appendChild(node);
    });
}

async function selectFileTab(path, name) {
    if (!monacoLoaded) return;
    
    // Add file to tabs if not already present
    if (!openTabs.some(t => t.path === path)) {
        openTabs.push({ path, name, isUnsaved: false });
        
        // Fetch content if not in cache
        if (!fileCache[path]) {
            try {
                const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
                const data = await res.json();
                if (data.success) {
                    fileCache[path] = {
                        content: data.content,
                        originalContent: data.content,
                        isUnsaved: false
                    };
                }
            } catch (e) {
                console.error("Error opening file:", e);
                return;
            }
        }
    }
    
    activeTabPath = path;
    
    // Check local storage draft backup
    const draft = localStorage.getItem(`voltc_draft_${path}`);
    if (draft && draft !== fileCache[path].content) {
        const restore = await customConfirm("VoltC detected an unsaved local backup for this file. Would you like to restore it?", "Backup Detected");
        if (restore) {
            fileCache[path].content = draft;
            fileCache[path].isUnsaved = true;
        } else {
            localStorage.removeItem(`voltc_draft_${path}`);
        }
    }

    // Update Monaco editor model
    const fileModel = monaco.editor.createModel(fileCache[path].content, getLanguageFromExtension(name));
    
    activeEditor.setModel(fileModel);
    
    // If split pane is active, mirror it
    const rightWrapper = document.getElementById('editor-wrapper-right');
    if (!rightWrapper.classList.contains('hidden')) {
        editorRight.setModel(fileModel);
    }
    
    document.getElementById('status-file-path').innerText = path;
    
    updateTabListUI();
    fetchFilesList();
    saveSessionToBackend();
    
    // Read pointer visuals
    updatePointerVisualizer(fileCache[path].content);
}

function getLanguageFromExtension(name) {
    if (name.endsWith('.cpp') || name.endsWith('.hpp')) return 'cpp';
    if (name.endsWith('.c') || name.endsWith('.h')) return 'c';
    return 'plaintext';
}

function updateTabListUI() {
    const container = document.getElementById('tabs-container');
    container.innerHTML = '';
    
    openTabs.forEach(tab => {
        const tabEl = document.createElement('div');
        tabEl.className = 'tab';
        if (tab.path === activeTabPath) tabEl.classList.add('active');
        
        // Name
        const nameEl = document.createElement('span');
        nameEl.innerText = tab.name;
        nameEl.addEventListener('click', () => selectFileTab(tab.path, tab.name));
        tabEl.appendChild(nameEl);

        // Unsaved mark
        if (fileCache[tab.path] && fileCache[tab.path].isUnsaved) {
            const mark = document.createElement('span');
            mark.className = 'tab-unsaved-indicator';
            tabEl.appendChild(mark);
        }

        // Close button
        const closeBtn = document.createElement('span');
        closeBtn.className = 'tab-close';
        closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        closeBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await closeTab(tab.path);
        });
        tabEl.appendChild(closeBtn);
        
        container.appendChild(tabEl);
    });
}

async function closeTab(path) {
    const cache = fileCache[path];
    if (cache && cache.isUnsaved) {
        const discard = await customConfirm("This file has unsaved changes. Discard them?", "Unsaved Changes");
        if (!discard) return;
    }
    
    // Clear drafts
    localStorage.removeItem(`voltc_draft_${path}`);
    
    openTabs = openTabs.filter(t => t.path !== path);
    if (activeTabPath === path) {
        if (openTabs.length > 0) {
            const nextTab = openTabs[0];
            await selectFileTab(nextTab.path, nextTab.name);
        } else {
            activeTabPath = null;
            document.getElementById('status-file-path').innerText = "No file open";
            activeEditor.setValue('/* Welcome to VoltC IDE.\n   Create or open a C file from the File Explorer\n   to start coding. */\n');
        }
    }
    updateTabListUI();
    await saveSessionToBackend();
}

async function triggerSave() {
    if (!activeTabPath || !fileCache[activeTabPath]) return;
    
    updateModeStatus("Saving...", "status-indicator-compiling");
    const content = activeEditor.getValue();
    try {
        const res = await fetch('/api/file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: activeTabPath, content })
        });
        const data = await res.json();
        if (data.success) {
            fileCache[activeTabPath].originalContent = content;
            fileCache[activeTabPath].isUnsaved = false;
            localStorage.removeItem(`voltc_draft_${activeTabPath}`);
            updateTabListUI();
            updateModeStatus("Saved", "status-indicator-idle");
            setTimeout(() => updateModeStatus("Ready", "status-indicator-idle"), 1500);
        }
    } catch (e) {
        console.error("Save error:", e);
        updateModeStatus("Save Failed", "status-indicator-error");
    }
}

async function createWorkspaceItemAPI(path, isDir, content = "") {
    try {
        const res = await fetch('/api/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, is_dir: isDir, content })
        });
        const data = await res.json();
        if (data.success) {
            await fetchFilesList();
            if (!isDir) {
                const name = path.substring(path.lastIndexOf('/') + 1);
                selectFileTab(data.path, name);
            }
        }
    } catch (e) {
        await customAlert("Error creating file/folder: " + e.message, "Creation Error");
    }
}

async function deleteWorkspaceItemAPI(path) {
    try {
        const res = await fetch('/api/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });
        const data = await res.json();
        if (data.success) {
            // Close tab if deleted
            if (openTabs.some(t => t.path === path)) {
                openTabs = openTabs.filter(t => t.path !== path);
                if (activeTabPath === path) {
                    activeTabPath = null;
                    activeEditor.setValue('/* Welcome to VoltC IDE. */');
                }
                updateTabListUI();
            }
            await fetchFilesList();
        }
    } catch (e) {
        await customAlert("Error deleting: " + e.message, "Deletion Error");
    }
}

/* =========================================================================
   4. COMPILATION SYSTEM & DIAGNOSTICS PARSING
   ========================================================================= */
async function triggerCompile() {
    if (!activeTabPath) {
        await customAlert("Please open a file to compile.", "Compile Warning");
        return;
    }
    
    // Save first
    await triggerSave();
    
    updateModeStatus("Compiling...", "status-indicator-compiling");
    appendTerminalLine("system", `[VoltC Build] Starting compilation for: ${activeTabPath}`);
    
    const customFlags = document.getElementById('compiler-flags').value.split(' ').filter(f => f.trim() !== '');
    const buildConfig = document.getElementById('build-config').value;
    
    // Merge flags
    const finalFlags = [...customFlags];
    if (buildConfig === 'debug') finalFlags.push('-g');
    if (buildConfig === 'release') finalFlags.push('-O2');
    
    try {
        const res = await fetch('/api/compile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: activeTabPath, flags: finalFlags })
        });
        const data = await res.json();
        
        appendTerminalLine("system", data.stdout);
        if (data.stderr) {
            appendTerminalLine("error", data.stderr);
        }
        
        renderDiagnostics(data.errors);
        
        if (data.success) {
            appendTerminalLine("system", `[VoltC Build] Compilation SUCCESSFUL.`);
            updateModeStatus("Build Succeeded", "status-indicator-running");
            setTimeout(() => updateModeStatus("Ready", "status-indicator-idle"), 2000);
        } else {
            appendTerminalLine("error", `[VoltC Build] Compilation FAILED.`);
            updateModeStatus("Build Failed", "status-indicator-error");
            
            // Switch bottom panel to Problems tab automatically if failures exist
            if (data.errors.length > 0) {
                const problemsBtn = document.querySelector('.panel-tab-btn[data-target="panel-problems"]');
                if (problemsBtn) problemsBtn.click();
            }
        }
    } catch (e) {
        appendTerminalLine("error", `[VoltC Build Error] Compilation API failure: ${e.message}`);
        updateModeStatus("API Failure", "status-indicator-error");
    }
}

// Renders red/yellow waves in editor gutter and compiles problems list
let editorDecorationsLeft = [];
let editorDecorationsRight = [];

function renderDiagnostics(errors) {
    const listEl = document.getElementById('problems-list');
    const badgeEl = document.getElementById('problems-count');
    
    listEl.innerHTML = '';
    
    if (errors.length === 0) {
        listEl.innerHTML = `<div class="empty-state">No diagnostics available. Compile your code to view problems.</div>`;
        badgeEl.classList.add('hidden');
        badgeEl.innerText = "0";
        
        // Clear editor marks
        if (editorLeft) editorDecorationsLeft = editorLeft.deltaDecorations(editorDecorationsLeft, []);
        if (editorRight) editorDecorationsRight = editorRight.deltaDecorations(editorDecorationsRight, []);
        return;
    }

    badgeEl.classList.remove('hidden');
    badgeEl.innerText = errors.length;
    
    const decorations = [];
    
    errors.forEach(err => {
        const row = document.createElement('div');
        row.className = `problem-row ${err.type}`;
        
        const icon = err.type === 'error' 
            ? '<i class="fa-solid fa-circle-xmark problem-icon-error"></i>' 
            : '<i class="fa-solid fa-triangle-exclamation problem-icon-warning"></i>';
            
        row.innerHTML = `
            ${icon}
            <span class="problem-loc">Line ${err.line}, Col ${err.col}:</span>
            <span class="problem-msg">${err.message}</span>
        `;
        
        // Clicking row jumps editor to error coordinates
        row.addEventListener('click', () => {
            if (activeEditor) {
                activeEditor.setPosition({ lineNumber: err.line, column: err.col });
                activeEditor.revealLineInCenter(err.line);
                activeEditor.focus();
                
                // Fetch beginner explanation automatically
                fetchBeginnerExplanation(err.message, err.line);
            }
        });
        
        listEl.appendChild(row);

        // Map decorations
        decorations.push({
            range: new monaco.Range(err.line, err.col, err.line, err.col + 5),
            options: {
                isWholeLine: false,
                glyphMarginClassName: err.type === 'error' ? 'gutter-error-icon' : 'gutter-warning-icon',
                inlineClassName: err.type === 'error' ? 'inline-error-underline' : 'inline-warning-underline',
                hoverMessage: { value: `**VoltC Diagnostic [${err.type.toUpperCase()}]**\n${err.message}` }
            }
        });
    });

    // Apply decorations
    if (editorLeft) {
        editorDecorationsLeft = editorLeft.deltaDecorations(editorDecorationsLeft, decorations);
    }
    if (editorRight) {
        editorDecorationsRight = editorRight.deltaDecorations(editorDecorationsRight, decorations);
    }
}

/* =========================================================================
   5. BEGINNER ERROR TRANSLATOR
   ========================================================================= */
function fetchBeginnerExplanation(message, line) {
    const explainEl = document.getElementById('explanation-content');
    explainEl.innerHTML = '<div class="loading-spinner"><i class="fa-solid fa-spinner fa-spin"></i> Analyzing error...</div>';
    
    // Switch to explanation panel
    const explainBtn = document.querySelector('.panel-tab-btn[data-target="panel-explanation"]');
    if (explainBtn) explainBtn.click();

    // Map common error diagnostics locally for instant feedback
    setTimeout(() => {
        let title = "Compiler Warning";
        let expl = "Your code compiled, but contains patterns that could lead to unexpected behavior. Review variable types and scopes.";
        let fix = "Check lines surrounding the error for inconsistencies.";

        const msgLower = message.toLowerCase();
        
        if (msgLower.includes("expected ';'")) {
            title = "Missing Semicolon (`;`)";
            expl = `You forgot a semicolon to terminate your instruction on or just before line <strong>${line}</strong>. In C programming, every statement must end with a semicolon.`;
            fix = `Go to line <strong>${line}</strong> and add a <code>;</code> at the end of the statement.`;
        } 
        else if (msgLower.includes("implicit declaration of function")) {
            const funcName = message.match(/function '([^']+)'/) ? message.match(/function '([^']+)'/)[1] : "the function";
            title = "Missing Header Library / Undefined Function";
            expl = `You called function <code>${funcName}()</code>, but the compiler does not know what that function is. This usually means you forgot to import a library.`;
            fix = `Add <code>#include &lt;stdio.h&gt;</code> (for <code>printf/scanf</code>) or <code>#include &lt;stdlib.h&gt;</code> (for memory allocation/exit functions) at the very top of your file.`;
        }
        else if (msgLower.includes("unused variable")) {
            const varName = message.match(/variable '([^']+)'/) ? message.match(/variable '([^']+)'/)[1] : "variable";
            title = "Unused Variable Reference";
            expl = `You declared a variable named <code>${varName}</code> but never referenced it. This is not a fatal error, but removing it makes your code cleaner and saves memory.`;
            fix = `Either reference <code>${varName}</code> in your logic, or delete its declaration.`;
        }
        else if (msgLower.includes("incompatible pointer to integer conversion") || msgLower.includes("makes integer from pointer without a cast")) {
            title = "Pointer-to-Integer Type Mismatch";
            expl = `You are assigning an address (pointer) directly to a standard integer variable, or vice-versa.`;
            fix = `Add the dereference operator (<code>*</code>) to read the pointer's memory cell value, or the address operator (<code>&</code>) to extract the variable's address.`;
        }
        else if (msgLower.includes("segmentation fault") || msgLower.includes("segfault")) {
            title = "Segmentation Fault (Memory Access Crash)";
            expl = `Your program tried to read or write to a memory address that it doesn't own or isn't allowed to touch (such as reading from index -1 or dereferencing a Null Pointer).`;
            fix = `Check any pointer operations. Make sure you initialize pointers (e.g. <code>int *ptr = &val;</code>) before modifying them.`;
        }

        explainEl.innerHTML = `
            <div class="explanation-card">
                <h3 class="explanation-title"><i class="fa-solid fa-circle-info"></i> ${title}</h3>
                <div class="explanation-original">Original error: "${message}"</div>
                <div class="explanation-body"><p>${expl}</p></div>
                <div class="explanation-fix">
                    <h4>How to fix this:</h4>
                    <p>${fix}</p>
                </div>
            </div>
        `;
    }, 300);
}

/* =========================================================================
   12. CUSTOM MODAL DIALOG HANDLERS
   ========================================================================= */
function showModal({ type, title, message, placeholder = '', defaultValue = '' }) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-modal');
        const titleEl = modal.querySelector('.modal-title');
        const iconEl = modal.querySelector('.modal-icon');
        const msgEl = modal.querySelector('.modal-message');
        const inputContainer = modal.querySelector('.modal-input-container');
        const inputField = modal.querySelector('#modal-input-field');
        const btnCancel = modal.querySelector('#modal-btn-cancel');
        const btnOk = modal.querySelector('#modal-btn-ok');
        const btnClose = modal.querySelector('#modal-btn-close');

        // Reset classes
        inputContainer.classList.add('hidden');
        btnCancel.classList.add('hidden');
        btnOk.classList.remove('hidden');

        // Configure icons and titles
        iconEl.className = 'modal-icon fa-solid';
        if (type === 'prompt') {
            iconEl.classList.add('fa-circle-question', 'crimson-text');
            btnCancel.classList.remove('hidden');
            inputContainer.classList.remove('hidden');
            inputField.value = defaultValue;
            inputField.placeholder = placeholder;
        } else if (type === 'confirm') {
            iconEl.classList.add('fa-triangle-exclamation', 'crimson-text');
            btnCancel.classList.remove('hidden');
        } else {
            iconEl.classList.add('fa-circle-info', 'crimson-text');
        }

        titleEl.innerText = title;
        msgEl.innerText = message;

        // Display modal
        modal.classList.remove('hidden');

        if (type === 'prompt') {
            inputField.focus();
            inputField.select();
        } else {
            btnOk.focus();
        }

        function cleanUp() {
            modal.classList.add('hidden');
            btnOk.removeEventListener('click', onOk);
            btnCancel.removeEventListener('click', onCancel);
            btnClose.removeEventListener('click', onCancel);
            inputField.removeEventListener('keydown', onKeydown);
        }

        function onOk() {
            const val = inputField.value;
            cleanUp();
            if (type === 'prompt') {
                resolve(val);
            } else {
                resolve(true);
            }
        }

        function onCancel() {
            cleanUp();
            if (type === 'prompt') {
                resolve(null);
            } else {
                resolve(false);
            }
        }

        function onKeydown(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                onOk();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
            }
        }

        btnOk.addEventListener('click', onOk);
        btnCancel.addEventListener('click', onCancel);
        btnClose.addEventListener('click', onCancel);
        
        if (type === 'prompt') {
            inputField.addEventListener('keydown', onKeydown);
        }
    });
}

function customAlert(message, title = "VoltC Alert") {
    return showModal({ type: 'alert', title, message });
}

function customConfirm(message, title = "VoltC Confirm") {
    return showModal({ type: 'confirm', title, message });
}

function customPrompt(message, defaultValue = "", title = "VoltC Prompt") {
    return showModal({ type: 'prompt', title, message, defaultValue });
}


/* =========================================================================
   6. RUN SYSTEM & WEBSOCKET STREAMING
   ========================================================================= */
async function triggerRun() {
    if (!activeTabPath) {
        await customAlert("Please open a C file to run.", "Run Warning");
        return;
    }
    
    // Clear terminal and connect WebSocket
    const termBody = document.getElementById('terminal-output');
    termBody.innerHTML = '';
    
    appendTerminalLine("system", "[VoltC Execute] Initiating build and run pipeline...");
    
    // Close existing socket
    if (runSocket && runSocket.readyState === WebSocket.OPEN) {
        runSocket.close();
    }
    
    // Establish WebSocket Connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/run`;
    
    runSocket = new WebSocket(wsUrl);
    
    runSocket.onopen = () => {
        updateModeStatus("Running", "status-indicator-running");
        
        const customFlags = document.getElementById('compiler-flags').value.split(' ').filter(f => f.trim() !== '');
        const buildConfig = document.getElementById('build-config').value;
        const flags = [...customFlags];
        if (buildConfig === 'debug') flags.push('-g');
        
        // Send initial start packet
        runSocket.send(JSON.stringify({
            type: "start",
            path: activeTabPath,
            flags: flags
        }));
    };
    
    runSocket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        
        if (msg.type === 'stdout') {
            appendTerminalLine("output", msg.data);
        } 
        else if (msg.type === 'stderr') {
            appendTerminalLine("error", msg.data);
        }
        else if (msg.type === 'status') {
            if (msg.event === 'compiling') {
                appendTerminalLine("system", "[VoltC] Compiling binary in workspace sandbox...");
            }
            else if (msg.event === 'running') {
                appendTerminalLine("system", "[VoltC] Launching sandbox process. Interactive standard input is active.");
                document.getElementById('terminal-input').removeAttribute('disabled');
                document.getElementById('terminal-input').focus();
            }
            else if (msg.event === 'finished') {
                appendTerminalLine("system", `\n[VoltC] Subprocess exited with return code: ${msg.code}`);
                cleanupSubprocess();
            }
            else if (msg.event === 'timeout') {
                appendTerminalLine("error", `\n[VoltC Guard] Timeout error: Process exceeded running boundary (10.0s) and was terminated.`);
                cleanupSubprocess();
            }
            else if (msg.event === 'error') {
                appendTerminalLine("error", `\n[VoltC Build Error] ${msg.data}`);
                cleanupSubprocess();
                
                // Parse syntax errors if execution compile failed
                if (msg.errors) {
                    renderDiagnostics(msg.errors);
                }
            }
        }
    };
    
    runSocket.onclose = () => {
        cleanupSubprocess();
    };
    
    runSocket.onerror = (e) => {
        appendTerminalLine("error", "[VoltC Network Error] Live execution stream disrupted.");
        cleanupSubprocess();
    };
}

function sendTerminalInput() {
    const inputEl = document.getElementById('terminal-input');
    const val = inputEl.value;
    if (!val) return;
    
    if (runSocket && runSocket.readyState === WebSocket.OPEN) {
        appendTerminalLine("output", val + "\n");
        
        runSocket.send(JSON.stringify({
            type: "stdin",
            data: val + "\n"
        }));
        
        inputEl.value = '';
    }
}

function cleanupSubprocess() {
    document.getElementById('terminal-input').setAttribute('disabled', 'true');
    updateModeStatus("Ready", "status-indicator-idle");
    if (runSocket) {
        runSocket = null;
    }
}

function appendTerminalLine(type, text) {
    const termBody = document.getElementById('terminal-output');
    
    // Limit buffer length
    if (termBody.children.length > 200) {
        termBody.removeChild(termBody.firstChild);
    }
    
    const line = document.createElement('div');
    line.className = `terminal-line ${type}-line`;
    line.innerText = text;
    termBody.appendChild(line);
    
    // Auto scroll
    termBody.scrollTop = termBody.scrollHeight;
}

/* =========================================================================
   7. SIMPLE POINTER & STACK VISUALIZER
   ========================================================================= */
function updatePointerVisualizer(codeText) {
    const gridEl = document.getElementById('memory-visualizer-grid');
    const explEl = document.getElementById('pointer-explanation-body');
    
    // Parse simple variable declarations using regular expressions
    // Supports formats like: int x = 10; char y = 'a'; double d = 3.14; int *p = &x;
    const varRegex = /(int|char|double|float)\s+(\w+)\s*=\s*([^;]+);/g;
    const ptrRegex = /(int|char|double|float)\s*\*\s*(\w+)\s*=\s*&(\w+);/g;
    
    const variables = {};
    const pointers = {};
    
    let match;
    
    // Scan variables
    while ((match = varRegex.exec(codeText)) !== null) {
        const type = match[1];
        const name = match[2];
        const val = match[3].trim();
        
        // Generate simulated physical memory addresses based on hashed variable names
        const addressNum = 0x7ffe3b40 + Math.abs(hashCode(name)) % 1000;
        const hexAddr = `0x${addressNum.toString(16)}`;
        
        variables[name] = { type, name, val, address: hexAddr };
    }

    // Scan pointer references
    while ((match = ptrRegex.exec(codeText)) !== null) {
        const type = match[1];
        const name = match[2];
        const target = match[3];
        
        const addressNum = 0x7ffe3b40 + Math.abs(hashCode(name)) % 1000;
        const hexAddr = `0x${addressNum.toString(16)}`;
        
        pointers[name] = { type, name, target, address: hexAddr };
    }

    // Combine visual map keys
    const varKeys = Object.keys(variables);
    const ptrKeys = Object.keys(pointers);
    
    if (varKeys.length === 0 && ptrKeys.length === 0) {
        gridEl.innerHTML = `<div class="empty-state small">No active stack values. Write variable declarations (e.g. <code>int x = 10;</code>) in your code to visualize them here.</div>`;
        return;
    }

    gridEl.innerHTML = '';
    
    // Render variables
    varKeys.forEach(name => {
        const item = variables[name];
        const block = document.createElement('div');
        block.className = 'memory-block';
        block.id = `mem-${name}`;
        block.innerHTML = `
            <div class="memory-addr">${item.address}</div>
            <div class="memory-val">${item.val}</div>
            <div class="memory-var">${item.name} (${item.type})</div>
        `;
        gridEl.appendChild(block);
    });

    // Render pointers
    ptrKeys.forEach(name => {
        const item = pointers[name];
        const targetVar = variables[item.target];
        const targetAddr = targetVar ? targetVar.address : "NULL";
        
        const block = document.createElement('div');
        block.className = 'memory-block pointer';
        block.id = `mem-${name}`;
        block.innerHTML = `
            <div class="memory-addr">${item.address}</div>
            <div class="memory-val">${targetAddr}</div>
            <div class="memory-var">${item.name} (${item.type}*)</div>
        `;
        
        // Add interactive highlights
        block.addEventListener('mouseenter', () => {
            block.classList.add('active-ptr');
            const targetEl = document.getElementById(`mem-${item.target}`);
            if (targetEl) targetEl.classList.add('active-ptr');
            
            explEl.innerHTML = `
                <p class="explanation-text-small">
                    Pointer <code>${item.name}</code> stores the memory address <code>${targetAddr}</code>, 
                    which points directly to the variable <code>${item.target}</code> containing the value <code>${targetVar ? targetVar.val : '?'}</code>.
                </p>
            `;
        });

        block.addEventListener('mouseleave', () => {
            block.classList.remove('active-ptr');
            const targetEl = document.getElementById(`mem-${item.target}`);
            if (targetEl) targetEl.classList.remove('active-ptr');
        });

        gridEl.appendChild(block);
    });
}

function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return hash;
}

/* =========================================================================
   8. SESSIONS & SETTINGS RESTORE
   ========================================================================= */
async function loadSessionFromBackend() {
    try {
        const res = await fetch('/api/session');
        const state = await res.json();
        
        // Restore compile flags and theme checkboxes
        document.getElementById('compiler-flags').value = state.compiler_flags.join(' ') || '-Wall -Wextra -std=c11';
        document.getElementById('build-config').value = state.compiler_flags.includes('-O2') ? 'release' : 'debug';
        document.getElementById('cb-autosave').checked = state.autosave;
        
        // Reopen files
        if (state.open_tabs && state.open_tabs.length > 0) {
            for (let tabPath of state.open_tabs) {
                const name = tabPath.substring(tabPath.lastIndexOf('/') + 1);
                await selectFileTab(tabPath, name);
            }
            if (state.active_tab) {
                const name = state.active_tab.substring(state.active_tab.lastIndexOf('/') + 1);
                selectFileTab(state.active_tab, name);
            }
        } else {
            // Revert fallback files list
            fetchFilesList();
        }
    } catch (e) {
        console.error("Session restore error:", e);
        fetchFilesList();
    }
}

async function saveSessionToBackend() {
    const customFlags = document.getElementById('compiler-flags').value.split(' ').filter(f => f.trim() !== '');
    const autosave = document.getElementById('cb-autosave').checked;
    
    const payload = {
        open_tabs: openTabs.map(t => t.path),
        active_tab: activeTabPath,
        compiler_flags: customFlags,
        theme: "midnight-crimson",
        autosave: autosave
    };
    
    try {
        await fetch('/api/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (e) {
        console.error("Session saving failed:", e);
    }
}

/* =========================================================================
   9. AUTOSAVE DRAFT RECOVERY
   ========================================================================= */
function startAutosaveTimer() {
    setInterval(() => {
        const isAutosaveEnabled = document.getElementById('cb-autosave').checked;
        if (!isAutosaveEnabled || !activeTabPath || !fileCache[activeTabPath]) return;
        
        const content = activeEditor.getValue();
        if (content !== fileCache[activeTabPath].originalContent) {
            localStorage.setItem(`voltc_draft_${activeTabPath}`, content);
        }
    }, 15000); // Trigger every 15 seconds
}

/* =========================================================================
   10. TEMPLATES INLINE SELECTOR
   ========================================================================= */
function initTemplateSelection() {
    const templates = {
        hello: `#include <stdio.h>\n\nint main() {\n    printf("Hello VoltC!\\n");\n    return 0;\n}\n`,
        pointer: `#include <stdio.h>\n\nint main() {\n    int val = 42;\n    int *ptr = &val;\n    \n    printf("Value of val: %d\\n", val);\n    printf("Address of val: %p\\n", &val);\n    printf("Value inside ptr: %p\\n", ptr);\n    printf("Dereferenced ptr: %d\\n", *ptr);\n    \n    return 0;\n}\n`
    };

    document.querySelectorAll('.template-item-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const templateKey = btn.getAttribute('data-target') || btn.getAttribute('data-template');
            const code = templates[templateKey];
            
            const filename = templateKey === 'hello' ? 'hello_world.c' : 'pointer_demo.c';
            const path = `${activeWorkspace}/${filename}`;
            
            createWorkspaceItemAPI(path, false, code);
        });
    });
}

/* =========================================================================
   11. SYSTEM STATISTICS POLLER
   ========================================================================= */
function startStatsPoller() {
    setInterval(() => {
        // Mock system statistics variation
        cpuUsage = Math.max(1, Math.min(99, cpuUsage + Math.floor(Math.random() * 5) - 2));
        ramUsage = Math.max(25, Math.min(120, ramUsage + Math.floor(Math.random() * 3) - 1));
        
        const statsEl = document.getElementById('status-resources');
        if (statsEl) {
            statsEl.innerHTML = `<i class="fa-solid fa-server"></i> CPU: ${cpuUsage}% | RAM: ${ramUsage}MB`;
        }
    }, 3000);
}
