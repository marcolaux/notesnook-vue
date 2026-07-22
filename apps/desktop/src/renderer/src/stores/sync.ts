import { defineStore } from "pinia";
import { ref } from "vue";
import { EV, EVENTS } from "@notesnook-vue/contracts";
import { getDatabase } from "@/platform/bootstrap";
import { buildSyncOptions, type SyncControlInput } from "@/utils/sync";
import { shouldRunAutoSync } from "@contracts/auto-sync-gating";
import { useAuthStore } from "@/stores/auth";
import { useConfigStore } from "@/stores/config";

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

  // TEMP-DIAG: probe whether core's `fileUploaded` event (→ markAsUploaded →
  // dateUploaded, which the attachments `unsynced` filter requires to push the
  // record) actually fires on our db.eventManager. If this never logs while
  // `[fs] uploading` does, the event isn't being published or isn't reaching
  // subscribers — explaining dateUploaded:null + synced:false after sync.
  // Remove once cross-app image sync is verified on-site.
  let probed = false;
  function probeFileEvents(): void {
    if (probed) return;
    probed = true;
    try {
      const db = getDatabase();
      db.eventManager.subscribe("file:upload", (p: unknown) => {
        // eslint-disable-next-line no-console
        console.log("[sync] probe file:upload", p);
      });
      db.eventManager.subscribe(
        "file:uploaded",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (p: any) => {
          // eslint-disable-next-line no-console
          console.log("[sync] probe file:uploaded", p);
          if (!p?.success) return;
          // Observe ONLY — do NOT call markAsUploaded here. The bridge in
          // `event-bridge.ts` re-publishes `file:uploaded` to the global `EV`,
          // where the stale dist's `Attachments` subscriber lives; THAT
          // subscriber calls `markAsUploaded`. Re-read after a short delay to
          // confirm `dateUploaded` got set by core (via the bridge), proving
          // the proper fix works without this probe mutating anything.
          setTimeout(async () => {
            try {
              const a = await db.attachments.attachment(p.filename);
              // eslint-disable-next-line no-console
              console.log(
                "[sync] probe post-event (bridge-driven):",
                a ? { dateUploaded: a.dateUploaded, synced: (a as any).synced } : "NOT FOUND"
              );
            } catch {
              // ignore
            }
          }, 1000);
        }
      );
    } catch {
      // ignore
    }
  }

  /** Start a sync. `type` defaults to `"full"`. Returns `true` on success,
   * `false` on failure (error set). Never throws. */
  async function startSync(input: SyncControlInput = {}): Promise<boolean> {
    clearError();
    busy.value = true;
    try {
      const db = getDatabase();
      probeFileEvents();
      const ok = await db.sync(buildSyncOptions(input));
      // TEMP-DIAG sync-pull: does db.sync() return true and did it complete?
      // eslint-disable-next-line no-console
      console.log("[sync] db.sync returned:", ok, "input:", input);
      // TEMP-DIAG: dump local attachment records after sync so we can see
      // whether our just-uploaded attachment is marked synced + uploaded (i.e.
      // actually collected/pushed) and not localOnly/deleted. The web app
      // reports "No attachment found with hash" — if the record is synced=true
      // here, our side pushed it and the drop is downstream (server/web-app).
      // Remove once cross-app image sync is verified on-site.
      if (ok) {
        void (async () => {
          try {
            const items = await db.attachments.all.items();
            // eslint-disable-next-line no-console
            console.log(
              `[sync] diag: ${items.length} local attachment(s)`,
              items.map((a) => ({
                hash: a.hash,
                hashType: a.hashType,
                synced: (a as unknown as { synced?: boolean }).synced,
                dateUploaded: a.dateUploaded,
                localOnly: (a as unknown as { localOnly?: boolean }).localOnly,
                deleted: (a as unknown as { deleted?: boolean }).deleted,
                hasKey: !!a.key
              }))
            );
          } catch {
            // ignore diag failure
          }
        })();
      }
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
    // eslint-disable-next-line no-console
    console.log("[sync] scheduleAutoSync called; gated=", gated);
    if (!gated) return;
    if (autoSyncTimer) clearTimeout(autoSyncTimer);
    autoSyncTimer = setTimeout(() => {
      autoSyncTimer = undefined;
      const stillGated = autoSyncGated();
      // eslint-disable-next-line no-console
      console.log("[sync] autoSync timer fired; gated=", stillGated);
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