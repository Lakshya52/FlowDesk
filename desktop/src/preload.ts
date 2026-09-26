import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  reload: () => ipcRenderer.send('reload-app'),

  // NOTE: updates are fully main-driven (splash boot flow + silent
  // background downloads) — no renderer update bridge is exposed.

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
