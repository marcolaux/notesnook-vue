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
      // `@notesnook/core` runs in the renderer (the renderer orchestrates the
      // Database; storage/crypto/fs are shims that call the main process over
      // tRPC). Core's browser build + the libsodium browser build reference
      // node globals (`Buffer`, `process`) at module-eval time, so the
      // renderer main world needs them. `contextIsolation` stays on so the
      // preload/tRPC bridge remains in its own world.
      nodeIntegration: true,
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

  // Surface renderer console messages in the terminal during dev — the
  // renderer is a separate page whose console otherwise only lives in
  // DevTools, making boot/bootstrap failures invisible to `npm run dev`.
  if (isDev) {
    window.webContents.on("console-message", (_e, _level, message, line, source) => {
      const loc = source ? ` @${source}:${line ?? "?"}` : "";
      console.log(`[renderer] ${message}${loc}`);
    });
    window.webContents.on("did-fail-load", (_e, code, desc, url) => {
      console.error(`[renderer] did-fail-load ${code} ${desc} ${url}`);
    });
    window.webContents.on("render-process-gone", (_e, details) => {
      console.error(`[renderer] render-process-gone ${details.reason}`);
    });
  }

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