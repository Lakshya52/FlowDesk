import {
  app,
  BrowserWindow,
  shell,
  ipcMain,
  Menu,
  Tray,
  nativeImage,
  Notification,
  safeStorage,
} from "electron";
import * as path from "path";
import * as fs from "fs";
import * as dns from "node:dns";
import * as dotenv from "dotenv";
import { autoUpdater } from "electron-updater";

// Prefer IPv4 first: on networks with broken IPv6, the default lookup order
// stalls every connection for seconds before falling back (same reason the
// server forces ipv4first for Atlas on Windows).
dns.setDefaultResultOrder("ipv4first");

// Load environment variables
dotenv.config({ path: path.join(__dirname, "../.env") });

// const FRONTEND_URL =
//   process.env.FRONTEND_URL || "https://flowdesk-frontend-g35x.onrender.com";
// const FRONTEND_URL =
  // process.env.FRONTEND_URL || "https://prince-principal-skirts-capture.trycloudflare.com/";
const FRONTEND_URL =
  process.env.FRONTEND_URL || "https://flowdesk.raksco.in";
// const IS_DEV = process.env.NODE_ENV === "development";
// app.isPackaged is the reliable dev signal: `npm run dev` never sets
// NODE_ENV, so the env check alone silently ran updater code in dev
// (where checkForUpdates is a no-op that emits nothing and hung boot on
// the check timeout). Unpackaged runs now skip updater work entirely.
const IS_DEV = !app.isPackaged || process.env.NODE_ENV === "development";

let mainWindow: BrowserWindow | null = null;
let loadingWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuiting = false;
// createMainWindow can run again (dock activate after close) — IPC channels
// must be registered exactly once or reloads/notifications fire twice.
let coreIpcRegistered = false;
// Becomes true on the main window's first successful paint. Until then,
// focus requests (tray, second instance, notifications) go to the splash —
// a hidden, never-loaded window must never be revealed as a blank page.
let mainLoaded = false;

// ─── Single Instance Lock ──────────────────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine, _workingDirectory) => {
    // Handle deep link on Windows
    const url = commandLine.find(arg => arg.startsWith("flowdesk://"));
    if (url?.startsWith("flowdesk://google-auth-success")) {
      mainWindow?.webContents.send("google-auth-success");
    }
    focusMainOrLoader();
  });
}
  
// ─── Auto-updater configuration ────────────────────────────────────────────
autoUpdater.autoDownload = false; // Download on user request only
autoUpdater.autoInstallOnAppQuit = true; // Install when user quits normally

