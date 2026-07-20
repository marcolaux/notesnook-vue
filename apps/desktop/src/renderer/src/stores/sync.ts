import { defineStore } from "pinia";
import { ref } from "vue";
import { getDatabase } from "@/platform/bootstrap";
import { buildSyncOptions, type SyncControlInput } from "@/utils/sync";

/**
 * Sync-control store (Phase 6.1 — headless control slice) — the reactive
 * surface for *triggering* `@notesnook/core`'s sync: start / stop / cancel.
 * Complements {@link useStatusStore}, which *displays* sync state by
 * subscribing to `EVENTS.syncProgress` / `syncCompleted` / `syncAborted`.
 *
 * The two stores are deliberately separate:
 *  - **status store** — event-driven *display* state (`syncState`), updated
 *    by core's sync events (including auto-sync, which fires events without
 *    a `startSync` call from this store).
 *  - **this store** — *control* state (`busy` = a `startSync` call is in
 *    flight; `lastResult` / `lastError` from the most recent call). It does
 *    not subscribe to events and does not import the status store, so it stays
 *    testable in isolation.
 *
 * Design (mirrors `stores/vault.ts` / `stores/backup.ts`):
 *  - **Never throws.** Every action catches, sets `lastError`, logs, and
 *    returns `boolean` success (state left intact on failure).
 *  - **Auth-gated in practice.** `db.sync()` needs a server + token; without
 *    login it rejects and surfaces as `lastError`. The store works regardless
 *    — actual sync is verified on-site after login.
 *
 * API (`vendor-dist/@notesnook/core/dist/types/api/index.d.ts` +
 * `api/sync/index.d.ts`):
 *  - `db.sync(options): Promise<boolean>` — start (delegates to
 *    `db.syncer.start`); the documented public entry point.
 *  - `db.syncer.stop(): Promise<void>` — stop (no args).
 *  - `db.syncer.sync.cancel(): Promise<void>` — cancel the in-flight sync.
 */

export const useSyncStore = defineStore("syncControl", () => {
  /** A `startSync` call is in flight (button-level; distinct from the status
   * store's event-driven `syncState`). */
  const busy = ref(false);
  const lastError = ref<string | null>(null);
  /** Result of the most recent `startSync` (`true` = synced, `false` = failed,
   * `null` = never run). */
  const lastResult = ref<boolean | null>(null);

  function clearError(): void {
    lastError.value = null;
  }

  /** Start a sync. `type` defaults to `"full"`. Returns `true` on success,
   * `false` on failure (error set). Never throws. */
  async function startSync(input: SyncControlInput = {}): Promise<boolean> {
    clearError();
    busy.value = true;
    try {
      const db = getDatabase();
      const ok = await db.sync(buildSyncOptions(input));
      lastResult.value = ok;
      return ok;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      lastResult.value = false;
      // eslint-disable-next-line no-console
      console.error("[sync] start failed:", e);
      return false;
    } finally {
      busy.value = false;
    }
  }

  /** Stop the running sync (`db.syncer.stop()`). Returns `true` on success. */
  async function stopSync(): Promise<boolean> {
    clearError();
    try {
      const db = getDatabase();
      await db.syncer.stop();
      return true;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[sync] stop failed:", e);
      return false;
    }
  }

  /** Cancel the in-flight sync (`db.syncer.sync.cancel()`). Returns `true` on
   * success. */
  async function cancelSync(): Promise<boolean> {
    clearError();
    try {
      const db = getDatabase();
      await db.syncer.sync.cancel();
      return true;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[sync] cancel failed:", e);
      return false;
    }
  }

  return { busy, lastError, lastResult, startSync, stopSync, cancelSync };
});