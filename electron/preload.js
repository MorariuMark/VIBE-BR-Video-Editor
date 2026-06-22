const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // File operations
  openFileDialog: (options) => ipcRenderer.invoke('open-file-dialog', options),
  saveFileDialog: (options) => ipcRenderer.invoke('save-file-dialog', options),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  getFileInfo: (filePath) => ipcRenderer.invoke('get-file-info', filePath),

  // Export
  exportVideo: (config) => ipcRenderer.invoke('export-video', config),
  onExportProgress: (callback) => ipcRenderer.on('export-progress', (event, data) => callback(data)),
  removeExportProgress: () => ipcRenderer.removeAllListeners('export-progress'),
  startFrameExport: (config) => ipcRenderer.invoke('start-frame-export', config),
  sendFrame: (buffer) => ipcRenderer.invoke('send-frame', buffer),
  endFrameExport: () => ipcRenderer.invoke('end-frame-export'),
  killExport: () => ipcRenderer.invoke('kill-export'),

  // Video optimization (GOP transcoding)
  optimizeVideo: (config) => ipcRenderer.invoke('optimize-video', config),
  onOptimizeProgress: (callback) => ipcRenderer.on('optimize-progress', (event, data) => callback(data)),
  removeOptimizeProgress: () => ipcRenderer.removeAllListeners('optimize-progress'),

  // GPU Settings
  setGPUAcceleration: (enabled) => ipcRenderer.invoke('set-gpu-acceleration', enabled),
  getGPUAcceleration: () => ipcRenderer.invoke('get-gpu-acceleration'),
});
