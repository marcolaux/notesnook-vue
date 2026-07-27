/**
 * Main-process session-state owner — persists the editor session (open tabs +
 * split layout, torn-off note windows, window bounds) to a local
 * `userData/session.json`, keyed per account (`ContextId`).
 *
 * Local-only: this file NEVER syncs and MUST NOT go through `db.settings`
 * (which syncs). It is the device-local record of "what was open last run",
 * matching the convention of `safe-storage.ts` (`secrets.json`) and
 * `spell-checker.ts` (`spellchecker.json`).
 *
 * Main owns the file so it can (a) read the main window's bounds before any
 * renderer reports its context (no first-boot size flash), and (b) track
 * torn-off note windows the renderer can't see. The renderer drives layout
 * save/restore through the `SessionServer` tRPC surface; main attaches the
 * window-geometry listeners itself.
 *
 * Writes are coalesced through a short debounce (dragging a window fires
 * resize/move at high frequency); `flushSession()` writes immediately and is
 * called from the `before-quit` handler so the last state lands on disk.
 */
import { app, BrowserWindow, webContents } from "electron";
import path from "node:path";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { registerSessionServer, type SessionServer } from "../contracts/router";
import {
  type ContextSession,
  type LayoutSnapshot,
  type NoteWindowRecord,
  type SessionFile,
  type WindowBounds,
  emptyContextSession,
  normalizeContextSession,
  orderOpenMainWindows,
  sanitizeBounds
} from "../contracts/session-state";
import { listAccountContextIdsSync } from "./account-registry";

/** The implicit local context id (`hashEmail` is one-way so this is a literal,
 *  not a hash). Mirrors `LOCAL_CONTEXT` in the renderer's `account-context.ts`;
 *  duplicated here so main doesn't pull a renderer-only module. */
const LOCAL_CONTEXT = "local";

const SESSION_VERSION = 1 as const;

/** In-memory cache — authoritative between debounced writes; flushed on quit. */
let cache: SessionFile = { version: SESSION_VERSION, contexts: {} };
let loaded = false;

/** Set by `flushSession` (the `before-quit` handler) so the per-window `closed`
 *  listeners installed by `bindContext` know NOT to drop the window from the
 *  restore list — a quit-driven close should preserve the list so the window
 *  reopens next launch (a user-initiated single-window close, by contrast,
 *  removes it so it stays closed). Stays `false` for the session lifetime until
 *  quit, since the app process is single-shot. */
let quitting = false;

/** senderId (webContents id) → contextId. The main window is bound by the
 *  renderer's `bindContext` call so geometry writes land under the right
 *  account (avoids the stale-`lastContext` race on first boot). */
const contextBySenderId = new Map<number, string>();

/** Shell windows that already have a `closed` listener removing them from the
 *  restore list — guards `bindContext` against double-binding on re-binds. */
const closeBoundWindows = new WeakSet<BrowserWindow>();

/** Last known UN-maximized bounds per window, so maximizing doesn't overwrite
 *  the restore size with the full-screen rect. */
const normalBoundsByWin = new WeakMap<BrowserWindow, WindowBounds>();

function sessionFilePath(): string {
  return path.join(app.getPath("userData"), "session.json");
}

function readFromDisk(): SessionFile {
  try {
    const raw = readFileSync(sessionFilePath(), "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed as SessionFile).version === SESSION_VERSION &&
      (parsed as SessionFile).contexts
    ) {
      return parsed as SessionFile;
    }
  } catch {
    /* missing / corrupt → start fresh */
  }
  return { version: SESSION_VERSION, contexts: {} };
}

function ensureLoaded(): void {
  if (!loaded) {
    cache = readFromDisk();
    loaded = true;
  }
}

function writeNow(): void {
  ensureLoaded();
  const target = sessionFilePath();
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, JSON.stringify(cache));
  renameSync(tmp, target); // atomic on the same filesystem
}

let writeTimer: NodeJS.Timeout | null = null;
function scheduleWrite(): void {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    writeNow();
  }, 150);
}

