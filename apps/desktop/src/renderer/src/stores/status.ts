import { defineStore } from "pinia";
import { ref } from "vue";
import { EV, EVENTS } from "@notesnook-vue/contracts";
import { getDatabase } from "@/platform/bootstrap";
import type { EditorStats, SyncState } from "@/utils/status";

/**
 * Status store (Phase 3.4) — the reactive backing for the bottom status bar.
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

  const wordCount = ref(0);
  const charCount = ref(0);
  const cursorLine = ref(1);
  const cursorColumn = ref(1);

  /** Push editor-derived stats (word/char count + cursor position). Called
   * by `Editor.vue` on `update` + `selectionUpdate`. */
  function setEditorStats(s: EditorStats): void {
    wordCount.value = s.wordCount;
    charCount.value = s.charCount;
    cursorLine.value = s.cursorLine;
    cursorColumn.value = s.cursorColumn;
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
      void refreshSync().then(() => {
        if (syncState.value === "syncing") syncState.value = "synced";
      });
    });
    EV.subscribe(EVENTS.syncAborted, () => {
      syncState.value = "error";
    });
  }

  /**
   * Read `lastSynced` from the database and settle the sync state. Called on
   * boot, after a completed sync, and when the shell becomes visible (post
   * login). Never throws — a failure leaves the previous state intact.
   */
  async function refreshSync(): Promise<void> {
    try {
      const db = getDatabase();
      const ts = await db.lastSynced();
      lastSynced.value = ts ?? 0;
      syncState.value = ts ? "synced" : "idle";
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[status] refreshSync failed:", e);
    }
  }

  return {
    syncState,
    lastSynced,
    wordCount,
    charCount,
    cursorLine,
    cursorColumn,
    setEditorStats,
    refreshSync,
    bindSyncEvents
  };
});