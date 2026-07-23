/**
 * Main-process app-state owner — origin-independent persistence for small
 * renderer flags that MUST survive a renderer `localStorage` reset, stored in
 * `userData/app-state.json`.
 *
 * Why this exists (not just localStorage): the local-mode "Continue without
 * account" choice (`skippedLogin`) is the SOLE login gate in local mode
 * (`showShell = isLoggedIn || skippedLogin`, and `isLoggedIn` is always false
 * there). It was persisted only to renderer `localStorage`, which is (a)
 * scoped to the renderer origin — a dev-server port drift changed the origin
 * and the flag read as missing; and (b) the shared `file://`-origin leveldb
 * the main/settings/note windows all write can lose recent writes on a hard
 * quit / crash. Either way the flag vanished and the next restart re-showed
 * the login screen. Main-owned `userData` is neither origin-scoped nor
 * subject to renderer storage corruption, and is written atomically
 * (temp + rename), so the choice is durable.
 *
 * Mirrors the convention of `session-state.ts` (`session.json`),
 * `safe-storage.ts` (`secrets.json`), and `spell-checker.ts`
 * (`spellchecker.json`): local-only, NEVER synced, MUST NOT go through
 * `db.settings` (which syncs). Read is lazy + cached; `set` is read-modify-
 * write + atomic persist.
 *
 * Extensible: `AppState` (in `../contracts/router`) holds the flag set. Add
 * fields there + mirror them through the `appState` tRPC router. (`skippedLogin`
 * is the only field today; `currentContext` is a future candidate — it needs
 * the bootstrap read to go async, so it's deferred.)
 */
import { app } from "electron";
import path from "node:path";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { registerAppStateServer, type AppState, type AppStateServer } from "../contracts/router";

/** Cached file contents; `undefined` until first read. */
let cache: AppState | undefined;

function filePath(): string {
  return path.join(app.getPath("userData"), "app-state.json");
}

function load(): AppState {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(readFileSync(filePath(), "utf-8")) as unknown;
    if (parsed && typeof parsed === "object") {
      cache = { skippedLogin: skipBool((parsed as AppState).skippedLogin) };
      return cache;
    }
  } catch {
    /* missing / corrupt → start empty */
  }
  cache = {};
  return cache;
}

/** Coerce a persisted `skippedLogin` to `boolean | undefined`; ignore junk. */
function skipBool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

/** Atomic write (temp + rename on the same filesystem). */
function persist(): void {
  const target = filePath();
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, JSON.stringify(cache ?? {}));
  renameSync(tmp, target);
}

export const appStateServer: AppStateServer = {
  async get(): Promise<AppState> {
    return load();
  },

  async set(patch: Partial<AppState>): Promise<AppState> {
    load();
    cache = { ...cache, ...patch };
    persist();
    return cache;
  }
};

/** Register the app-state server with the tRPC bridge. Called from
 *  `main/index.ts` inside `app.whenReady()`. */
export function registerAppState(): void {
  registerAppStateServer(appStateServer);
}