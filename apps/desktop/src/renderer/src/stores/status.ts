import { defineStore } from "pinia";
import { ref } from "vue";
import { EV, EVENTS } from "@notesnook-vue/contracts";
import { getDatabase } from "@/platform/bootstrap";
import type { EditorStats, SyncState } from "@/utils/status";

/**
 * Status store (Phase 3.4) — the reactive backing for the distributed status
 * surfaces (the bottom status bar was removed; its concerns were relocated):
 *  - Sync status → the sidebar account area (`Sidebar.vue`).
 *  - Word/line/col counts → the editor tags footer (`Editor.vue`).
 *  - Autosave indicator → the editor toolbar (`EditorToolbar.vue`).
 * Holds three independent concerns:
 *
 *  - **Editor stats** (word/char count + cursor line/column): pushed in by
 *    `Editor.vue` via {@link setEditorStats} whenever the TipTap editor fires
 *    `update` / `selectionUpdate`. The store holds no ProseMirror knowledge.
 *  - **Sync lifecycle** (`syncState`): driven by `@notesnook/core`'s sync
 *    events — `syncProgress` → `syncing`, `syncCompleted` → refresh,
 *    `syncAborted` → `error`. `bindSyncEvents` subscribes once (idempotent).
 *  - **`lastSynced`**: read from `db.lastSynced()` on {@link refreshSync}
 *    (boot + after a completed sync).
 *
 * The "Local only" state is *not* stored here — it is derived in the view from
 * `useAuthStore().isLoggedIn`, so the store never imports the auth store and
 * stays testable in isolation.
 */
export const useStatusStore = defineStore("status", () => {
  const syncState = ref<SyncState>("idle");
  const lastSynced = ref<number>(0);
  /** True when `db.hasUnsyncedChanges()` reports local changes not yet pushed
   * (only meaningful when logged in; the view shows a `• unsynced` marker). */
  const hasUnsyncedChanges = ref(false);
  /** Bumped on each `syncCompleted` event (after `refreshSync`). Watched by
   * `App.vue` to reload notes + collections so freshly-synced server data
   * appears in the list without a manual refresh. */
  const syncCompletedSignal = ref(0);

  const wordCount = ref(0);
  const charCount = ref(0);
  const cursorLine = ref(1);
  const cursorColumn = ref(1);

  // Autosave indicator: the "Saving… / Saved" state of the FOCUSED pane's
  // editor, pushed in by `Editor.vue` via {@link setSaveState} with the same
  // focused-guard as the editor stats. Read by the editor toolbar
  // (`EditorToolbar.vue`).
  const saving = ref(false);
  const savedAt = ref<number | null>(null);

  /** A reactive wall-clock the sidebar sync indicator reads so "5m ago" stays
   * accurate without the user nudging the store. Bumped on an interval by
   * {@link startClock}; tests can set it directly for determinism. */
  const now = ref<number>(Date.now());
  let clockHandle: ReturnType<typeof setInterval> | null = null;
  let clockStarted = false;

  /** Push editor-derived stats (word/char count + cursor position). Called
   * by `Editor.vue` on `update` + `selectionUpdate`. */
  function setEditorStats(s: EditorStats): void {
    wordCount.value = s.wordCount;
    charCount.value = s.charCount;
    cursorLine.value = s.cursorLine;
    cursorColumn.value = s.cursorColumn;
  }

  /** Push the focused editor's autosave state so the status bar can render the
   *  "Saving… / Saved" indicator. Called by `Editor.vue` only when it is the
   *  focused pane (mirrors {@link setEditorStats}). */
  function setSaveState(isSaving: boolean, savedAtTs: number | null): void {
    saving.value = isSaving;
    savedAt.value = savedAtTs;
  }

  let syncBound = false;
  /**
   * Subscribe to `@notesnook/core`'s sync progress/completion/abort events
   * once. Idempotent — safe to call from `App.vue` boot and after login.
   */
  function bindSyncEvents(): void {
    if (syncBound) return;
    syncBound = true;
    EV.subscribe(EVENTS.syncProgress, () => {
      syncState.value = "syncing";
    });
    EV.subscribe(EVENTS.syncCompleted, () => {
      // TEMP-DIAG sync-pull: did core emit syncCompleted at all?
      // eslint-disable-next-line no-console
      console.log("[sync] syncCompleted event fired");
      void refreshSync().then(() => {
        if (syncState.value === "syncing") syncState.value = "synced";
        // Bump after refresh so watchers (App.vue) reload notes/collections
        // with the freshly-synced data.
        // TEMP-DIAG sync-pull: lastSynced value core reported after the sync,
        // + whether the local DB still has unsynced local changes (a dirty
        // local note can block pulling the server's newer version).
        // eslint-disable-next-line no-console
        console.log("[sync] syncCompleted -> lastSynced:", lastSynced.value, "hasUnsyncedChanges:", hasUnsyncedChanges.value);
        syncCompletedSignal.value += 1;
      });
    });
    EV.subscribe(EVENTS.syncAborted, () => {
      syncState.value = "error";
    });
  }

  /**
   * Read `lastSynced` + `hasUnsyncedChanges` from the database and settle the
   * sync state. Called on boot, after a completed sync, and when the shell
   * becomes visible (post login). Never throws — a failure leaves the
   * previous state intact.
   */
  async function refreshSync(): Promise<void> {
    try {
      const db = getDatabase();
      const ts = await db.lastSynced();
      lastSynced.value = ts ?? 0;
      syncState.value = ts ? "synced" : "idle";
      // hasUnsyncedChanges is optional on the db shape — guard for safety.
      if (typeof db.hasUnsyncedChanges === "function") {
        hasUnsyncedChanges.value = await db.hasUnsyncedChanges();
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[status] refreshSync failed:", e);
    }
  }

  /**
   * Start the wall-clock interval that keeps `now` fresh so relative sync
   * times don't go stale. Idempotent — safe to call from `App.vue` boot and
   * tests. `stopClock` clears it (tests should stop the clock to avoid a
   * dangling interval across files).
   */
  function startClock(intervalMs = 30_000): void {
    if (clockStarted) return;
    clockStarted = true;
    now.value = Date.now();
    clockHandle = setInterval(() => {
      now.value = Date.now();
    }, intervalMs);
  }

  /** Stop the wall-clock interval (mainly for tests). */
  function stopClock(): void {
    if (clockHandle !== null) {
      clearInterval(clockHandle);
      clockHandle = null;
    }
    clockStarted = false;
  }

  return {
    syncState,
    lastSynced,
    hasUnsyncedChanges,
    syncCompletedSignal,
    now,
    wordCount,
    charCount,
    cursorLine,
    cursorColumn,
    saving,
    savedAt,
    setEditorStats,
    setSaveState,
    refreshSync,
    bindSyncEvents,
    startClock,
    stopClock
  };
});