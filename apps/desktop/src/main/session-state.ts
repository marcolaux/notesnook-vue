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
import { app, type BrowserWindow } from "electron";
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
  sanitizeBounds
} from "../contracts/session-state";

const SESSION_VERSION = 1 as const;

/** In-memory cache — authoritative between debounced writes; flushed on quit. */
let cache: SessionFile = { version: SESSION_VERSION, contexts: {} };
let loaded = false;

/** senderId (webContents id) → contextId. The main window is bound by the
 *  renderer's `bindContext` call so geometry writes land under the right
 *  account (avoids the stale-`lastContext` race on first boot). */
const contextBySenderId = new Map<number, string>();

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
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  writeNow();
}

function getContext(contextId: string): ContextSession {
  ensureLoaded();
  return cache.contexts[contextId] ?? emptyContextSession();
}

function mutate(contextId: string, fn: (session: ContextSession) => ContextSession): void {
  ensureLoaded();
  const current = cache.contexts[contextId] ?? emptyContextSession();
  cache.contexts[contextId] = fn(current);
  cache.lastContext = contextId;
  scheduleWrite();
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

  bindContext(senderId: number | undefined, contextId: string): void {
    if (senderId === undefined) return;
    contextBySenderId.set(senderId, contextId);
    ensureLoaded();
    cache.lastContext = contextId;
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