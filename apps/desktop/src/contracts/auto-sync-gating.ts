/**
 * Pure gating for the `databaseSyncRequested` → `db.sync()` auto-pull path.
 *
 * `@notesnook/core` publishes `EVENTS.databaseSyncRequested` (`db:syncRequested`)
 * from three sites, distinguished by the event's first arg:
 *  - SSE `triggerSync`            → `(true, false)`  — server says another
 *    device synced, pull the changes. (`api/index.ts:434`)
 *  - `onPushCompleted`            → `(true, false, deviceId)` — a push round
 *    finished and the server has more pending. (`api/sync/index.ts:353`)
 *  - local-edit `AutoSync`        → `(false, false)` — a local DB write
 *    (debounced ~1 s). (`api/sync/auto-sync.ts:86`)
 *
 * We only want to react to the **server-initiated** ones (first arg `true`):
 * local edits are already pushed by the save-driven debounced
 * `scheduleAutoSync` in the sync-control store, and reacting to `AutoSync`'s
 * publishes here would double-sync on every keystroke. The cross-device goal —
 * "edits in another app instance appear here without a manual refresh" — is
 * exactly the SSE `triggerSync` path, so gating on the first arg is what
 * selects it.
 *
 * Extracted from the sync-control store (which can't be unit-tested without
 * the DB + auth/config stores) so the decision — server-initiated + logged-in
 * + sync-enabled + main window — is contract-testable. Mirrors the
 * `note-broadcast.ts`-in-contracts pattern.
 */
export interface AutoSyncGating {
  /** Authed into a server account (local-only mode has nothing to pull). */
  isLoggedIn: boolean;
  /** Sync enabled in config. */
  syncEnabled: boolean;
  /** The `window` URL query param: `"main"` / `"note"` / `"settings"` / `null`
   *  on the main window. Note + settings windows defer to the main window to
   *  avoid every window pulling the same changes. */
  windowType: string | null;
}

/**
 * Decide whether a `databaseSyncRequested` event with `args` should trigger a
 * pull sync given the app's current `gating`. Pure.
 */
export function shouldRunAutoSync(args: unknown[], gating: AutoSyncGating): boolean {
  // Server-initiated only: first arg truthy. Ignore local `AutoSync`
  // `(false, false)` publishes (handled by `scheduleAutoSync`).
  if (args[0] !== true) return false;
  if (!gating.isLoggedIn || !gating.syncEnabled) return false;
  if (gating.windowType === "note" || gating.windowType === "settings") return false;
  return true;
}