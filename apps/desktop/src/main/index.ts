import { app, BrowserWindow, ipcMain, nativeTheme, shell } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { attachTRPC } from "./ipc";
import { registerSQLite } from "./sqlite";
import { registerCompressor } from "./compress";
import { registerSafeStorage } from "./safe-storage";
import { registerFileStorage } from "./file-storage";
import {
  registerSession,
  getMainBoundsForLastContext,
  flushSession,
  trackMainWindow
} from "./session-state";
import type { WindowBounds } from "../contracts/session-state";
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
import { registerUpstreamChecker } from "./upstream-checker";
import { registerSpellChecker } from "./spell-checker";
import { registerAppMenu } from "./menu";
import { registerWindow, setMainWindow } from "./window";
import { registerDialog } from "./dialog";
import { registerShell } from "./shell";
import { registerReminders } from "./reminders";
import { registerAppState } from "./app-state";
import { initMainLocale, setMainLocale } from "./i18n";
import type { Locale } from "../contracts/i18n";
import { registerNavigationSecurity, setupExternalNavigation } from "./navigation";

const __dirname = dirname(fileURLToPath(import.meta.url));

const isDev = !app.isPackaged;

// Register navigation security & deep-link listeners BEFORE `app.whenReady()`
registerNavigationSecurity();
registerDeepLinkListeners();

function createMainWindow(bounds?: WindowBounds | undefined): BrowserWindow {
  const window = new BrowserWindow(
    buildBrowserWindowOptionsForOS(
      process.platform,
      resolve(__dirname, "../preload/index.mjs"),
      bounds
    )
  );

  // Re-apply maximize after construction (the saved size is the unmaximized
  // restore size; a maximized window should open maximized regardless).
  if (bounds?.maximized) {
    window.once("ready-to-show", () => window.maximize());
  }
  window.on("ready-to-show", () => window.show());

  // Wire the tRPC IPC bridge for this window. Must happen after the window
  // exists so `createIPCHandler` can attach its `ipcMain.handle` listener.
  attachTRPC(window);

  setupExternalNavigation(window.webContents);

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
  // Read the persisted interface locale (sync, from `app-state.json`) BEFORE
  // the menu / tray / windows are registered so first paint is already
  // localized. The renderer's `localStorage` value is the primary store; this
  // is the durable cross-origin mirror it writes via `appState.set`. The
  // `app:set-locale` IPC lets the renderer switch main's locale live (rebuilds
  // the app menu / tray / window titles) without a restart — see `main/i18n.ts`.
  initMainLocale();
  ipcMain.handle("app:set-locale", (_event, locale: Locale) => setMainLocale(locale));

  // Force the OS-native theme to dark so macOS `vibrancy: "under-window"` /
  // Windows `backgroundMaterial: "acrylic"` render a *dark* material that
  // matches the app's dark UI. Without this the acrylic follows the system
  // appearance — a light-mode system yields a bright acrylic that washes out
  // the dark theme's white text and translucent glassmorphism surfaces.
  // TODO(phase7): track the renderer's `themeMode` (light/dark/system) via IPC
  // so this follows the user's settings choice instead of hard-coding dark.
  nativeTheme.themeSource = "dark";

  // Window server: lets the renderer sync `nativeTheme.themeSource` to its
  // `themeMode` (light/dark/system) so the acrylic/vibrancy follows the app
  // theme, and open the shared Settings window. The `dark` default above is
  // the pre-window fallback; the renderer corrects it to the stored choice on
  // boot. The preload path is the same one the main BrowserWindow uses.
  registerWindow(resolve(__dirname, "../preload/index.mjs"));

  // Application menu: binds `Cmd/Ctrl+W` to "Close Tab" (renderer closes the
  // active editor tab via `app:close-tab`) instead of the default "Close
  // Window", plus `Cmd/Ctrl+N` → "New Note" and `Cmd/Ctrl+,` → "Settings…"
  // (opens the shared singleton Settings window). Standard edit/view/window
  // menus are preserved via roles (clipboard etc.).
  registerAppMenu(resolve(__dirname, "../preload/index.mjs"));

  // Register main-process capability impls before the window/bridge is
  // created so procedures are ready when the renderer first calls them.
  registerSQLite();
  registerCompressor();
  registerSafeStorage();
  registerFileStorage();
  // Session-state owner (editor tabs + split layout + note windows + bounds,
  // persisted to `userData/session.json` per account). Registered before the
  // window so `desktop.session.*` procedures are ready on first renderer call.
  registerSession();
  // App-state owner (`userData/app-state.json`) — origin-independent
  // persistence for the local-mode `skippedLogin` flag (the login gate that
  // renderer localStorage can lose on hard quit / origin drift). Registered
  // before the window so `desktop.appState.*` is ready on the boot reconcile.
  registerAppState();

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

  // Restore the main window's last size/position (best-effort, keyed by the
  // last-used context so the first window avoids a 1280×800 size flash). The
  // renderer corrects the context binding on boot (`bindContext`).
  const savedBounds = getMainBoundsForLastContext();
  const window = createMainWindow(savedBounds);
  // Persist the main window's bounds on resize/move/maximize (writes land under
  // the bound context once the renderer calls `bindContext`).
  trackMainWindow(window);
  // Bind the window + flush any queued deep links (cold-start open-url / argv).
  setDeepLinkWindow(window);
  // Track the main window so the Settings window can signal cross-window DB
  // mutations (backup import / vault actions) → main window reloads its stores.
  setMainWindow(window);
  // Auto-updater (electron-updater). No-op in dev; the window is used to
  // forward `updater:status` state changes to the renderer (on-site UI).
  registerUpdater(window);
  registerUpstreamChecker();
  // System tray (New Note / New Notebook / Show / Quit). The tray forwards
  // new-note/new-notebook to the renderer over `app:tray-action`.
  registerTray(window);
  // Spell-checker (Electron session.spellcheck). Bound to the main window's
  // session; the persisted enabled flag is applied here. The renderer toggles
  // languages + enabled over the bridge (on-site UI).
  registerSpellChecker(window);
  // File dialogs (save/open a user-chosen file) for Backup & Export. Parented
  // to the focused window at call time (app-modal when none is focused).
  registerDialog(() => BrowserWindow.getFocusedWindow() ?? undefined);
  // Shell — write decrypted attachment bytes to a temp file + open with the OS
  // handler, for the attachment preview's "Open externally" action.
  registerShell();
  // Reminders — OS-notification scheduling. Bound to the main window (used to
  // send `app:reminder-fired` back to the renderer so it can reschedule
  // repeats / drop fired once-reminders). The renderer computes fire times and
  // pushes the schedule over `desktop.reminders.schedule`.
  registerReminders(window);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Persist the session on quit: signal the main renderer to flush its last
// layout snapshot (best-effort — IPC may not land before quit), then write
// main's cached copy (authoritative — updated by debounced saves through the
// session). Covers Cmd+Q / tray Quit / window-close on every platform
// (`window-all-closed` only quits on non-darwin, so this is the reliable hook).
app.on("before-quit", () => {
  const main = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
  if (main) {
    try {
      main.webContents.send("app:before-quit");
    } catch {
      /* webContents gone — no-op */
    }
  }
  flushSession();
});