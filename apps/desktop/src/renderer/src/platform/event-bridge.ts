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
  EVENTS.vaultLocked,
  EVENTS.vaultAutoLocked,
  EVENTS.vaultUnlocked,
  EVENTS.userSessionExpired,
  EVENTS.userLoggedOut
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