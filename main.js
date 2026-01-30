const { app, BrowserWindow, globalShortcut, ipcMain, dialog, shell, desktopCapturer } = require('electron');
console.log("Main process starting...");
const path = require('path');
const fs = require('fs');
const os = require('os');
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');
const StatusService = require('./future_system/services/StatusService');

// Configure logging
log.transports.file.level = 'info';
autoUpdater.logger = log;
console.log = log.info; // Redirect console.log to log file


let mainWindow;
let overlayWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 800,
        backgroundColor: '#1a1a1f',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false // Allow loading local resources (videos)
        }
    });

    mainWindow.loadFile('index.html');
    mainWindow.removeMenu();

    // Permission handler (Optional but good practice)
    mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        if (permission === 'media') {
            callback(true);
        } else {
            callback(false);
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
        if (overlayWindow) overlayWindow.close();
    });
}

function createOverlayWindow() {
    overlayWindow = new BrowserWindow({
        width: 250,
        height: 60,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        hasShadow: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    overlayWindow.loadFile('overlay.html');
    overlayWindow.hide();

    // Make it visible on all workspaces/desktops
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // Position at top-center of screen
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width } = primaryDisplay.workAreaSize;
    overlayWindow.setPosition(Math.floor(width / 2 - 125), 50);
}

// IPC Handler: Get Sources
ipcMain.handle('get-sources', async (event, types) => {
    try {
        const sources = await desktopCapturer.getSources({ types: types || ['screen', 'window'] });
        return sources.map(source => ({
            id: source.id,
            name: source.name,
            thumbnail: source.thumbnail.toDataURL()
        }));
    } catch (e) {
        console.error(e);
        return [];
    }
});


const STATUS_URL = "https://raw.githubusercontent.com/Immortal0902/pro-screen-recorder-status/refs/heads/main/pro-screen-recorder-upload/status.json";
const statusService = new StatusService(app.getVersion(), STATUS_URL);

async function checkRemoteStatus() {
    try {
        console.log("Checking remote status...");
        const status = await statusService.fetchStatus();
        const analysis = statusService.analyze(status);
        console.log("Analysis Result:", analysis);

        // Handle Shutdown (Action type SHUTDOWN)
        const shutdownAction = analysis.find(a => a.type === 'SHUTDOWN');
        if (shutdownAction) {
            console.error("BLOCKING STARTUP: App is disabled remotely.");
            dialog.showMessageBoxSync({
                type: 'error',
                title: 'Access Restricted',
                message: shutdownAction.message,
                buttons: ['Close']
            });
            app.quit();
            app.exit(0); // Forceful exit
            return false;
        }

        // Send updates to Renderer once window is ready
        setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('status-update', analysis);

                // If Force Update is required, trigger it
                if (analysis.find(a => a.type === 'FORCE_UPDATE')) {
                    autoUpdater.checkForUpdatesAndNotify();
                }
            }
        }, 3000);

        return true;
    } catch (error) {
        console.error("Status check failed:", error);
        return true; // Fail-safe
    }
}


app.whenReady().then(async () => {
    console.log("App ready, checking remote status...");
    const shouldRun = await checkRemoteStatus();
    console.log("Remote status check completed, shouldRun:", shouldRun);

    if (!shouldRun) {
        console.warn("Startup aborted by remote status.");
        return;
    }

    console.log("Starting UI...");
    createWindow();
    createOverlayWindow();

    // Start periodic check every 30 minutes
    setInterval(checkRemoteStatus, 30 * 60 * 1000);

    // Update listeners
    autoUpdater.on('update-available', () => {
        if (mainWindow) mainWindow.webContents.send('notification', { type: 'info', message: 'Update available. Downloading...' });
    });

    autoUpdater.on('update-downloaded', () => {
        if (mainWindow) mainWindow.webContents.send('notification', { type: 'update', message: 'Update downloaded. Restarting app...' });
        setTimeout(() => autoUpdater.quitAndInstall(), 5000);
    });


    // Global Shortcut: Ctrl+Shift+R to toggle recording
    globalShortcut.register('CommandOrControl+Shift+R', () => {
        if (mainWindow) {
            mainWindow.webContents.send('shortcut-trigger', 'toggle-recording');
        }
    });

    // Global Shortcut: Ctrl+Shift+M to toggle mic
    globalShortcut.register('CommandOrControl+Shift+M', () => {
        if (mainWindow) {
            mainWindow.webContents.send('shortcut-trigger', 'toggle-mic');
        }
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// Config Management
const configPath = path.join(app.getPath('userData'), 'config.json');

function loadConfig() {
    const defaultPath = path.join(app.getPath('videos'), 'QuickRec Recordings');

    // Ensure default directory exists
    if (!fs.existsSync(defaultPath)) {
        try { fs.mkdirSync(defaultPath, { recursive: true }); } catch (e) { console.error("Failed to create default rec folder", e); }
    }

    try {
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            return {
                ...config,
                savePath: config.savePath || defaultPath,
                quality: config.quality || '1080'
            };
        }
    } catch (e) {
        console.error("Failed to load config", e);
    }
    return { savePath: defaultPath, quality: '1080' };
}

function saveConfig(config) {
    try {
        fs.writeFileSync(configPath, JSON.stringify(config));
    } catch (e) {
        console.error("Failed to save config", e);
    }
}

// IPC Handlers
ipcMain.handle('get-config', () => loadConfig());

ipcMain.handle('save-config', (event, newConfig) => {
    const current = loadConfig();
    const updated = { ...current, ...newConfig };
    saveConfig(updated);
    return updated;
});

ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
    }
    return null;
});

