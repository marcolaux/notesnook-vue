/**
 * Note window (multi-window) — opens a note in its own Electron `BrowserWindow`,
 * torn off from a tab in another window.
 *
 * Mirrors `settings-window.ts` but keeps a `Map<noteId, BrowserWindow>` instead
 * of a singleton slot: one window per note. `openNoteWindow` focuses the
 * existing window for that note if one is alive (restoring it if minimized);
 * otherwise it creates a new window that loads the same renderer with
 * `?window=note&noteId=<id>`. The renderer's `App.vue` detects that query, runs
 * the *normal* full-shell boot, enables **focus mode** (hides sidebar + notes
 * list), and opens the note as a tab via `selectNote`.
 *
 * The window reuses the per-platform chrome from `titlebar.ts` (frameless +
 * vibrancy/acrylic) and `attachTRPC` so the note renderer reaches the same
 * main-process capabilities as the main window. Like the Settings window, it
 * opens its own `@notesnook/core` `Database` connection to the same encrypted
 * SQLite file (WAL + busy timeout + idempotent migrations make this safe).
 *
 * Electron-only; not contract-tested — the renderer calls it through the typed
 * `desktop.window.openNote` bridge. Tab tear-off detection itself is the
 * contract-tested pure helper in `contracts/tab-tear-off.ts`.
 */
import { BrowserWindow } from "electron";
import { resolve } from "node:path";
import { buildBrowserWindowOptionsForOS } from "./titlebar";
import { attachTRPC } from "./ipc";
import { sanitizeBounds, type WindowBounds } from "../contracts/session-state";
import { addNoteWindow, trackNoteWindow } from "./session-state";

/** One window per note. Focused (not duplicated) if a window for the note
 *  already exists. */
const noteWindows = new Map<string, BrowserWindow>();

/**
 * Open a window for `noteId`, focusing the existing one if alive. Call from any
 * app window via the `WindowServer.openNote` bridge procedure.
 *
 * Optional `bounds` restores a saved size/position (used when reopening note
 * windows from the last session). Optional `contextId` lets main track the
 * window's bounds under the opening account so it reopens next run; when
 * omitted the note window still works but isn't persisted to the session.
 *
 * @param preloadPath absolute path to the preload bundle (same as the main
 *   window — resolved from the main module's `__dirname`).
 * @param noteId the note to open in the new window.
 */
export function openNoteWindow(
  preloadPath: string,
  noteId: string,
  bounds?: WindowBounds | undefined,
  contextId?: string | undefined
): void {
  const existing = noteWindows.get(noteId);
  if (existing && !existing.isDestroyed()) {
    // eslint-disable-next-line no-console
    console.log(`[note-window] focusing existing window for ${noteId}`);
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    return;
  }

  const clean = sanitizeBounds(bounds);
  const base = buildBrowserWindowOptionsForOS(process.platform, preloadPath, clean);
  const win = new BrowserWindow({ ...base, title: "Note" });
  // Re-apply maximize after construction (saved size is the unmaximized restore
  // size; a maximized window should open maximized regardless).
  if (clean?.maximized) {
    win.once("ready-to-show", () => win.maximize());
  }

  // Same bridge as the main window so the note renderer can call desktop.*
  // procedures (sqlite, window, …) just like the main window.
  attachTRPC(win);

  noteWindows.set(noteId, win);
  win.on("closed", () => {
    noteWindows.delete(noteId);
  });

  // Track the note window in the session so it reopens next run (bounds + the
  // fact that it was open). Skipped when the caller didn't pass a contextId
  // (degraded mode — the window still works, just isn't persisted).
  if (contextId) {
    addNoteWindow(contextId, noteId, clean);
    trackNoteWindow(win, noteId, contextId);
  }

  win.once("ready-to-show", () => {
    win.show();
    win.moveTop();
    win.focus();
  });
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    // eslint-disable-next-line no-console
    console.error(`[note-window] did-fail-load ${code} ${desc} ${url}`);
  });

  // Mirror the main window's dev console forwarding so the note renderer's
  // console surfaces in the terminal during dev.
  if (process.env["ELECTRON_RENDERER_URL"]) {
    win.webContents.on("console-message", (_e, _level, message, line, source) => {
      const loc = source ? ` @${source}:${line ?? "?"}` : "";
      console.log(`[note] ${message}${loc}`);
    });
  }

  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devUrl) {
    void win.loadURL(`${devUrl}?window=note&noteId=${encodeURIComponent(noteId)}`);
  } else {
    void win.loadFile(resolve(__dirname, "../renderer/index.html"), {
      query: { window: "note", noteId }
    });
  }
}