/** Write the latest cache to disk immediately (called from `before-quit`). */
export function flushSession(): void {
  // Mark quitting so the per-window `closed` listeners (installed by
  // `bindContext`) skip removing their window from the restore list — the list
  // must reflect what was open at quit so multi-window restore reopens it.
  quitting = true;
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  writeNow();
}

function getContext(contextId: string): ContextSession {
  ensureLoaded();
  return normalizeContextSession(cache.contexts[contextId] ?? emptyContextSession());
}

function mutate(contextId: string, fn: (session: ContextSession) => ContextSession): void {
  ensureLoaded();
  const current = normalizeContextSession(cache.contexts[contextId] ?? emptyContextSession());
  cache.contexts[contextId] = fn(current);
  cache.lastContext = contextId;
  scheduleWrite();
}

/**
 * Mark a context's main shell window as open (`add`) or closed (`remove`) in
 * the persisted `openMainWindows` list — the ordered set main reopens one
 * window per entry on next launch (per-window multi-account restore). Append
 * on first open (insertion order preserved across rebinds); remove on close.
 */
function setMainWindowOpen(contextId: string, open: boolean): void {
  ensureLoaded();
  const list = cache.openMainWindows ?? [];
  if (open) {
    if (!list.includes(contextId)) {
      cache.openMainWindows = [...list, contextId];
      scheduleWrite();
    }
  } else {
    if (list.includes(contextId)) {
      cache.openMainWindows = list.filter((c) => c !== contextId);
      scheduleWrite();
    }
  }
}

// --- SessionServer (tRPC-facing) ------------------------------------------

export const sessionServer: SessionServer = {
  async loadLayout(contextId: string): Promise<ContextSession> {
    return getContext(contextId);
  },

  async saveLayout(contextId: string, snapshot: LayoutSnapshot): Promise<void> {
    mutate(contextId, (s) => ({ ...s, mainWindowOpenTabs: snapshot }));
  },

  async saveWindowBounds(contextId: string, bounds: WindowBounds): Promise<void> {
    const clean = sanitizeBounds(bounds);
    if (!clean) return;
    mutate(contextId, (s) => ({ ...s, mainBounds: clean }));
  },

  async saveNoteWindowBounds(contextId: string, noteId: string, bounds: WindowBounds): Promise<void> {
    const clean = sanitizeBounds(bounds);
    if (!clean) return;
    mutate(contextId, (s) => {
      const noteWindows = s.noteWindows.filter((w) => w.noteId !== noteId);
      noteWindows.push({ noteId, bounds: clean });
      return { ...s, noteWindows };
    });
  },

  async savePaneWindowLayout(
    contextId: string,
    paneId: string,
    snapshot: LayoutSnapshot
  ): Promise<void> {
    mutate(contextId, (s) => {
      const paneWindows = s.paneWindows.filter((w) => w.paneId !== paneId);
      // Keep the existing bounds; only the layout changes here.
      const existing = s.paneWindows.find((w) => w.paneId === paneId);
      paneWindows.push({
        paneId,
        bounds: existing?.bounds ?? { x: 0, y: 0, width: 1280, height: 800, maximized: false },
        layout: snapshot
      });
      return { ...s, paneWindows };
    });
  },

  async savePaneWindowBounds(contextId: string, paneId: string, bounds: WindowBounds): Promise<void> {
    const clean = sanitizeBounds(bounds);
    if (!clean) return;
    mutate(contextId, (s) => {
      const paneWindows = s.paneWindows.filter((w) => w.paneId !== paneId);
      const existing = s.paneWindows.find((w) => w.paneId === paneId);
      paneWindows.push({
        paneId,
        bounds: clean,
        // Preserve the last-saved layout; only bounds change here.
        layout: existing?.layout ?? { layout: null, groups: {}, tabs: {}, sessions: {}, activeGroupId: "" }
      });
      return { ...s, paneWindows };
    });
  },

  bindContext(senderId: number | undefined, contextId: string): void {
    if (senderId === undefined) return;
    contextBySenderId.set(senderId, contextId);
    ensureLoaded();
    cache.lastContext = contextId;
    // Record this shell window as open so multi-window restore reopens it next
    // launch. `bindContext` fires only for full-shell windows (main + account —
    // see App.vue's `!isSettingsWindow && !isTornOffWindow` gate), so note/pane/
    // settings windows never land here.
    setMainWindowOpen(contextId, true);
    // Drop the window from the restore list when the USER closes it (so a
    // deliberately-closed window stays closed next run). A quit-driven close is
    // skipped via `quitting` so the list survives to the next launch. Installed
    // ONCE per window (re-binds from an in-window context switch — e.g. a
    // sign-in window completing into account B — update `contextBySenderId`
    // but must not stack a second listener); the listener reads the window's
    // CURRENT context at close time so it removes the right entry.
    const wc = webContents.fromId(senderId);
    const win = wc ? BrowserWindow.fromWebContents(wc) : undefined;
    if (win && !win.isDestroyed() && !closeBoundWindows.has(win)) {
      closeBoundWindows.add(win);
      win.once("closed", () => {
        closeBoundWindows.delete(win);
        if (quitting) return;
        const ctx = contextBySenderId.get(senderId);
        if (ctx) setMainWindowOpen(ctx, false);
        contextBySenderId.delete(senderId);
      });
    }
    scheduleWrite();
  }
};