// IPC Handler: Open recordings folder
ipcMain.handle('open-recordings-folder', async () => {
    const config = loadConfig();
    const saveDir = config.savePath;
    await shell.openPath(saveDir);
    return true;
});

// IPC Handler: Save video file directly to disk
ipcMain.handle('save-file', async (event, { buffer, filename }) => {
    try {
        const config = loadConfig();
        const saveDir = config.savePath;

        // Ensure directory exists (again, as double check or if user changed it)
        if (!fs.existsSync(saveDir)) {
            fs.mkdirSync(saveDir, { recursive: true });
        }

        const filePath = path.join(saveDir, filename);

        fs.writeFileSync(filePath, Buffer.from(buffer));
        console.log(`File saved to: ${filePath}`);

        return { success: true, path: filePath };
    } catch (error) {
        console.error('Failed to save file:', error);
        return { success: false, error: error.message };
    }
}
);

// Streaming Recording Handlers
let activeWriteStream = null;
let activeFilePath = null;

ipcMain.handle('start-recording-stream', async (event, { filename }) => {
    try {
        const config = loadConfig();
        const saveDir = config.savePath;

        // Ensure directory exists
        if (!fs.existsSync(saveDir)) {
            fs.mkdirSync(saveDir, { recursive: true });
        }

        activeFilePath = path.join(saveDir, filename);
        activeWriteStream = fs.createWriteStream(activeFilePath);

        console.log(`Started recording stream to: ${activeFilePath}`);
        return { success: true, path: activeFilePath };
    } catch (error) {
        console.error('Failed to start recording stream:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('write-recording-chunk', async (event, buffer) => {
    try {
        if (!activeWriteStream) {
            throw new Error('No active recording stream');
        }

        return new Promise((resolve, reject) => {
            activeWriteStream.write(Buffer.from(buffer), (err) => {
                if (err) reject(err);
                else resolve({ success: true });
            });
        });
    } catch (error) {
        console.error('Failed to write recording chunk:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('stop-recording-stream', async () => {
    try {
        if (!activeWriteStream) {
            throw new Error('No active recording stream');
        }

        return new Promise((resolve, reject) => {
            activeWriteStream.end(() => {
                console.log(`Recording stream closed: ${activeFilePath}`);
                const finalPath = activeFilePath;
                activeWriteStream = null;
                activeFilePath = null;
                resolve({ success: true, path: finalPath });
            });

            activeWriteStream.on('error', (err) => {
                reject(err);
            });
        });
    } catch (error) {
        console.error('Failed to stop recording stream:', error);
        activeWriteStream = null;
        activeFilePath = null;
        return { success: false, error: error.message };
    }
});

// Overlay IPC
ipcMain.on('show-overlay', (event, show) => {
    if (overlayWindow) {
        if (show) overlayWindow.show();
        else overlayWindow.hide();
    }
});

ipcMain.on('update-timer-relay', (event, data) => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send('update-timer', data);
    }
});

ipcMain.on('overlay-screenshot', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('trigger-screenshot');
});

ipcMain.on('overlay-pause', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('trigger-pause');
});

ipcMain.on('overlay-resume', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('trigger-resume');
});

ipcMain.on('overlay-toggle-mic', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('shortcut-trigger', 'toggle-mic');
});

ipcMain.on('overlay-stop', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('trigger-stop');
});

ipcMain.on('overlay-record', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('trigger-record');
});
