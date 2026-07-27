/**
 * Renderer handle to the main-process account registry (`userData/accounts.json`)
 * — the list of known (logged-in) accounts + their per-account server config.
 * See `src/main/account-registry.ts` for why this exists (multi-account: one
 * encrypted SQLite context per account, several open simultaneously, one per
 * window).
 *
 * Thin + fault-tolerant like `app-state.ts`: list/get swallow IPC failures
 * (return `[]` / `undefined`) so a bridge hiccup never breaks the boot path
 * that resolves a window's server hosts (`resolveHostsForContext`). `upsert`/
 * `remove` rethrow on failure (callers — login, account removal — need to know
 * the write failed).
 */
import { desktop } from "./desktop-bridge";
import type { AccountEntry } from "@contracts/server-config";

/** All known accounts, newest-first by `lastUsed`. `local` is never listed.
 *  Returns `[]` on any failure (never throws). */
export async function listAccounts(): Promise<AccountEntry[]> {
  try {
    return await desktop.accountRegistry.list.query();
  } catch {
    return [];
  }
}

/** The entry for `contextId`, or `undefined` when unknown / on failure. */
export async function getAccount(contextId: string): Promise<AccountEntry | undefined> {
  try {
    return await desktop.accountRegistry.get.query({ contextId });
  } catch {
    return undefined;
  }
}

/** Insert or replace the entry for `entry.contextId` (upsert by contextId). */
export async function upsertAccount(entry: AccountEntry): Promise<void> {
  await desktop.accountRegistry.upsert.mutate(entry);
}

/** Remove the registry entry for `contextId` (does NOT delete the account's
 *  DB/keychain — that is the caller's `removeAccount` path). */
export async function removeAccountEntry(contextId: string): Promise<void> {
  await desktop.accountRegistry.remove.mutate({ contextId });
}