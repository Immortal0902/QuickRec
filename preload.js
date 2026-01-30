const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    saveFile: (data) => ipcRenderer.invoke('save-file', data),
    getSources: (types) => ipcRenderer.invoke('get-sources', types),
    getConfig: () => ipcRenderer.invoke('get-config'),
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    openRecordingsFolder: () => ipcRenderer.invoke('open-recordings-folder'),

    // Overlay
    showOverlay: (show) => ipcRenderer.send('show-overlay', show),
    updateTimerRelay: (data) => ipcRenderer.send('update-timer-relay', data),
    onTriggerScreenshot: (callback) => ipcRenderer.on('trigger-screenshot', () => callback()),
    onTriggerPause: (callback) => ipcRenderer.on('trigger-pause', () => callback()),
    onTriggerResume: (callback) => ipcRenderer.on('trigger-resume', () => callback()),
    onTriggerStop: (callback) => ipcRenderer.on('trigger-stop', () => callback()),
    onTriggerRecord: (callback) => ipcRenderer.on('trigger-record', () => callback()),

    onShortcutTrigger: (callback) => ipcRenderer.on('shortcut-trigger', (event, action) => callback(action)),

    // Streaming Recording
    startRecordingStream: (data) => ipcRenderer.invoke('start-recording-stream', data),
    writeRecordingChunk: (buffer) => ipcRenderer.invoke('write-recording-chunk', buffer),
    stopRecordingStream: () => ipcRenderer.invoke('stop-recording-stream'),

    // Status & Notifications
    onStatusUpdate: (callback) => ipcRenderer.on('status-update', (event, data) => callback(data)),
    onNotification: (callback) => ipcRenderer.on('notification', (event, data) => callback(data))
});

