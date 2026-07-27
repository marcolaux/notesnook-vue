/**
 * Pane window (multi-window) — opens a detached editor *pane* (a group leaf +
 * all its tabs) in its own Electron `BrowserWindow`, torn off from a split in
 * another window.
 *
 * Mirrors `note-window.ts` but for a whole pane instead of a single note: main
 * keeps a `Map<paneId, BrowserWindow>` (one window per detached pane) AND a
 * `Map<paneId, LayoutSnapshot>` (the pane's tabs/groups/sessions). The URL
 * carries only the id (`?window=pane&paneId=<id>`); the pane renderer fetches
 * the snapshot through the typed `desktop.window.getPaneSnapshot` bridge and
 * `layout.hydrate`s it — reusing the *exact* main-window restore path
 * (`filterLayoutSnapshot` + `hydrate`). Keeping the snapshot out of the URL
 * avoids query-string size limits and keeps tab/group ids out of the address.
 *
 * `openPaneWindow` creates a new window each call (a detached pane is a fresh
 * window; unlike a single-note window there's no "focus existing" dedupe — each
 * detach produces its own pane window). The renderer's `App.vue` detects the
 * `?window=pane` query, runs the normal full-shell boot, hydrates the pane
 * snapshot (NOT a single `selectNote`), and mounts session persistence so the
 * pane's live layout saves back to its own session slot.
 *
 * The window reuses the per-platform chrome from `titlebar.ts` (frameless +
 * vibrancy/acrylic) and `attachTRPC` so the pane renderer reaches the same
 * main-process capabilities as the main window. Like the note window, it opens
 * its own `@notesnook/core` `Database` connection to the same encrypted SQLite
 * file (WAL + busy timeout + idempotent migrations make this safe).
 *
 * Electron-only; not contract-tested — the renderer calls it through the typed
 * `desktop.window.openPaneWindow` / `releasePane` / `getPaneSnapshot` bridges.
 * The pure geometry decision reuses the contract-tested `resolveTabRelease` in
 * `contracts/tab-tear-off.ts`.
 */
import { BrowserWindow } from "electron";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { buildBrowserWindowOptionsForOS } from "./titlebar";
import { attachTRPC } from "./ipc";
import { setupExternalNavigation } from "./navigation";
import { sanitizeBounds, type LayoutSnapshot, type WindowBounds } from "../contracts/session-state";
import { addPaneWindow, trackPaneWindow } from "./session-state";
import { tMain } from "./i18n";

/** One window per detached pane id. */
const paneWindows = new Map<string, BrowserWindow>();
/** The snapshot each pane window hydrates from, keyed by the paneId in its URL. */
const paneSnapshots = new Map<string, LayoutSnapshot>();
/** Identity set for `isPaneWindow` (membership check used by `releaseTab`). */
const paneWindowSet = new WeakSet<BrowserWindow>();

/** True when `win` is a detached pane window. Used by `releaseTab`'s
 *  `WindowRect` builder — pane windows are NOT excluded (they have editor
 *  bodies and are valid tab-move targets, unlike the Settings window). */
export function isPaneWindow(win: BrowserWindow): boolean {
  return paneWindowSet.has(win);
}

/** The snapshot for `paneId`, or `null` when unknown (consumed/evicted or the
 *  window opened after a main restart). The pane renderer re-`init()`s an empty
 *  root pane in the `null` case. */
export function getPaneSnapshot(paneId: string): LayoutSnapshot | null {
  return paneSnapshots.get(paneId) ?? null;
}

/**
 * Open a window for a detached pane, hydrating from `snapshot`. Generates a
 * fresh `paneId`, stores the snapshot in memory, and loads
 * `?window=pane&paneId=<id>`. Call from any app window via the
 * `WindowServer.openPaneWindow` bridge procedure.
 *
 * Optional `bounds` restores a saved size/position (used when reopening pane
 * windows from the last session); optional `contextId` lets main track the pane
 * window's bounds + layout under the opening account so it reopens next run;
 * when omitted the pane window still works but isn't persisted.
 *
 * Returns the generated `paneId` (main's `releasePane` toreOff path doesn't
 * need it, but session restore + tests benefit from a deterministic handle).
 *
 * @param preloadPath absolute path to the preload bundle (same as the main
 *   window — resolved from the main module's `__dirname`).
 * @param snapshot the pane's layout (its group + tabs + sessions).
 */
export function openPaneWindow(
  preloadPath: string,
  snapshot: LayoutSnapshot,
  bounds?: WindowBounds | undefined,
  contextId?: string | undefined
): string {
  const paneId = randomUUID();
  const clean = sanitizeBounds(bounds);
  const base = buildBrowserWindowOptionsForOS(process.platform, preloadPath, clean);
  const win = new BrowserWindow({ ...base, title: tMain("window.note") });
  if (clean?.maximized) {
    win.once("ready-to-show", () => win.maximize());
  }

  // Same bridge as the main window so the pane renderer can call desktop.*
  // procedures (sqlite, window, session, …) just like the main window.
  attachTRPC(win);
  setupExternalNavigation(win.webContents);

  paneWindows.set(paneId, win);
  paneSnapshots.set(paneId, snapshot);
  paneWindowSet.add(win);
  win.on("closed", () => {
    paneWindows.delete(paneId);
    paneSnapshots.delete(paneId);
    // WeakSet membership clears automatically once the window is GC'd; the
    // `closed` handler in `trackPaneWindow` removes the session entry.
  });

  // Track the pane window in the session so it reopens next run (bounds + its
  // layout snapshot). Skipped when the caller didn't pass a contextId
  // (degraded mode — the window still works, just isn't persisted).
  if (contextId) {
    addPaneWindow(contextId, paneId, snapshot, clean);
    trackPaneWindow(win, paneId, contextId);
  }

  win.once("ready-to-show", () => {
    win.show();
    win.moveTop();
    win.focus();
  });
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    // eslint-disable-next-line no-console
    console.error(`[pane-window] did-fail-load ${code} ${desc} ${url}`);
  });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    win.webContents.on("console-message", (_e, _level, message, line, source) => {
      const loc = source ? ` @${source}:${line ?? "?"}` : "";
      console.log(`[pane] ${message}${loc}`);
    });
  }

  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devUrl) {
    const ctx = contextId ? `&ctx=${encodeURIComponent(contextId)}` : "";
    void win.loadURL(`${devUrl}?window=pane&paneId=${encodeURIComponent(paneId)}${ctx}`);
  } else {
    const query: Record<string, string> = { window: "pane", paneId };
    if (contextId) query.ctx = contextId;
    void win.loadFile(resolve(__dirname, "../renderer/index.html"), { query });
  }
  return paneId;
}