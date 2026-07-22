/**
 * Per-tab note-history timeline composable (note-history sidebar).
 *
 * Unlike the singleton `useNoteHistoryStore` (which keys off the global
 * `notes.activeNote` and so can only describe the focused pane's note), this is
 * a **per-instance** composable created by `HistorySidebar.vue` with the note
 * id of *its own* tab. That keeps each split pane's history sidebar scoped to
 * the tab it lives in — two sidebars open in two panes show two different
 * notes' histories without clobbering each other.
 *
 * Reads the same `db.noteHistory` surface the store uses — `get(noteId).items`
 * for the revision list, `content(sessionId)` for a revision's body — and
 * computes per-version diffs via the pure {@link diffHtml} helper. Revision
 * bodies are fetched lazily (one IPC round-trip each — see the boot-perf
 * memory) and cached for the lifetime of this note id; the diff for an entry
 * is computed once both it and its older sibling's body have loaded.
 *
 * Restore delegates to `db.noteHistory.restore`, then force-refreshes the
 * notes-store content cache + bumps the per-note change signal so the editor
 * reloads the reverted content, and re-lists the timeline.
 */
import { ref, watch, onUnmounted, type Ref } from "vue";
import { getDatabase } from "@/platform/bootstrap";
import { useNotesStore } from "@/stores/notes";
import {
  sortHistoryByDateDesc,
  toHistoryEntry,
  type HistoryEntry
} from "@/utils/note-history";
import { diffHtml, type DiffLine } from "@/utils/note-history-diff";
import type { HistorySession } from "@notesnook-vue/contracts";

/** A revision's body, or `null` while unloaded / `undefined` when vault-locked. */
type LoadedContent = { html: string } | { locked: true } | null;

/**
 * Wire a per-tab history timeline to `db.noteHistory`.
 *
 * @param noteId a ref/getter returning the tab's note id (`null` when none).
 * The composable re-lists + clears its content cache whenever this changes.
 */
