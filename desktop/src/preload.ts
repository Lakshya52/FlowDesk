import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  reload: () => ipcRenderer.send('reload-app'),

  // ----- Auto-updater bridge -----
  // Renderer → Main: trigger restart & install
  restartAndInstall: () => ipcRenderer.send('update-action', 'restart'),
  // Renderer → Main: dismiss the update card
  dismissUpdate: () => ipcRenderer.send('update-action', 'dismiss'),
  // Renderer → Main: start downloading the update
  startDownload: () => ipcRenderer.send('start-download'),

  // Main → Renderer: receive version info when overlay opens
  onUpdateInfo: (callback: (info: { version: string }) => void) => {
    ipcRenderer.on('update-info', (_event, data) => callback(data));
  },

  // Main → Renderer: receive download error
  onDownloadError: (callback: (msg: string) => void) => {
    ipcRenderer.on('download-error', (_event, msg) => callback(msg));
  },

  // Main → Renderer: receive download progress { percent, bytesPerSecond, total, transferred }
  onDownloadProgress: (callback: (progress: any) => void) => {
    ipcRenderer.on('download-progress', (_event, data) => callback(data));
  },

  // Main → Renderer: update fully downloaded, ready to install
  onUpdateDownloaded: (callback: (info: any) => void) => {
    ipcRenderer.on('update-downloaded', (_event, info) => callback(info));
  },

  // Renderer → Main: Request window focus
  focusApp: () => ipcRenderer.send('focus-app'),

  // Renderer → Main: delegate notification popup to main process
  showNotification: (data: any) => ipcRenderer.send('show-notification', data),

  // Main → Renderer: receive navigation requests (e.g. from notification click)
  onNavigate: (callback: (link: string) => void) => {
    ipcRenderer.on('navigate-requested', (_event, link) => callback(link));
  },

  onGoogleAuthSuccess: (callback: () => void) => {
    ipcRenderer.on('google-auth-success', () => callback());
  },

  removeGoogleAuthListener: () => {
    ipcRenderer.removeAllListeners('google-auth-success');
  },

  // ----- E2EE secure storage (OS keychain via safeStorage) -----
  // Used to back up the device's E2EE private key, OS-encrypted.
  // Same-machine restore only by design (no cross-device sync of keys).
  secureSave: (key: string, value: string) =>
    ipcRenderer.invoke('safe-storage-save', { key, value }),
  secureRead: (key: string) =>
    ipcRenderer.invoke('safe-storage-read', { key }),
});

console.log('FlowDesk Preload Bridge Initialized');
