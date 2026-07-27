/**
 * Main-process account-registry owner — the list of known (logged-in) accounts
 * and their per-account server config, persisted to `userData/accounts.json`.
 *
 * Multi-account support: the app keeps one encrypted SQLite "context" per
 * account (`"local"` or `hashEmail(email)`), and the user can now have several
 * logged-in accounts open simultaneously — one per window. This registry is the
 * list the switcher renders: each entry pairs a `contextId` (the DB file's
 * identity) with its email (display label — `hashEmail` is one-way) and its
 * `serverConfig` (so an upstream-notesnook account and a self-hosted account can
 * coexist; each window resolves its own hosts at boot).
 *
 * `"local"` is implicit — it is always available, never listed, and never
 * removable — so it does not appear in this registry.
 *
 * Mirrors the convention of `app-state.ts` (`app-state.json`),
 * `session-state.ts` (`session.json`), `safe-storage.ts` (`secrets.json`):
 * local-only, NEVER synced, MUST NOT go through `db.settings` (which syncs).
 * Read is lazy + cached; writes are read-modify-write + atomic (temp + rename).
 *
 * NOTE: `remove` only drops the registry entry. Deleting the account's DB file
 * + keychain keys is the renderer's `removeAccount` path (it coordinates
 * `sqlite.delete` + `clearContextKeys` before calling here) — main does not
 * know the per-context file/keychain names without the renderer-side helpers.
 */
import { app } from "electron";
import path from "node:path";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { registerAccountRegistryServer, type AccountRegistryServer } from "../contracts/router";
import type { AccountEntry } from "../contracts/server-config";

/** Cached file contents; `undefined` until first read. */
let cache: AccountEntry[] | undefined;

function filePath(): string {
  return path.join(app.getPath("userData"), "accounts.json");
}

/** Coerce a parsed entry to a valid {@link AccountEntry}; drop junk. */
function cleanEntry(v: unknown): AccountEntry | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const e = v as Record<string, unknown>;
  if (typeof e.contextId !== "string" || typeof e.email !== "string") return undefined;
  const sc = e.serverConfig;
  if (typeof sc !== "object" || sc === null) return undefined;
  const profile = (sc as { profile?: unknown }).profile;
  if (profile !== "notesnook" && profile !== "custom") return undefined;
  if (profile === "custom") {
    const hosts = (sc as { hosts?: unknown }).hosts;
    if (typeof hosts !== "object" || hosts === null) return undefined;
  }
  return {
    contextId: e.contextId,
    email: e.email,
    serverConfig: sc as AccountEntry["serverConfig"],
    ...(typeof e.label === "string" ? { label: e.label } : {}),
    lastUsed: typeof e.lastUsed === "number" ? e.lastUsed : 0
  };
}

function load(): AccountEntry[] {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(readFileSync(filePath(), "utf-8")) as unknown;
    if (parsed && typeof parsed === "object") {
      const accounts = (parsed as { accounts?: unknown }).accounts;
      if (Array.isArray(accounts)) {
        cache = accounts
          .map(cleanEntry)
          .filter((e): e is AccountEntry => e !== undefined)
          // Newest-first by `lastUsed` (the switcher's display order).
          .sort((a, b) => b.lastUsed - a.lastUsed);
        return cache;
      }
    }
  } catch {
    /* missing / corrupt → start empty */
  }
  cache = [];
  return cache;
}

/** Atomic write (temp + rename on the same filesystem). */
function persist(): void {
  const target = filePath();
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, JSON.stringify({ accounts: cache ?? [] }));
  renameSync(tmp, target);
}

/** Upsert by `contextId`. Returns the merged, newest-first list. */
function upsert(entry: AccountEntry): AccountEntry[] {
  load();
  const without = (cache ?? []).filter((e) => e.contextId !== entry.contextId);
  without.push(entry);
  cache = without.sort((a, b) => b.lastUsed - a.lastUsed);
  persist();
  return cache;
}

/** Remove by `contextId`. Returns the merged list. */
function remove(contextId: string): AccountEntry[] {
  load();
  cache = (cache ?? []).filter((e) => e.contextId !== contextId);
  persist();
  return cache;
}

export const accountRegistryServer: AccountRegistryServer = {
  async list(): Promise<AccountEntry[]> {
    return load();
  },
  async get(contextId: string): Promise<AccountEntry | undefined> {
    return load().find((e) => e.contextId === contextId);
  },
  async upsert(entry: AccountEntry): Promise<AccountEntry[]> {
    return upsert(entry);
  },
  async remove(contextId: string): Promise<AccountEntry[]> {
    return remove(contextId);
  }
};

/** Register the account-registry server with the tRPC bridge. Called from
 *  `main/index.ts` inside `app.whenReady()`. */
export function registerAccountRegistry(): void {
  registerAccountRegistryServer(accountRegistryServer);
}

/** Synchronous read of the known account context ids (the cached `load()`
 *  result). Used by main-side multi-window restore to filter the saved
 *  `openMainWindows` list so a removed account's window isn't reopened against
 *  a deleted DB. `"local"` is NOT included here (it is implicit — the caller
 *  unions it in). Never throws — a missing/corrupt file yields `[]`. */
export function listAccountContextIdsSync(): string[] {
  return load().map((e) => e.contextId);
}