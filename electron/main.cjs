const { app, BrowserWindow, Menu, dialog, ipcMain, shell, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
let mainWindow = null;
let rendererDirty = false;
let allowClose = false;
let closePromptOpen = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1720,
    height: 1040,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: '#0b0c0e',
    show: false,
    autoHideMenuBar: true,
    title: 'Vexlum',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      backgroundThrottling: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('close', (event) => {
    if (allowClose || !rendererDirty) return;
    event.preventDefault();
    if (closePromptOpen) return;
    closePromptOpen = true;
    // Use the asynchronous dialog: a synchronous message box shown from inside
    // the close handler can immediately resolve with the first button on some
    // Windows/Electron combinations, which would silently discard the project.
    dialog
      .showMessageBox(mainWindow, {
        type: 'warning',
        buttons: ['Discard changes and close', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
        title: 'Unsaved changes',
        message: 'Close Vexlum without saving?',
        detail:
          'This project has unsaved changes. Closing now discards them. Choose Cancel to go back and save with Ctrl+S.'
      })
      .then(({ response }) => {
        closePromptOpen = false;
        if (response !== 0 || !mainWindow || mainWindow.isDestroyed()) return;
        allowClose = true;
        // destroy() bypasses the close handler entirely, so a busy renderer can
        // never keep the process alive after the user chooses to discard.
        mainWindow.destroy();
      })
      .catch(() => {
        closePromptOpen = false;
      });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL() || '';
    if (url !== current) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

function sendCommand(command, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('menu:command', { command, payload });
  }
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'New Project', accelerator: 'CmdOrCtrl+N', click: () => sendCommand('new-project') },
        { label: 'Open Project…', accelerator: 'CmdOrCtrl+O', click: () => sendCommand('open-project') },
        { label: 'Save Project…', accelerator: 'CmdOrCtrl+S', click: () => sendCommand('save-project') },
        { label: 'Project Settings…', accelerator: 'CmdOrCtrl+K', click: () => sendCommand('project-settings') },
        { type: 'separator' },
        { label: 'Import 3D Model…', accelerator: 'CmdOrCtrl+I', click: () => sendCommand('import-model') },
        { label: 'Render Video…', accelerator: 'CmdOrCtrl+Shift+R', click: () => sendCommand('open-render') },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => sendCommand('undo') },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: () => sendCommand('redo') },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'Scene',
      submenu: [
        { label: 'Scene Editor', accelerator: 'CmdOrCtrl+1', click: () => sendCommand('mode-scene') },
        { label: 'Animation', accelerator: 'CmdOrCtrl+2', click: () => sendCommand('mode-animation') },
        { type: 'separator' },
        { label: 'Add Box', click: () => sendCommand('add-box') },
        { label: 'Add Point Light', click: () => sendCommand('add-point-light') },
        { label: 'Add Spot Light', click: () => sendCommand('add-spot-light') },
        { type: 'separator' },
        { label: 'Project Settings…', accelerator: 'CmdOrCtrl+K', click: () => sendCommand('project-settings') },
        { label: 'Surroundings / World', click: () => sendCommand('open-world') },
        { type: 'separator' },
        { label: 'Play / Pause', accelerator: 'Space', click: () => sendCommand('toggle-play') }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Editor Camera', accelerator: 'CmdOrCtrl+Alt+1', click: () => sendCommand('view-editor') },
        { label: 'Scene Camera', accelerator: 'CmdOrCtrl+Alt+2', click: () => sendCommand('view-camera') },
        { label: 'Toggle Grid', accelerator: "CmdOrCtrl+G", click: () => sendCommand('toggle-grid') },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Keyboard Shortcuts', click: () => sendCommand('show-help') },
        { label: 'About Vexlum', click: () => sendCommand('show-about') }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  app.setAppUserModelId('studio.vexlum.app');
  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (!rendererDirty) allowClose = true;
});

ipcMain.handle('app:set-dirty', (_event, payload) => {
  rendererDirty = Boolean(payload?.dirty);
  return { ok: true };
});

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  platform: process.platform,
  dev: isDev
}));

ipcMain.handle('window:toggle-fullscreen', () => {
  if (!mainWindow) return false;
  const next = !mainWindow.isFullScreen();
  mainWindow.setFullScreen(next);
  return next;
});

ipcMain.handle('window:is-fullscreen', () => Boolean(mainWindow?.isFullScreen()));

