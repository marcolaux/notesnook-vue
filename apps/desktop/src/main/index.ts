import { app, BrowserWindow, shell } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { attachTRPC } from "./ipc";
import { registerSQLite } from "./sqlite";
import { registerCompressor } from "./compress";
import { registerSafeStorage } from "./safe-storage";
import { registerFileStorage } from "./file-storage";
import { buildBrowserWindowOptionsForOS } from "./titlebar";
import {
  enableDeepLinkProtocol,
  findDeepLinkInArgv,
  handleDeepLinkUrl,
  registerDeepLinkListeners,
  setDeepLinkWindow
} from "./deep-link";
import { registerTray } from "./tray";
import { registerUpdater } from "./updater";

const __dirname = dirname(fileURLToPath(import.meta.url));

const isDev = !app.isPackaged;

// Register deep-link listeners BEFORE `app.whenReady()` so a cold-start
// `open-url` (macOS) is caught and queued rather than dropped.
registerDeepLinkListeners();

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow(
    buildBrowserWindowOptionsForOS(
      process.platform,
      resolve(__dirname, "../preload/index.mjs")
    )
  );

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

  // Register the `nn://` custom protocol with the OS.
  enableDeepLinkProtocol();

  // A cold-start deep link (Win/Linux) may be in argv; queue it so it is
  // dispatched once the window exists. On macOS the `open-url` listener already
  // queued it.
  const argvLink = findDeepLinkInArgv(process.argv);
  if (argvLink) {
    // handleDeepLinkUrl queues internally when no window exists yet.
    handleDeepLinkUrl(argvLink);
  }

  const window = createMainWindow();
  // Bind the window + flush any queued deep links (cold-start open-url / argv).
  setDeepLinkWindow(window);
  // Auto-updater (electron-updater). No-op in dev; the window is used to
  // forward `updater:status` state changes to the renderer (on-site UI).
  registerUpdater(window);
  // System tray (New Note / New Notebook / Show / Quit). The tray forwards
  // new-note/new-notebook to the renderer over `app:tray-action`.
  registerTray(window);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});