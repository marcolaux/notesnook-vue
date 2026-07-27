/**
 * Account window (multi-account) — opens a NEW full-shell app window bound to a
 * specific account `contextId`, so several accounts can be open simultaneously,
 * one per window.
 *
 * The window loads the renderer with `?ctx=<contextId>` (no `window=`, so
 * `App.vue` boots the full shell — sidebar + notes list + editor — exactly like
 * the default main window, not the minimal Settings boot or focus-mode note
 * boot). `bootstrap(contextId)` reads that `ctx` and opens the account's own
 * encrypted SQLite context; because each window is its own renderer process,
 * each holds its own `Database` singleton + `Hosts`, so two account windows can
 * talk to two different servers at once.
 *
 * Geometry is tracked per-context by the renderer: the new window's
 * `bindContextToSession` binds its webContents to `getCurrentContext()` (the
 * `ctx`), so its `saveWindowBounds` writes land under the right account in
 * `userData/session.json` (`cache.contexts[ctx].mainBounds`). No main-side
 * tracking is needed here beyond creating the window.
 *
 * The window reuses the per-platform chrome from `titlebar.ts` (frameless +
 * vibrancy/acrylic) and `attachTRPC` so the account renderer reaches the same
 * main-process capabilities as the main window.
 *
 * Electron-only; not contract-tested — the renderer calls it through the typed
 * `desktop.window.openAccountWindow` bridge.
 */
import { BrowserWindow } from "electron";
import { resolve } from "node:path";
import { buildBrowserWindowOptionsForOS } from "./titlebar";
import { attachTRPC } from "./ipc";
import { setupExternalNavigation } from "./navigation";
import { sanitizeBounds, type WindowBounds } from "../contracts/session-state";
import { tMain } from "./i18n";

/**
 * Open a full-shell window bound to `contextId`. Call from any app window via
 * the `WindowServer.openAccountWindow` bridge procedure (the account switcher's
 * "Open in new window" action).
 *
 * @param preloadPath absolute path to the preload bundle (same as the main
 *   window — resolved from the main module's `__dirname`).
 * @param contextId the account's `hashEmail` (or `"local"`) to bind the window to.
 * @param bounds optional saved size/position to restore.
 */
export function openAccountWindow(
  preloadPath: string,
  contextId: string,
  bounds?: WindowBounds | undefined
): void {
  createShellWindow(preloadPath, { ctx: contextId }, bounds);
}

/**
 * Open a NEW window dedicated to signing into an account — the switcher's "Add
 * account" action. Boots the LOCAL context (`?ctx=local`) so the window starts
 * logged-out (no cached account token auto-logging it in) + `?signin=1` so
 * `App.vue` forces the login screen regardless of the `skippedLogin` flag. The
 * user signs into a new account; `auth.login` switches this window to that
 * account's context (token-based) and the shell then shows. The caller's
 * window is left untouched (per-window multi-account).
 *
 * @param preloadPath absolute path to the preload bundle.
 * @param bounds optional saved size/position to restore.
 */
export function openSignInWindow(
  preloadPath: string,
  bounds?: WindowBounds | undefined
): void {
  createShellWindow(preloadPath, { ctx: "local", signin: "1" }, bounds);
}

/** Shared full-shell window creator. `query` is the URL query the renderer
 *  reads at boot (`ctx` binds the account; `signin` forces the login screen). */
function createShellWindow(
  preloadPath: string,
  query: Record<string, string>,
  bounds?: WindowBounds | undefined
): void {
  const clean = sanitizeBounds(bounds);
  const base = buildBrowserWindowOptionsForOS(process.platform, preloadPath, clean);
  const win = new BrowserWindow({ ...base, title: tMain("window.note") });
  // Re-apply maximize after construction (saved size is the unmaximized restore
  // size; a maximized window should open maximized regardless).
  if (clean?.maximized) {
    win.once("ready-to-show", () => win.maximize());
  }

  // Same bridge as the main window so the account renderer can call desktop.*
  // procedures (sqlite, window, session, accountRegistry, …) just like the main
  // window.
  attachTRPC(win);
  setupExternalNavigation(win.webContents);

  win.once("ready-to-show", () => {
    win.show();
    win.moveTop();
    win.focus();
  });
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    // eslint-disable-next-line no-console
    console.error(`[account-window] did-fail-load ${code} ${desc} ${url}`);
  });

  // Mirror the main window's dev console forwarding so the account renderer's
  // console surfaces in the terminal during dev.
  if (process.env["ELECTRON_RENDERER_URL"]) {
    win.webContents.on("console-message", (_e, _level, message, line, source) => {
      const loc = source ? ` @${source}:${line ?? "?"}` : "";
      console.log(`[account] ${message}${loc}`);
    });
  }

  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devUrl) {
    const qs = new URLSearchParams(query).toString();
    void win.loadURL(`${devUrl}?${qs}`);
  } else {
    void win.loadFile(resolve(__dirname, "../renderer/index.html"), { query });
  }
}