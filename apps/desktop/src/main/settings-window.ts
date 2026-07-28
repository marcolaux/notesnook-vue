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
import { setupExternalNavigation } from "./navigation";
import { tMain, registerLocaleChangeCallback } from "./i18n";

let settingsWindow: BrowserWindow | null = null;

/**
 * Re-apply the localized OS-native window title to the open Settings window.
 *
 * Why this exists: the renderer loads the same `index.html` as every other
 * window, whose `<title>Notesnook</title>` clobbers the `BrowserWindow` `title`
 * option once the page parses — so the Phase 7.2 `title: tMain(...)`
 * constructor option only flashes pre-paint, then becomes "Notesnook". This
 * re-asserts the localized title (a) once after `did-finish-load` so the
 * steady-state taskbar/Dock/Alt-Tab title is localized at first open, and
 * (b) on a live locale switch via the registered locale-change callback. The
 * in-app custom titlebar already localizes reactively (vue-i18n `t()`); this
 * only fixes the OS-native chrome. No-op when the window is closed/destroyed.
 */
function retitleSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.setTitle(tMain("window.settings"));
  }
}

registerLocaleChangeCallback(retitleSettingsWindow);

/**
 * Open the shared Settings window. Call from any app window via the
 * `WindowServer.openSettings` bridge procedure.
 *
 * @param preloadPath absolute path to the preload bundle (same as the main
 *   window — resolved from the main module's `__dirname`).
 */
/**
 * Is `win` the shared Settings window? Used by the app menu to give `Cmd/Ctrl+W`
 * window-close semantics in the Settings window (it has no editor tabs — the
 * renderer's `app:close-tab` handler is a no-op there) instead of the
 * tab-close semantics used in the main/note windows.
 */
export function isSettingsWindow(win: BrowserWindow | undefined | null): boolean {
  return !!win && !win.isDestroyed() && win === settingsWindow;
}

export function openSettingsWindow(preloadPath: string, section?: string, contextId?: string): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    // eslint-disable-next-line no-console
    console.log("[settings-window] focusing existing window");
    if (settingsWindow.isMinimized()) settingsWindow.restore();
    settingsWindow.show();
    settingsWindow.focus();
    // Reload the existing window to the requested section/context only when
    // either differs from what it is currently showing. Same section + same
    // context → just focus (no reload). A different `?ctx=` reloads so the
    // Settings window re-boots into the caller's account DB; a different
    // `?section=` deep-links as before. Best-effort: the renderer re-reads
    // both query params on mount.
    const u = new URL(settingsWindow.webContents.getURL());
    const curCtx = u.searchParams.get("ctx") ?? "";
    const newCtx = contextId ?? "";
    const curSection = u.searchParams.get("section") ?? "";
    const newSection = section ?? "";
    if (newCtx !== curCtx || newSection !== curSection) {
      if (section) u.searchParams.set("section", section);
      else u.searchParams.delete("section");
      if (contextId) u.searchParams.set("ctx", contextId);
      else u.searchParams.delete("ctx");
      void settingsWindow.webContents.loadURL(u.toString());
    }
    return;
  }

  const base = buildBrowserWindowOptionsForOS(process.platform, preloadPath);
  settingsWindow = new BrowserWindow({
    ...base,
    width: 760,
    height: 680,
    minWidth: 480,
    minHeight: 400,
    title: tMain("window.settings")
  });

  // Same bridge as the main window so the settings renderer can call
  // desktop.* procedures (sqlite for db.settings, spell-checker, window…).
  attachTRPC(settingsWindow);
  setupExternalNavigation(settingsWindow.webContents);

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

  // The page's `<title>Notesnook</title>` overrides the `BrowserWindow` `title`
  // option once it parses; re-assert the localized title after load completes
  // (and on every reload/HMR in dev) so the steady-state OS-native title is
  // localized. Idempotent + safe on a still-alive window. See
  // `retitleSettingsWindow` for the live locale-switch path.
  settingsWindow.webContents.on("did-finish-load", () => {
    retitleSettingsWindow();
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

  // Deep-link section (e.g. `?section=updates`) so callers like the title-bar
  // update badge can open Settings on a specific section. `SettingsLayout.vue`
  // reads this on mount to seed its active section. `?ctx=<id>` (when passed)
  // pins the Settings window to the caller's account context so it operates on
  // that account's DB; omitted → the renderer falls back to the shared
  // "last used" pointer (see `platform/bootstrap.ts`).
  const query: Record<string, string> = { window: "settings" };
  if (section) query.section = section;
  if (contextId) query.ctx = contextId;
  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devUrl) {
    const params = new URLSearchParams(query);
    void settingsWindow.loadURL(`${devUrl}?${params.toString()}`);
  } else {
    void settingsWindow.loadFile(resolve(__dirname, "../renderer/index.html"), { query });
  }
}