import { EV, EVENTS, type Database } from "@notesnook-vue/contracts";

/**
 * Events core publishes to the {@link Database}'s *instance-local*
 * `eventManager` (NOT the global `EV` singleton) that the renderer stores
 * listen for on the global `EV`. Each is re-published to `EV` by
 * {@link bindEventBridge} so the stores' subscriptions fire.
 *
 * `userUnauthorized` is intentionally NOT here: core's HTTP layer already
 * publishes it to the global `EV`, so subscribing for it on `db.eventManager`
 * would be dead code (it is never published there).
 */
const BRIDGED_EVENTS = [
  EVENTS.syncProgress,
  EVENTS.syncCompleted,
  EVENTS.syncAborted,
  // Per note/content item merged during a sync (core publishes the merged
  // item as payload from `api/sync/index.ts`). Bridging it lets the notes
  // store apply *incremental* in-place list updates on `syncCompleted`
  // (patch/insert/remove just the affected rows) instead of throwing away +
  // rebuilding the whole list — which flashed every row's tag chips and color
  // tint on every sync. Note: only fires for `note`/`content` item types, so
  // tags/notebooks still need a `collections.load()` on completion.
  EVENTS.syncItemMerged,
  // Server-pushed "another device synced, pull the changes" signal. Core
  // publishes this from the SSE `triggerSync` handler (`api/index.ts:434`),
  // from `onPushCompleted` (`api/sync/index.ts`), and from local-edit
  // `AutoSync` (`api/sync/auto-sync.ts`). Core never subscribes to it — the
  // host is expected to call `db.sync(...)` on it. Bridging it to the global
  // `EV` lets the sync-control store subscribe once (surviving `switchContext`,
  // since `bindEventBridge` re-binds per new `Database`) and trigger a pull so
  // edits made in another app instance appear here without a manual refresh.
  EVENTS.databaseSyncRequested,
  EVENTS.vaultLocked,
  EVENTS.vaultAutoLocked,
  EVENTS.vaultUnlocked,
  EVENTS.userSessionExpired,
  EVENTS.userLoggedOut,
  // Server-pushed monograph changes (publish/unpublish from another device).
  // Core publishes this from the sync `SendMonographs` hub handler
  // (`api/sync/index.ts:575`) with the affected note ids as payload, right
  // after `db.monographs.refresh()` repopulates the in-memory cache. Bridging
  // it lets the publish store reseed the active note's state + reload the notes
  // list (db.monographs.all filters notes) so cross-device changes appear live.
  EVENTS.monographsUpdated
] as const;

/**
 * Bridge the Database's instance-local event bus to the global `EV` singleton.
 *
 * Core's `Database` owns its own `EventManager` (`db.eventManager`,
 * `api/index.js:82`) and publishes sync / vault / user-session events there —
 * but the renderer stores (`status`, `vault`, `auth`) subscribe to the global
 * `EV`. Without this bridge those store handlers never fire, so
 * `syncCompletedSignal`, vault lock/unlock, and session-expiry auto-logout were
 * all dead (a pre-existing wiring gap, not caused by per-account). Re-publish
 * each bridged event from `db.eventManager` to `EV`.
 *
 * Must be re-bound on every `switchContext` (and on initial `bootstrap`): a new
 * `Database` has a new `eventManager`, so the previous bridge's subscriptions
 * die with the orphaned `Database` (GC-eligible together — no leak on the
 * global bus). The global `EV` store subscriptions are made once by each
 * store's `bind*Events` and persist across switches.
 */
export function bindEventBridge(db: Database): void {
  for (const name of BRIDGED_EVENTS) {
    db.eventManager.subscribe(name, (...args: unknown[]) => {
      EV.publish(name, ...args);
    });
  }
}