ipcMain.handle('file:save-binary', async (_event, payload) => {
  try {
    const { data, defaultName, filters } = payload || {};
    if (!data) return { ok: false, canceled: true };
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save',
      defaultPath: defaultName || 'export.bin',
      filters: filters || [{ name: 'All Files', extensions: ['*'] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    await fs.writeFile(result.filePath, buffer);
    return { ok: true, filePath: result.filePath, size: buffer.length };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
});

ipcMain.handle('file:save-text', async (_event, payload) => {
  try {
    const { text, defaultName, filters } = payload || {};
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Project',
      defaultPath: defaultName || 'vexlum-project.vxl',
      filters: filters || [{ name: 'Vexlum Project', extensions: ['vxl'] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    await fs.writeFile(result.filePath, String(text ?? ''), 'utf8');
    return { ok: true, filePath: result.filePath };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
});

ipcMain.handle('file:open-text', async (_event, payload) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: payload?.title || 'Open Project',
      properties: ['openFile'],
      filters: payload?.filters || [{ name: 'Vexlum Project', extensions: ['vxl', 'mstudio', 'json'] }]
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
    const filePath = result.filePaths[0];
    const text = await fs.readFile(filePath, 'utf8');
    return { ok: true, filePath, name: path.basename(filePath), text };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
});

ipcMain.handle('file:open-binary', async (_event, payload) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: payload?.title || 'Open File',
      properties: ['openFile'],
      filters: payload?.filters || [{ name: 'All Files', extensions: ['*'] }]
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
    const filePath = result.filePaths[0];
    const data = await fs.readFile(filePath);
    return {
      ok: true,
      filePath,
      name: path.basename(filePath),
      ext: path.extname(filePath).slice(1).toLowerCase(),
      data
    };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
});

ipcMain.handle('file:pick-folder', async (_event, payload) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: payload?.title || 'Choose a project folder',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
    return { ok: true, folderPath: result.filePaths[0] };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
});

ipcMain.handle('file:read-text-at', async (_event, payload) => {
  try {
    const filePath = String(payload?.filePath || '');
    if (!filePath) return { ok: false, error: 'No file path provided.' };
    const text = await fs.readFile(filePath, 'utf8');
    return { ok: true, filePath, name: path.basename(filePath), text };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
});

ipcMain.handle('file:write-text-at', async (_event, payload) => {
  try {
    const filePath = String(payload?.filePath || '');
    if (!filePath) return { ok: false, error: 'No file path provided.' };
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, String(payload?.text ?? ''), 'utf8');
    return { ok: true, filePath };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
});

// In-flight AI requests, keyed by the renderer's request id so the Stop button
// can actually cancel the network call instead of leaving it running.
const aiRequests = new Map();

ipcMain.handle('ai:request', async (_event, payload) => {
  const requestId = String(payload?.requestId || '');
  const controller = new AbortController();
  if (requestId) aiRequests.set(requestId, controller);
  let timedOut = false;
  let timer = null;
  try {
    const url = String(payload?.url || '');
    if (!/^https?:\/\//i.test(url)) {
      return { ok: false, status: 0, text: '', error: 'AI requests must use http(s).' };
    }
    const method = String(payload?.method || 'POST').toUpperCase();
    const headers = payload?.headers && typeof payload.headers === 'object' ? payload.headers : {};
    const body = typeof payload?.body === 'string' ? payload.body : undefined;
    const timeoutMs = Math.min(600000, Math.max(5000, Number(payload?.timeoutMs) || 120000));
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const response = await net.fetch(url, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : body,
      signal: controller.signal
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  } catch (error) {
    const canceled = !timedOut && controller.signal.aborted;
    return {
      ok: false,
      status: 0,
      text: '',
      error: canceled
        ? 'Request stopped.'
        : timedOut
          ? 'The provider did not answer in time.'
          : error?.message || String(error),
      canceled,
      timedOut
    };
  } finally {
    if (timer) clearTimeout(timer);
    if (requestId) aiRequests.delete(requestId);
  }
});

ipcMain.handle('ai:cancel', (_event, requestId) => {
  const controller = aiRequests.get(String(requestId || ''));
  if (!controller) return false;
  controller.abort();
  return true;
});

ipcMain.handle('shell:show-item', async (_event, filePath) => {
  try {
    shell.showItemInFolder(filePath);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
});