// ─── Loading splash window ─────────────────────────────────────────────────
function createLoadingWindow() {
  loadingWindow = new BrowserWindow({
    width: 600,
    height: 400,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    icon: path.join(__dirname, "../assets/icon.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  loadingWindow.loadFile(path.join(__dirname, "../assets/loading.html"));
  loadingWindow.on("closed", () => (loadingWindow = null));
  // The splash file loads near-instantly, but progress events from the main
  // window can fire before its JS is ready — replay the latest state then.
  loadingWindow.webContents.once("did-finish-load", () => {
    renderLoadProgress(lastLoadProgress.pct, lastLoadProgress.label);
  });
}

// ─── Splash progress (real load stages, not a fake bar) ────────────────────
// Tracks the newest stage; renderLoadProgress pushes it into loading.html via
// window.setProgress. Safe to call before the splash finished loading.
let lastLoadProgress = { pct: 5, label: "Starting..." };

// Brand splash hold: the loading screen stays up this long before the main
// window even starts loading.
const SPLASH_MIN_MS = 5000;

function renderLoadProgress(pct: number, label: string, force = false) {
  // WebContents events can arrive out of order — the bar must never run
  // backwards (e.g. a late did-finish-load overwriting the 100% state).
  // Updater phases pass force=true since a fresh download legitimately
  // restarts the bar from low percentages.
  if (!force && pct < lastLoadProgress.pct) return;
  lastLoadProgress = { pct, label };
  if (!loadingWindow || loadingWindow.isDestroyed()) return;
  loadingWindow.webContents
    .executeJavaScript(
      `window.setProgress && window.setProgress(${pct}, ${JSON.stringify(label)})`,
    )
    .catch(() => {
      /* splash not ready yet — replayed on its did-finish-load */
    });
}

// ─── Reachability probe ────────────────────────────────────────────────────
// navigator.onLine is often stuck "true" (virtual adapters/VPNs) and the
// Chromium disk cache can paint the app shell with zero connectivity, so
// neither signal can gate boot. This probe decides it instead.
async function isFrontendReachable(): Promise<boolean> {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const resp = await fetch(FRONTEND_URL, {
      signal: ctrl.signal,
      redirect: "follow",
    });
    console.log(
      `[Boot] Probe ${resp.ok ? "reachable" : `unreachable (HTTP ${resp.status})`} in ${Date.now() - started}ms`,
    );
    return resp.ok;
  } catch (err: any) {
    console.log(
      `[Boot] Probe failed in ${Date.now() - started}ms (${err?.name ?? err})`,
    );
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Authoritative offline banner control (overrides the splash's own
// navigator.onLine hint, which is best-effort only).
function setSplashOffline(offline: boolean) {
  if (!loadingWindow || loadingWindow.isDestroyed()) return;
  loadingWindow.webContents
    .executeJavaScript(
      `window.setOffline && window.setOffline(${offline ? "true" : "false"})`,
    )
    .catch(() => {});
}

// Focus helper: never reveal the main window before it has loaded.
function focusMainOrLoader() {
  if (mainLoaded && mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
    return;
  }
  if (loadingWindow && !loadingWindow.isDestroyed()) {
    if (!loadingWindow.isVisible()) loadingWindow.show();
    loadingWindow.focus();
  }
}

// ─── Boot-time auto-update (splash only — no separate update UI) ──────────
// Update check/download/install happens here, before the main window loads.
// While the app is already running, the interval check in setupAutoUpdater
// downloads silently in the background and installs on quit
// (autoInstallOnAppQuit) or at the next boot.
let updaterBusy = false;
let bootUpdateVersion: string | null = null;

// One-shot check that resolves {available:false} on timeout/error instead of
// hanging boot when the update feed is unreachable.
function checkOnce(timeoutMs = 15000): Promise<{ available: boolean; version?: string }> {
  return new Promise((resolve) => {
    const cleanup = () => {
      clearTimeout(timer);
      autoUpdater.removeListener("update-available", onAvail);
      autoUpdater.removeListener("update-not-available", onNone);
      autoUpdater.removeListener("error", onErr);
    };
    const done = (result: { available: boolean; version?: string }) => {
      cleanup();
      resolve(result);
    };
    const onAvail = (info: any) => done({ available: true, version: info?.version });
    const onNone = () => done({ available: false });
    const onErr = () => done({ available: false });
    const timer = setTimeout(() => done({ available: false }), timeoutMs);
    autoUpdater.once("update-available", onAvail);
    autoUpdater.once("update-not-available", onNone);
    autoUpdater.once("error", onErr);
    autoUpdater.checkForUpdates().catch(() => done({ available: false }));
  });
}

// Returns true when the app is restarting to install (caller must stop boot).
async function runBootUpdate(): Promise<boolean> {
  if (IS_DEV) return false;
  updaterBusy = true;
  try {
    renderLoadProgress(8, "Checking for updates");
    const check = await checkOnce();
    if (!check.available) return false;
    bootUpdateVersion = check.version ?? "new version";
    renderLoadProgress(8, `Update found (${bootUpdateVersion}). Downloading`, true);
    await autoUpdater.downloadUpdate();
    renderLoadProgress(100, "Update ready. Restarting", true);
    await new Promise((r) => setTimeout(r, 600));
    isQuiting = true;
    autoUpdater.quitAndInstall(true, true);
    return true;
  } catch (err) {
    console.error("[Updater] Boot update failed, starting current version:", err);
    renderLoadProgress(10, "Update failed. Starting current version", true);
    return false;
  } finally {
    updaterBusy = false;
    bootUpdateVersion = null;
  }
}

// ─── Main app window ───────────────────────────────────────────────────────
function createMainWindow() {
  mainLoaded = false;
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    backgroundColor: "#0a0a0a",
    icon: path.join(__dirname, "../assets/icon.ico"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      sandbox: true,
    },
  });

  // Real staged progress for the splash screen.
  const wc = mainWindow.webContents;
  let loadAttempts = 0;
  const MAX_LOAD_ATTEMPTS = 3;
  wc.on("did-start-loading", () =>
    renderLoadProgress(15, "Connecting to FlowDesk"),
  );
  wc.on("dom-ready", () =>
    renderLoadProgress(60, "Loading your workspace"),
  );
  wc.on("did-finish-load", () => {
    loadAttempts = 0;
    renderLoadProgress(85, "Almost ready");
  });
  wc.on("did-fail-load", (_event, errorCode, _desc, _url, isMainFrame) => {
    // Ignore subframe noise (ads/trackers/iframes) and navigation aborts
    // (ERR_ABORTED, e.g. hash changes) — only the main page matters here.
    if (!isMainFrame || errorCode === -3) return;
    // Never give up: quick retries first, then wait calmly for the link to
    // return (the splash doubles as the offline screen). The offline banner
    // in loading.html covers instant feedback via navigator.onLine.
    loadAttempts += 1;
    const waiting = loadAttempts >= MAX_LOAD_ATTEMPTS;
    // Allow the bar to climb again from the retry below.
    lastLoadProgress = { pct: 0, label: lastLoadProgress.label };
    renderLoadProgress(
      15,
      waiting ? "Waiting for internet connection" : "Connection failed. Retrying",
    );
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(`${FRONTEND_URL}/#/dashboard`);
      }
    }, waiting ? 15000 : 3000);
  });

  // First connectivity probe starts immediately so it overlaps the brand
  // hold below — online users never wait twice. A cached shell must never
  // count as "online", so boot always waits for a genuine answer.
  let pendingProbe: Promise<boolean> | null = isFrontendReachable().then(
    (reachable) => {
      setSplashOffline(!reachable);
      return reachable;
    },
  );

  async function probeOnce(): Promise<boolean> {
    const reachable = await isFrontendReachable();
    setSplashOffline(!reachable);
    return reachable;
  }

  // Forced hold: keep the splash up for SPLASH_MIN_MS showing "Starting"
  // (dots blink via CSS), then continue boot with the probe result.
  renderLoadProgress(5, "Starting");
  const loadStartTimer = setTimeout(() => {
    void bootAfterHold();
  }, SPLASH_MIN_MS);

  async function bootAfterHold() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    renderLoadProgress(10, "Checking connection");
    // The head-start probe is usually resolved by now; fall through to the
    // wait loop only when truly offline.
    let reachable = false;
    try {
      reachable = pendingProbe ? await pendingProbe : false;
    } catch {
      reachable = false;
    } finally {
      pendingProbe = null;
    }
    while (!reachable) {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      renderLoadProgress(10, "Waiting for internet connection");
      await new Promise((r) => setTimeout(r, 5000));
      if (!mainWindow || mainWindow.isDestroyed()) return;
      reachable = await probeOnce();
    }
    if (!mainWindow || mainWindow.isDestroyed()) return;
    setSplashOffline(false);
    // Self-update first (splash shows it); skip straight to loading when
    // already current. A restarting install stops boot here.
    const restarting = await runBootUpdate();
    if (restarting) return;
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.loadURL(`${FRONTEND_URL}/#/dashboard`);
  }

  mainWindow.once("ready-to-show", () => {
    mainLoaded = true;
    // Let the 100% state paint before swapping windows.
    renderLoadProgress(100, "Ready");
    setTimeout(() => {
      if (loadingWindow) loadingWindow.close();
      mainWindow?.show();
      mainWindow?.maximize();
    }, 250);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("close", (event) => {
    if (!isQuiting) {
      event.preventDefault();
      mainWindow?.hide();
      return false;
    }
  });

  mainWindow.on("closed", () => {
    clearTimeout(loadStartTimer);
    mainWindow = null;
  });

  if (coreIpcRegistered) return;
  coreIpcRegistered = true;

  ipcMain.on("reload-app", () => mainWindow?.reload());

  // ─── E2EE secure storage (OS keychain via safeStorage) ───────────────────
  // Stores small blobs (device private-key backups) encrypted with the OS
  // credential vault (DPAPI on Windows / Keychain on macOS / libsecret).
  const secureStoreDir = path.join(app.getPath("userData"), "e2ee-store");
  const resolveSecurePath = (key: string) =>
    path.join(secureStoreDir, `${key.replace(/[^a-zA-Z0-9_-]/g, "_")}.bin`);

  ipcMain.handle("safe-storage-save", (_event, { key, value }: { key: string; value: string }) => {
    try {
      if (!safeStorage.isEncryptionAvailable()) return false;
      fs.mkdirSync(secureStoreDir, { recursive: true });
      fs.writeFileSync(resolveSecurePath(key), safeStorage.encryptString(value));
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle("safe-storage-read", (_event, { key }: { key: string }) => {
    try {
      const file = resolveSecurePath(key);
      if (!fs.existsSync(file)) return null;
      const buf = fs.readFileSync(file);
      if (!safeStorage.isEncryptionAvailable()) return null;
      return safeStorage.decryptString(buf);
    } catch {
      return null;
    }
  });

  // Handle show-notification request from renderer (delegation)
  ipcMain.on(
    "show-notification",
    (event, payload: { title: string; message: string; link?: string }) => {
      // Use icon.png for notifications (falls back to ico if png not found)
      const iconPath = path.join(__dirname, "../assets/icon.png");

      const notification = new Notification({
        title: payload.title,
        body: payload.message,
        icon: iconPath,
        silent: false,
      });

      notification.on("click", () => {
        console.log(`[Notification] Clicked: ${payload.title}`);
        if (!mainLoaded) {
          focusMainOrLoader();
          return;
        }
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          if (!mainWindow.isVisible()) mainWindow.show();
          mainWindow.focus();

          if (payload.link) {
            mainWindow.webContents.send("navigate-requested", payload.link);
          }
        }
      });

      notification.on("show", () => {
        console.log(`[Notification] Shown: ${payload.title}`);
      });

      notification.show();
    },
  );
}

// ─── System Tray ───────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, "../assets/icon.png");
  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    { label: "Open FlowDesk", click: () => mainWindow?.show() },
    { type: "separator" },
    {
      label: "Quit FlowDesk",
      click: () => {
        isQuiting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip("FlowDesk");
  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    focusMainOrLoader();
  });
}

// ─── Auto-updater events ───────────────────────────────────────────────────
function setupAutoUpdater() {
  // Check for updates every 30 minutes while running
  const CHECK_INTERVAL_MS = 30 * 60 * 1000;

  autoUpdater.on("checking-for-update", () => {
    console.log("[Updater] Checking for update...");
  });

  autoUpdater.on("update-available", (info) => {
    console.log(`[Updater] Update available: v${info.version}`);
    // The boot flow drives its own check — this only covers updates found
    // while the app is already running: download silently, install on quit
    // (autoInstallOnAppQuit) or at the next boot.
    if (IS_DEV || updaterBusy || !mainLoaded) return;
    updaterBusy = true;
    autoUpdater
      .downloadUpdate()
      .catch((err: any) => {
        console.error("[Updater] Background download failed:", err);
      })
      .finally(() => {
        updaterBusy = false;
      });
  });

  autoUpdater.on("update-not-available", () => {
    console.log("[Updater] App is up to date.");
  });

  autoUpdater.on("download-progress", (progress) => {
    console.log(
      `[Updater] Download progress: ${Math.round(progress.percent)}%`,
    );
    // Splash shows live progress during boot; in-session downloads are silent.
    if (!mainLoaded && bootUpdateVersion) {
      renderLoadProgress(
        Math.round(progress.percent),
        `Updating to ${bootUpdateVersion}`,
        true,
      );
    }
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log(`[Updater] Update downloaded: v${info.version}`);
    // Boot flow installs immediately via quitAndInstall — this covers the
    // in-session background download: quitting (or relaunching) applies it.
    if (mainLoaded) {
      new Notification({
        title: "FlowDesk update ready",
        body: `v${info.version} will install when you quit the app.`,
      }).show();
    }
  });

  autoUpdater.on("error", (err) => {
    console.error("[Updater] Error:", err);
  });

  // No check at startup here — the boot flow (runBootUpdate) owns the first
  // check so the splash can show it. Interval skips while boot is updating.
  if (!IS_DEV) {
    setInterval(() => {
      if (!IS_DEV && !updaterBusy) {
        autoUpdater.checkForUpdates().catch((err: any) => {
          console.error("[Updater] Interval check failed:", err);
        });
      }
    }, CHECK_INTERVAL_MS);
  }
}

// ─── App lifecycle ─────────────────────────────────────────────────────────
app.on("ready", () => {
  if (process.platform === "win32") {
    app.setAppUserModelId("FlowDesk");
  }
  // Register custom protocol for OAuth deep link
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient("flowdesk", process.execPath, [path.resolve(process.argv[1])]);
    }
  } else {
    app.setAsDefaultProtocolClient("flowdesk");
  }
  Menu.setApplicationMenu(null);
  createLoadingWindow();
  createMainWindow();
  createTray();
  setupAutoUpdater();
});

// Since the window is hidden instead of closed, this might rarely be called
// but we still prevent quitting on Mac if they close all windows.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (isQuiting) app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) createMainWindow();
});

export default app;
