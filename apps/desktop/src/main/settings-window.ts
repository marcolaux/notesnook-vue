/**
 * Settings window (Phase 7.0 on-site) — Settings lives in its own Electron
 * `BrowserWindow`, opened as a **singleton** from any app window.
 *
 * `openSettingsWindow()` focuses the existing window if one is alive (restoring
 * it if minimized); otherwise it creates a smaller, sidebar-less window that
 * loads the same renderer with `?window=settings`. The renderer's `App.vue`
 * detects that query and runs a *minimal* boot (DB + settings + spell-check +
 * i18n only — no auth/sync/vault/notes) and routes to the top-level
 * `/settings` route, which renders `SettingsLayout` (a drag titlebar +
 * `SettingsView`) — no `ShellLayout`/sidebar.
 *
 * The window reuses the per-platform chrome from `titlebar.ts` (frameless +
 * vibrancy/acrylic) so it matches the app's glass aesthetic, and attaches the
 * tRPC bridge so the settings renderer can reach main-process capabilities
 * (sqlite, spell-checker, window, …) just like the main window.
 *
 * Multi-window note: the settings renderer opens its own `@notesnook/core`
 * `Database` connection to the same encrypted SQLite file. WAL mode + the busy
 * timeout let the two connections coexist; `db.init()` migrations are
 * idempotent (no-op once the main window has already migrated). The settings
 * window never binds sync/vault/notes events, so there is no double-sync.
 */
import { BrowserWindow } from "electron";
import { resolve } from "node:path";
import { buildBrowserWindowOptionsForOS } from "./titlebar";
import { attachTRPC } from "./ipc";

let settingsWindow: BrowserWindow | null = null;

/**
 * Open the shared Settings window. Call from any app window via the
 * `WindowServer.openSettings` bridge procedure.
 *
 * @param preloadPath absolute path to the preload bundle (same as the main
 *   window — resolved from the main module's `__dirname`).
 */
export function openSettingsWindow(preloadPath: string): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    // eslint-disable-next-line no-console
    console.log("[settings-window] focusing existing window");
    if (settingsWindow.isMinimized()) settingsWindow.restore();
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  const base = buildBrowserWindowOptionsForOS(process.platform, preloadPath);
  settingsWindow = new BrowserWindow({
    ...base,
    width: 760,
    height: 680,
    minWidth: 480,
    minHeight: 400,
    title: "Settings"
  });

  // Same bridge as the main window so the settings renderer can call
  // desktop.* procedures (sqlite for db.settings, spell-checker, window…).
  attachTRPC(settingsWindow);

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
  settingsWindow.once("ready-to-show", () => {
    settingsWindow?.show();
    settingsWindow?.moveTop();
    settingsWindow?.focus();
  });
  settingsWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    // eslint-disable-next-line no-console
    console.error(`[settings-window] did-fail-load ${code} ${desc} ${url}`);
  });

  // Mirror the main window's dev console forwarding so the settings renderer's
  // console.info/error/warn surfaces in the terminal (otherwise its boot is
  // invisible — only `desktop.log` tRPC calls show up).
  if (process.env["ELECTRON_RENDERER_URL"]) {
    settingsWindow.webContents.on("console-message", (_e, _level, message, line, source) => {
      const loc = source ? ` @${source}:${line ?? "?"}` : "";
      console.log(`[settings] ${message}${loc}`);
    });
  }

  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devUrl) {
    void settingsWindow.loadURL(`${devUrl}?window=settings`);
  } else {
    void settingsWindow.loadFile(resolve(__dirname, "../renderer/index.html"), {
      query: { window: "settings" }
    });
  }
}