import { defineStore } from "pinia";
import { ref } from "vue";
import { EV, EVENTS } from "@notesnook-vue/contracts";
import { getDatabase } from "@/platform/bootstrap";
import { buildSyncOptions, type SyncControlInput } from "@/utils/sync";
import { shouldRunAutoSync } from "@contracts/auto-sync-gating";
import { useAuthStore } from "@/stores/auth";
import { useConfigStore } from "@/stores/config";
import { logger } from "@/utils/logger";

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
      logger.error("[sync] start failed:", e);
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
      logger.error("[sync] stop failed:", e);
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
      logger.error("[sync] cancel failed:", e);
      return false;
    }
  }

  // --- Auto-sync (debounced, gated) ---------------------------------------
  // Without this, a mid-session edit (e.g. dropping an image) saves locally but
  // never reaches the server until the next boot sync — the "image doesn't
  // upload until I refresh" symptom. `scheduleAutoSync()` is called after each
  // content save (App.vue watches `notes.saveState`); it debounces so a burst
  // of edits triggers one sync, and gates on the same conditions as the boot
  // sync (logged in, sync + auto-sync enabled, main window — note windows
  // defer to the main window to avoid double-sync). No-op + safe when not
  // logged in (local mode): `startSync` rejects into `lastError` and is
  // ignored. Lazy-resolves the auth/config stores so this control store stays
  // importable in isolation (no construction-time cross-store dep).
  let autoSyncTimer: ReturnType<typeof setTimeout> | undefined;
  const AUTO_SYNC_DEBOUNCE_MS = 3000;

  function autoSyncGated(): boolean {
    try {
      const windowType =
        typeof URLSearchParams !== "undefined"
          ? new URLSearchParams(location.search).get("window")
          : null;
      if (windowType === "note" || windowType === "settings") return false;
      const auth = useAuthStore();
      const config = useConfigStore();
      return !!(auth.isLoggedIn && config.syncEnabled && config.autoSyncEnabled);
    } catch {
      return false;
    }
  }

  /** Read the `?window=` query param (`null` on the main window). Shared by the
   *  save-driven {@link autoSyncGated} and the SSE-driven auto-pull below. */
  function currentWindowType(): string | null {
    try {
      return typeof URLSearchParams !== "undefined"
        ? new URLSearchParams(location.search).get("window")
        : null;
    } catch {
      return null;
    }
  }

  // --- Auto-pull on server-pushed sync requests (SSE triggerSync) -----------
  // Core publishes `EVENTS.databaseSyncRequested` when the server's SSE channel
  // delivers a `triggerSync` (another device synced → pull the changes) and on
  // `onPushCompleted` (more pending). It also publishes it on every local edit
  // via `AutoSync` — we ignore those (the save-driven `scheduleAutoSync` already
  // pushes local edits; reacting here would double-sync per keystroke). The
  // bridge in `event-bridge.ts` re-publishes the db-instance event to the global
  // `EV`, so we subscribe once here (process-lifetime, idempotent — mirrors
  // `status.bindSyncEvents` / `vault.bindVaultEvents`). This is what makes an
  // edit in another app instance appear here without a manual refresh.
  let autoSyncBound = false;
  function bindAutoSyncEvents(): void {
    if (autoSyncBound) return;
    autoSyncBound = true;
    EV.subscribe(EVENTS.databaseSyncRequested, (...args: unknown[]) => {
      // Skip while a sync is already in flight — the running pull will fetch
      // the new server state, so a concurrent trigger is redundant (and avoids
      // a second concurrent `db.sync()` call).
      if (busy.value) return;
      let gated = false;
      try {
        gated = shouldRunAutoSync(args, {
          isLoggedIn: useAuthStore().isLoggedIn,
          syncEnabled: useConfigStore().syncEnabled,
          windowType: currentWindowType()
        });
      } catch {
        gated = false;
      }
      if (!gated) return;
      void startSync({ type: "full" });
    });
  }

  /** Schedule a debounced sync. Call after any save that should reach the
   *  server (note content, attachment ingest). Re-schedules on each call so a
   *  burst of edits collapses to one sync. Never throws. */
  function scheduleAutoSync(): void {
    const gated = autoSyncGated();
    if (!gated) return;
    if (autoSyncTimer) clearTimeout(autoSyncTimer);
    autoSyncTimer = setTimeout(() => {
      autoSyncTimer = undefined;
      const stillGated = autoSyncGated();
      if (!stillGated) return;
      void startSync();
    }, AUTO_SYNC_DEBOUNCE_MS);
  }

  return {
    busy,
    lastError,
    lastResult,
    startSync,
    stopSync,
    cancelSync,
    scheduleAutoSync,
    bindAutoSyncEvents
  };
});