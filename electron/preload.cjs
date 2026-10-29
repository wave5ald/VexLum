const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  info: () => ipcRenderer.invoke('app:info'),
  saveBinary: (data, defaultName, filters) =>
    ipcRenderer.invoke('file:save-binary', { data, defaultName, filters }),
  saveText: (text, defaultName, filters) =>
    ipcRenderer.invoke('file:save-text', { text, defaultName, filters }),
  openText: (title, filters) => ipcRenderer.invoke('file:open-text', { title, filters }),
  openBinary: (title, filters) => ipcRenderer.invoke('file:open-binary', { title, filters }),
  toggleFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('window:is-fullscreen'),
  showItem: (filePath) => ipcRenderer.invoke('shell:show-item', filePath),
  aiRequest: (payload) => ipcRenderer.invoke('ai:request', payload),
  aiCancel: (requestId) => ipcRenderer.invoke('ai:cancel', requestId),
  pickFolder: (title) => ipcRenderer.invoke('file:pick-folder', { title }),
  readTextAt: (filePath) => ipcRenderer.invoke('file:read-text-at', { filePath }),
  writeTextAt: (filePath, text) => ipcRenderer.invoke('file:write-text-at', { filePath, text }),
  setDirty: (dirty) => ipcRenderer.invoke('app:set-dirty', { dirty }),
  onMenuCommand: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('menu:command', listener);
    return () => ipcRenderer.removeListener('menu:command', listener);
  }
});
