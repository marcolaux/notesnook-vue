import { app, BrowserWindow, shell } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { attachTRPC } from "./ipc";
import { registerSQLite } from "./sqlite";
import { registerCompressor } from "./compress";
import { registerSafeStorage } from "./safe-storage";
import { registerFileStorage } from "./file-storage";

const __dirname = dirname(fileURLToPath(import.meta.url));

const isDev = !app.isPackaged;

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: "hiddenInset",
    frame: process.platform === "darwin" ? false : true,
    backgroundColor: "#00000000",
    vibrancy: "under-window",
    visualEffectState: "active",
    webPreferences: {
      preload: resolve(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  window.on("ready-to-show", () => window.show());

  // Wire the tRPC IPC bridge for this window. Must happen after the window
  // exists so `createIPCHandler` can attach its `ipcMain.handle` listener.
  attachTRPC(window);

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev && process.env["ELECTRON_RENDERER_URL"]) {
    void window.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void window.loadFile(resolve(__dirname, "../renderer/index.html"));
  }

  return window;
}

void app.whenReady().then(() => {
  // Register main-process capability impls before the window/bridge is
  // created so procedures are ready when the renderer first calls them.
  registerSQLite();
  registerCompressor();
  registerSafeStorage();
  registerFileStorage();

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});