/** Resolve the context a window (by webContents `senderId`) is bound to. Used
 *  by the tab-tear-off path so a user-torn-off note window is tracked under the
 *  source window's account (it owns the same DB) and reopens next run. Returns
 *  `undefined` when the source window hasn't been bound yet (degraded: the note
 *  window opens but isn't persisted). */
export function resolveContextForSender(senderId: number | undefined): string | undefined {
  if (senderId === undefined) return undefined;
  return contextBySenderId.get(senderId);
}

export function registerSession(): void {
  registerSessionServer(sessionServer);
}

// --- Internal helpers (main-only; not tRPC) -------------------------------

/** Best-effort main-window bounds for the FIRST window, read before any
 *  renderer reports its context. Returns `undefined` → use BASE_WINDOW. */
export function getMainBoundsForLastContext(): WindowBounds | undefined {
  ensureLoaded();
  const ctx = cache.lastContext;
  if (!ctx) return undefined;
  return sanitizeBounds(cache.contexts[ctx]?.mainBounds);
}

/**
 * The contexts whose main shell window to reopen at startup (per-window
 * multi-account restore). One full-shell window is created per entry, pinned to
 * its `ctx` via `?ctx=<contextId>`; the first entry (the last-used context)
 * receives the primary wiring (tray, updater, deep-link, cross-window
 * data-changed forwarding). Removed accounts are filtered out so a deleted DB
 * is never reopened. Returns `[]` when nothing is restorable — the caller then
 * creates a single default main window.
 */
export function getOpenMainWindowsForRestore(): {
  contextId: string;
  bounds: WindowBounds | undefined;
}[] {
  ensureLoaded();
  // `"local"` is always valid; account contexts are valid while their registry
  // entry exists (a removed account's window is dropped here, before its DB
  // is touched — the registry `remove` deletes the DB + keychain + entry
  // together).
  const valid = new Set<string>([LOCAL_CONTEXT, ...listAccountContextIdsSync()]);
  const ordered = orderOpenMainWindows(cache, valid);
  return ordered.map((ctx) => ({
    contextId: ctx,
    bounds: sanitizeBounds(cache.contexts[ctx]?.mainBounds)
  }));
}

/** Resolve the context a window belongs to (for geometry writes). The main
 *  window is bound via `bindContext`; until then returns `undefined` so the
 *  caller skips the write (boot still settling). */
function resolveContextForWindow(win: BrowserWindow): string | undefined {
  const ctx = contextBySenderId.get(win.webContents.id);
  return ctx;
}

function rawBounds(win: BrowserWindow): WindowBounds {
  const b = win.getBounds();
  return {
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    maximized: win.isMaximized(),
    fullscreen: win.isFullScreen()
  };
}

/** Build the bounds to persist for a window, preserving the last unmaximized
 *  size when the window is currently maximized (so unmaximize restores). */
function boundsToSave(win: BrowserWindow): WindowBounds | undefined {
  if (win.isMaximized()) {
    const prev = normalBoundsByWin.get(win);
    const base = prev ?? rawBounds(win);
    return { ...base, maximized: true, fullscreen: win.isFullScreen() };
  }
  const b = rawBounds(win);
  normalBoundsByWin.set(win, b);
  return b;
}

