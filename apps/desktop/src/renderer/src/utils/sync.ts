import type { SyncOptions } from "@notesnook-vue/contracts";

/**
 * Sync helpers (Phase 6.1 — control slice) — pure utilities for the sync
 * store. No database import, no side effects → unit-testable in isolation,
 * mirroring `utils/vault.ts` / `utils/backup.ts`.
 *
 * `@notesnook/core`'s `SyncOptions` has a **required** `type` (`"full"` |
 * `"fetch"` | `"send"`) and optional `force` / `offlineMode`. Because the
 * renderer's tsconfig enables `exactOptionalPropertyTypes`, an explicit
 * `undefined` for an optional prop is rejected (`TS2379`) — so
 * {@link buildSyncOptions} defaults `type` to `"full"` and only sets
 * `force` / `offlineMode` when they are actually defined.
 */

export type SyncType = SyncOptions["type"];

/** User-facing label per sync type (English; i18n = Phase 7.1). */
export const SYNC_TYPE_LABELS: Record<SyncType, string> = {
  full: "Full sync",
  fetch: "Fetch from server",
  send: "Send to server"
};

export interface SyncControlInput {
  type?: SyncType;
  force?: boolean;
  offlineMode?: boolean;
}

/** Build a `SyncOptions` object for `db.sync(...)`: default `type:"full"`,
 * and only include `force` / `offlineMode` when defined (so the result
 * satisfies `exactOptionalPropertyTypes`). Pure. */
export function buildSyncOptions(input: SyncControlInput = {}): SyncOptions {
  const opts: SyncOptions = { type: input.type ?? "full" };
  if (input.force !== undefined) opts.force = input.force;
  if (input.offlineMode !== undefined) opts.offlineMode = input.offlineMode;
  return opts;
}