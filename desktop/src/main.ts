import {
  app,
  BrowserWindow,
  shell,
  ipcMain,
  dialog,
  Menu,
  Tray,
  nativeImage,
  Notification,
} from "electron";
import * as path from "path";
import * as dotenv from "dotenv";
import { autoUpdater } from "electron-updater";

// Load environment variables
dotenv.config({ path: path.join(__dirname, "../.env") });

// const FRONTEND_URL =
//   process.env.FRONTEND_URL || "https://flowdesk-frontend-g35x.onrender.com";
// const FRONTEND_URL =
  // process.env.FRONTEND_URL || "https://prince-principal-skirts-capture.trycloudflare.com/";
const FRONTEND_URL =
  process.env.FRONTEND_URL || "https://flowdesk.raksco.in";
// const IS_DEV = process.env.NODE_ENV === "development";
const IS_DEV = process.env.NODE_ENV === "development";

let mainWindow: BrowserWindow | null = null;
let loadingWindow: BrowserWindow | null = null;
let updateOverlay: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuiting = false;

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
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ─── Auto-updater configuration ────────────────────────────────────────────
autoUpdater.autoDownload = false; // Download on user request only
autoUpdater.autoInstallOnAppQuit = true; // Install when user quits normally

// ─── Loading splash window ─────────────────────────────────────────────────
function createLoadingWindow() {
  loadingWindow = new BrowserWindow({
    width: 400,
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
}

// ─── Main app window ───────────────────────────────────────────────────────
function createMainWindow() {
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

  mainWindow.loadURL(`${FRONTEND_URL}/#/dashboard`);

  mainWindow.once("ready-to-show", () => {
    if (loadingWindow) loadingWindow.close();
    mainWindow?.show();
    mainWindow?.maximize();
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
    mainWindow = null;
    if (updateOverlay) {
      updateOverlay.close();
      updateOverlay = null;
    }
  });

  // Keep overlay anchored to bottom-right when main window moves or resizes
  mainWindow.on("move", repositionOverlay);
  mainWindow.on("resize", repositionOverlay);

  ipcMain.on("reload-app", () => mainWindow?.reload());

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

// ─── Update overlay (bottom-right card notification) ──────────────────────
const OVERLAY_WIDTH = 340;
const OVERLAY_HEIGHT = 150;
const OVERLAY_MARGIN = 16;

function createUpdateOverlay(version?: string) {
  if (!mainWindow || updateOverlay) return;

  const [mx, my] = mainWindow.getPosition();
  const [mw, mh] = mainWindow.getSize();

  updateOverlay = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
    x: mx + mw - OVERLAY_WIDTH - OVERLAY_MARGIN,
    y: my + mh - OVERLAY_HEIGHT - OVERLAY_MARGIN,
    parent: mainWindow,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: true,
    show: false,
    icon: path.join(__dirname, "../assets/icon.ico"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  updateOverlay.loadFile(path.join(__dirname, "../assets/update-overlay.html"));

  updateOverlay.once("ready-to-show", () => {
    updateOverlay?.show();
    if (version) {
      updateOverlay?.webContents.send("update-info", { version });
    }
  });

  updateOverlay.on("closed", () => {
    updateOverlay = null;
  });
}

function repositionOverlay() {
  if (!mainWindow || !updateOverlay) return;
  if (updateOverlay.isDestroyed()) { updateOverlay = null; return; }
  const [mx, my] = mainWindow.getPosition();
  const [mw, mh] = mainWindow.getSize();
  updateOverlay.setPosition(
    mx + mw - OVERLAY_WIDTH - OVERLAY_MARGIN,
    my + mh - OVERLAY_HEIGHT - OVERLAY_MARGIN,
  );
}

function sendToOverlay(channel: string, data?: any) {
  if (updateOverlay) {
    updateOverlay.webContents.send(channel, data);
  }
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
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.focus() : mainWindow.show();
    }
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
    createUpdateOverlay(info.version);
  });

  autoUpdater.on("update-not-available", () => {
    console.log("[Updater] App is up to date.");
  });

  autoUpdater.on("download-progress", (progress) => {
    console.log(
      `[Updater] Download progress: ${Math.round(progress.percent)}%`,
    );
    sendToOverlay("download-progress", progress);
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log(`[Updater] Update downloaded: v${info.version}`);
    sendToOverlay("update-downloaded", info);
  });

  autoUpdater.on("error", (err) => {
    console.error("[Updater] Error:", err);

    if (updateOverlay) {
      updateOverlay.close();
      updateOverlay = null;
      dialog.showErrorBox(
        "Update Failed",
        `Could not download the update. Please try again later.\n\n${err.message}`,
      );
    }
  });

  // IPC: handle overlay actions (registered once)
  ipcMain.removeAllListeners("update-action");
  ipcMain.removeAllListeners("start-download");
  ipcMain.on("update-action", (_event, action: string) => {
    if (action === "restart") {
      autoUpdater.quitAndInstall(false, true);
    } else if (action === "dismiss") {
      if (updateOverlay) {
        updateOverlay.close();
        updateOverlay = null;
      }
    }
  });
  ipcMain.on("start-download", async () => {
    try {
      await autoUpdater.downloadUpdate();
    } catch (err: any) {
      console.error("[Updater] Download failed:", err);
      if (updateOverlay && !updateOverlay.isDestroyed()) {
        updateOverlay.webContents.send("download-error", err.message || "Download failed");
      }
    }
  });

  // Initial check
  if (!IS_DEV) {
    autoUpdater.checkForUpdates();
    setInterval(() => {
      if (!IS_DEV) autoUpdater.checkForUpdates();
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
