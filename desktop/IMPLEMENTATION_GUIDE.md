# FlowDesk Desktop Implementation Guide — v4.2.0

> Source: `desktop/package.json:3` `4.2.0` `electron 34.3.0` + `electron-updater 6.3.9`, `desktop/src/main.ts:30` (379 lines), `desktop/src/preload.ts`.

## Prerequisites

- Node.js 18+ · npm
- FlowDesk frontend (`VITE_API_URL` / `FRONTEND_URL`) + backend (`CLIENT_URL` allowlist `server/src/index.ts:60`) reachable
- For building installers: platform toolchains (Windows `nsis`, macOS code signing, Linux `AppImage` deps)

## Folder Structure

```
desktop/
├── assets/
│   ├── icon.ico / icon.icns / icon.png
│   ├── loading.html                # splash
│   ├── update-overlay.html         # progress bar for autoUpdater
│   ├── FlowDeskInstallerSidebarBmp.bmp
│   └── FlowDeskUninstallerSidebarBmp.bmp
├── src/
│   ├── main.ts                     # Main process (379 lines)
│   └── preload.ts                  # contextBridge expose
├── package.json                    # build.appId com.flowdesk.app, publish github Lakshya52/FlowDesk
├── tsconfig.json
└── .env                            # FRONTEND_URL=https://your-production-url
```

## Setup Instructions

1. **Install**
   ```bash
   cd desktop
   npm install
   ```

2. **Configure** `desktop/.env` (copied into build `files .env` `package.json:38`)
   ```env
   FRONTEND_URL=https://your-production-url
   # or local
   FRONTEND_URL=http://localhost:5173
   ```
   `main.ts:81` `mainWindow` loads `process.env.FRONTEND_URL` else local `index.html`.

3. **Run in dev**
   ```bash
   npm run dev   # tsc && electron .
   # alt
   npm run start # electron .
   npm run pack  # tsc && electron-builder --dir (unpacked)
   ```

## Build & Distribution (`electron-builder 25.1.8`)

```bash
npm run dist:win   # tsc && electron-builder --win   -> release/FlowDesk-Setup-4.2.0.exe (nsis) + portable .exe
npm run dist:mac   # tsc && electron-builder --mac   -> release/*.dmg (icon assets/icon.icns)
npm run dist:linux # tsc && electron-builder --linux -> release/*.AppImage (icon assets/icon.png)
npm run build      # builds all per host
```

Builder config `desktop/package.json:28`:

- `appId com.flowdesk.app`, `productName FlowDesk`, `directories.output release`, `files [dist/**/*, assets/**/*, package.json, .env]`, `extraResources assets/` copy.
- `win.target [nsis, portable] icon assets/icon.ico executableName FlowDesk`
- `mac.target dmg`, `linux.target AppImage`
- `nsis oneClick false allowToChangeInstallationDirectory true createDesktopShortcut/startMenu shortcutName FlowDesk artifactName ${productName}-Setup-${version}.${ext}` + custom sidebar bmps.
- `publish [{provider github owner Lakshya52 repo FlowDesk}]` — feeds `autoUpdater` + `Releases.tsx` modal.

## Runtime Architecture `desktop/src/main.ts:30`

- **Windows:** `loadingWindow L62` splash `assets/loading.html` → `mainWindow L81` `BrowserWindow { webPreferences: { preload, nodeIntegration false, contextIsolation true, sandbox } }` loads `FRONTEND_URL`; `updateOverlay L207` semi-transparent progress.
- **IPC (`preload.ts` `contextBridge.exposeInMainWorld("electronAPI")`):**
  - `reload-app L128` `webContents.reload`
  - `safe-storage-save L137` `safeStorage.encryptString` + `safe-storage-read L148` `decryptString` + generic `L161` — stores tokens securely (used by `authStore` persist fallback).
  - `updater` events + `update-action start-download` `L330-344` `autoUpdater.quitAndInstall`.
  - `tray` create `L260` `Tray` icon + Menu quit/reload click shows window `L279`.

- **Auto-update** `autoUpdater L57` settings `autoDownload false autoInstallOnAppQuit true`. Events forwarded to renderer via `webContents.send`:
  - `checking-for-update L291`, `update-available L295`, `update-not-available L300`, `download-progress L304` (percent), `update-downloaded L311`, `error L316`.
  - Renderer triggers `update-action start-download` → `autoUpdater.downloadUpdate()` → progress overlay → `quitAndInstall` on user confirm.

- **Tray & Lifecycle:** `createTray() L260` with `icon.png/ico`; `app.setAsDefaultProtocolClient("flowdesk") L370` handles `flowdesk://google-auth-success` OAuth deep link (also web `GET /import/google-calendar/callback` `googleCalendarImport.ts:33` saves `googleRefreshToken`).

## Security Features

- `contextIsolation true`, `nodeIntegration false`, `sandbox` (`main.ts:81`) — renderer has no Node access.
- `preload.ts` bridge is the only surface `electronAPI.safeStorage|updater|tray`.
- `safeStorage` OS-level encryption (DPAPI on Win, Keychain on macOS) for persisted auth.
- CSP/Helmet on server still enforced inside `BrowserWindow` load.

## Tips for Distribution

1. **Code signing:** Sign with developer cert to avoid SmartScreen/Gatekeeper. Add cert paths in `build.win.certificateSubjectName` / `build.mac.identity` (see `electron-builder` docs).
2. **Icons:** Replace `assets/icon.ico/.icns/.png` + sidebar bmps before first `dist:*`.
3. **Release flow:** bump `desktop/package.json version` + `server/client` in lockstep (currently `4.2.0`), `git tag v4.2.0`, `gh release create` uploads `release/*` — `autoUpdater` + `GET /api/releases` pick them up. Verify `publish.github` token has `contents:write`.
4. **Google OAuth:** register `flowdesk://` scheme in `app.setAsDefaultProtocolClient` + server `GOOGLE_REDIRECT_URI` must match `flowdesk://google-auth-success` for desktop flow.
5. **Debug:** `npm run dev` + `mainWindow.webContents.openDevTools()` toggle in `main.ts` for IPC logs.

See also root `README.md#Project Structure` + `project_overview.md#Modular Architecture` for backend Socket.io/CSP context that desktop relies on.