function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let t: NodeJS.Timeout | null = null;
  return ((...args: never[]) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      fn(...args);
    }, ms);
  }) as T;
}

/** Attach resize/move/maximize/unmaximize listeners that persist the main
 *  window's bounds under its bound context. No-op writes until `bindContext`
 *  fires (boot still settling). */
export function trackMainWindow(win: BrowserWindow): void {
  const save = debounce(() => {
    const ctx = resolveContextForWindow(win);
    if (!ctx) return; // not bound yet
    if (win.isDestroyed()) return;
    const bounds = boundsToSave(win);
    if (!bounds) return;
    const clean = sanitizeBounds(bounds);
    if (!clean) return;
    mutate(ctx, (s) => ({ ...s, mainBounds: clean }));
  }, 250);
  win.on("resize", save);
  win.on("move", save);
  win.on("maximize", save);
  win.on("unmaximize", save);
}

/** Track a torn-off note window: persist its bounds under `contextId` while
 *  open, and remove it from the session's `noteWindows` list on close. */
export function trackNoteWindow(win: BrowserWindow, noteId: string, contextId: string): void {
  const save = debounce(() => {
    if (win.isDestroyed()) return;
    const bounds = boundsToSave(win);
    if (!bounds) return;
    void sessionServer.saveNoteWindowBounds(contextId, noteId, bounds);
  }, 250);
  win.on("resize", save);
  win.on("move", save);
  win.on("maximize", save);
  win.on("unmaximize", save);
  win.on("closed", () => {
    ensureLoaded();
    const session = cache.contexts[contextId];
    if (session) {
      cache.contexts[contextId] = {
        ...session,
        noteWindows: session.noteWindows.filter((w) => w.noteId !== noteId)
      };
      scheduleWrite();
    }
  });
}

/** Add a note window to the session's `noteWindows` list when it opens (so a
 *  crash/quit between open and the first geometry event still records it). */
export function addNoteWindow(contextId: string, noteId: string, bounds?: WindowBounds | undefined): void {
  mutate(contextId, (s) => {
    const noteWindows = s.noteWindows.filter((w) => w.noteId !== noteId);
    noteWindows.push({ noteId, bounds: bounds ?? { x: 0, y: 0, width: 1280, height: 800, maximized: false } });
    return { ...s, noteWindows };
  });
}

/** Track a torn-off pane window: persist its bounds under `contextId` while
 *  open (the pane renderer saves its layout separately via `savePaneWindowLayout`),
 *  and remove it from the session's `paneWindows` list on close. */
export function trackPaneWindow(win: BrowserWindow, paneId: string, contextId: string): void {
  const save = debounce(() => {
    if (win.isDestroyed()) return;
    const bounds = boundsToSave(win);
    if (!bounds) return;
    void sessionServer.savePaneWindowBounds(contextId, paneId, bounds);
  }, 250);
  win.on("resize", save);
  win.on("move", save);
  win.on("maximize", save);
  win.on("unmaximize", save);
  win.on("closed", () => {
    ensureLoaded();
    const session = cache.contexts[contextId];
    if (session) {
      cache.contexts[contextId] = {
        ...session,
        paneWindows: (session.paneWindows ?? []).filter((w) => w.paneId !== paneId)
      };
      scheduleWrite();
    }
  });
}

/** Add a pane window to the session's `paneWindows` list when it opens (so a
 *  crash/quit between open and the first geometry event still records it — with
 *  the layout snapshot the pane renderer will later overwrite via
 *  `savePaneWindowLayout`). */
export function addPaneWindow(
  contextId: string,
  paneId: string,
  snapshot: LayoutSnapshot,
  bounds?: WindowBounds | undefined
): void {
  mutate(contextId, (s) => {
    const paneWindows = s.paneWindows.filter((w) => w.paneId !== paneId);
    paneWindows.push({
      paneId,
      bounds: bounds ?? { x: 0, y: 0, width: 1280, height: 800, maximized: false },
      layout: snapshot
    });
    return { ...s, paneWindows };
  });
}