export function useNoteHistoryTimeline(noteId: Ref<string | null> | (() => string | null)) {
  const notes = useNotesStore();
  const readId = typeof noteId === "function" ? noteId : () => noteId.value;

  /** Revisions of this note, newest-first. */
  const sessions = ref<HistoryEntry[]>([]);
  const loading = ref(false);
  const busy = ref(false);
  const lastError = ref<string | null>(null);

  /** Per-session-id loaded body (lazy). `null` = not yet loaded. */
  const contentCache = new Map<string, LoadedContent>();
  /** Reactive generation counter — bumped when `contentCache` mutates so the
   *  template re-evaluates `diffFor` (a `Map` is not reactive on its own). */
  const contentGen = ref(0);

  /** Reload the revision list for `noteId`, newest-first. Never throws. */
  async function refresh(): Promise<void> {
    const id = readId();
    if (!id) {
      sessions.value = [];
      diffCache.clear();
      contentGen.value++;
      return;
    }
    loading.value = true;
    try {
      const db = getDatabase();
      const rows: HistorySession[] = await db.noteHistory
        .get(id)
        .items(undefined, { sortBy: "dateModified", sortDirection: "desc" });
      sessions.value = sortHistoryByDateDesc(rows.map(toHistoryEntry));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[note-history-timeline] refresh failed:", e);
      sessions.value = [];
    } finally {
      loading.value = false;
      // The list changed (newest-first order / new entries) → drop cached diffs
      // (they were computed against the prior sibling order) + bump so the
      // template re-evaluates `diffFor`.
      diffCache.clear();
      contentGen.value++;
    }
  }

  /**
   * Lazily load a revision's body via `db.noteHistory.content(id)`. Cached per
   * session id for this note. A non-string `data` (a `Cipher`) marks the
   * revision locked. Never throws — a failure leaves the entry `null`.
   */
  async function loadContent(sessionId: string): Promise<void> {
    if (contentCache.has(sessionId)) return;
    try {
      const db = getDatabase();
      // `content()` returns `Partial<NoteContent<boolean> & { title }> | undefined`
      // — `data` is the HTML string when unlocked, a `Cipher` when vault-locked.
      const item = await db.noteHistory.content(sessionId);
      const data = item?.data;
      if (typeof data === "string") {
        contentCache.set(sessionId, { html: data });
      } else if (data !== undefined) {
        contentCache.set(sessionId, { locked: true });
      } else {
        contentCache.set(sessionId, { html: "" });
      }
      contentGen.value++;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[note-history-timeline] loadContent failed:", e);
      contentCache.set(sessionId, { html: "" });
      contentGen.value++;
    }
  }

  /** Whether a revision's body has been loaded (locked or not). */
  function isLoaded(sessionId: string): boolean {
    return contentCache.get(sessionId) !== undefined;
  }

  /** Whether a revision is vault-locked (body loaded but encrypted). */
  function isLocked(sessionId: string): boolean {
    const c = contentCache.get(sessionId);
    return !!c && "locked" in c && c.locked;
  }

  /**
   * The diff for `entry` (newer) against its older sibling (the next entry in
   * the newest-first list). `add` lines = what this version added; `del` =
   * what it removed. Returns `null` until both bodies are loaded, `[]` if this
   * is the oldest version (no older sibling → initial version, caller renders
   * full content instead), or `null` if the older sibling is locked.
   *
   * Memoised per entry id + invalidated whenever `contentGen` bumps (a body
   * loaded or the cache cleared) — the template calls this several times per
   * entry per render, so caching avoids recomputing the LCS each time.
   */
  const diffCache = new Map<string, { gen: number; value: DiffLine[] | null }>();
  function diffFor(entry: HistoryEntry): DiffLine[] | null {
    // Touch `contentGen` so Vue re-runs this on cache mutation.
    const gen = contentGen.value;
    void gen;
    const cached = diffCache.get(entry.id);
    if (cached && cached.gen === gen) return cached.value;
    const idx = sessions.value.findIndex((s) => s.id === entry.id);
    let value: DiffLine[] | null;
    if (idx < 0) value = null;
    else {
      const older = sessions.value[idx + 1];
      const curr = contentCache.get(entry.id);
      if (!curr || "locked" in curr) value = null;
      else if (!older) value = []; // initial version — no diff
      else {
        const prev = contentCache.get(older.id);
        value = !prev || "locked" in prev
          ? null
          : diffHtml((prev as { html: string }).html, (curr as { html: string }).html);
      }
    }
    diffCache.set(entry.id, { gen, value });
    return value;
  }

  /** The plain-text body of a loaded revision (for the expanded preview). */
  function bodyOf(sessionId: string): string | null {
    const c = contentCache.get(sessionId);
    if (!c) return null;
    if ("locked" in c) return null;
    return c.html;
  }

  /**
   * Restore the note to `sessionId` via `db.noteHistory.restore`, then force-
   * refresh the content cache + bump the per-note change signal (so the editor
   * reloads the reverted content) + reload the notes list + re-list the
   * timeline. Returns `true` on success, `false` if it threw.
   */
  async function restore(sessionId: string): Promise<boolean> {
    const id = readId();
    busy.value = true;
    try {
      const db = getDatabase();
      await db.noteHistory.restore(sessionId);
      if (id) {
        await notes.loadContent(id, { force: true });
        notes.handleRemoteNoteChanged(id);
        await notes.load();
      }
      // The restored content is a new version → drop the cache + re-list.
      contentCache.clear();
      diffCache.clear();
      contentGen.value++;
      await refresh();
      lastError.value = null;
      return true;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[note-history-timeline] restore failed:", e);
      return false;
    } finally {
      busy.value = false;
    }
  }

  // Re-list + drop the content/diff caches on note switch. `immediate` so an
  // already-open note seeds the sidebar on first mount; `flush: "sync"` so the
  // reset is observable synchronously.
  const stop = watch(
    readId,
    () => {
      contentCache.clear();
      diffCache.clear();
      contentGen.value++;
      void refresh();
    },
    { immediate: true, flush: "sync" }
  );

  onUnmounted(() => stop());

  return {
    sessions,
    loading,
    busy,
    lastError,
    refresh,
    loadContent,
    isLoaded,
    isLocked,
    diffFor,
    bodyOf,
    restore
  };
}