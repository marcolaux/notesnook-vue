import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { getDatabase } from "@/platform/bootstrap";
import { useNotesStore } from "@/stores/notes";
import {
  sortHistoryByDateDesc,
  toHistoryEntry,
  type HistoryEntry
} from "@/utils/note-history";
import type { HistorySession } from "@notesnook-vue/contracts";

/**
 * Note-history store (Phase 5.1) — the per-note revision history for the
 * active note's properties panel: the list of revisions (newest-first), a
 * preview of one revision's content, and a restore action, all over
 * `db.noteHistory` (`get(noteId).items(...)`, `content(sessionId)`,
 * `restore(sessionId)`).
 *
 * Revisions are written by core on every content save (capped by
 * `db.options.maxNoteVersions`). A revision's metadata is a `HistorySession`
 * (id, dateModified, locked); its body is a `SessionContentItem` fetched via
 * `content()`. Locked revisions return a `Cipher` for `data` — the store
 * surfaces them as a locked entry whose preview is empty (decryption needs a
 * vault unlock, an on-site/vault-gated follow-up).
 *
 * Coupling: reads the active note id from the notes store; the history
 * collection from the db. `activeNoteId` is observed via a `watch` so the list
 * reseeds on note switch. No event-subscribe → isolated testable (request/
 * response, like the sync-control store).
 */
export const useNoteHistoryStore = defineStore("note-history", () => {
  const notes = useNotesStore();

  /** Revisions of the active note, newest-first. Empty when no note is active. */
  const sessions = ref<HistoryEntry[]>([]);
  /** True while the revision list is being (re)loaded. */
  const loading = ref(false);
  /** True while a preview/restore mutation is in flight. */
  const busy = ref(false);
  /** Last preview/restore error message, or `null`. Cleared on success. */
  const lastError = ref<string | null>(null);
  /** The id of the revision currently previewed (or `null` if none). */
  const previewSessionId = ref<string | null>(null);
  /** The plain-text body of the previewed revision. `""` while none previewed
   *  or the revision is vault-locked (decryption is vault-gated). */
  const preview = ref("");

  const activeNoteId = computed(() => notes.activeNote?.id ?? null);

  /** Reload the revision list for the active note, newest-first. Idempotent +
   *  never throws — a failure leaves the previous list intact. Resets to empty
   *  when no note is active. */
  async function refresh(): Promise<void> {
    const id = activeNoteId.value;
    if (!id) {
      sessions.value = [];
      previewSessionId.value = null;
      preview.value = "";
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
      console.error("[note-history] refresh failed:", e);
    } finally {
      loading.value = false;
    }
  }

  /**
   * Load the plain-text preview of a revision via `db.noteHistory.content(id)`.
   * Locked revisions return a `Cipher` for `data`; the store surfaces them as
   * an empty preview + sets `lastError` (decryption needs a vault unlock — on-
   * site/vault-gated follow-up). Idempotent + never throws; sets `busy` while
   * in flight.
   */
  async function loadPreview(sessionId: string): Promise<void> {
    busy.value = true;
    try {
      const db = getDatabase();
      const content = await db.noteHistory.content(sessionId);
      previewSessionId.value = sessionId;
      const data = content?.data;
      preview.value = typeof data === "string" ? data : "";
      if (typeof data !== "string" && data !== undefined) {
        lastError.value = "Revision is locked (unlock the vault to preview).";
      } else {
        lastError.value = null;
      }
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[note-history] loadPreview failed:", e);
      preview.value = "";
      previewSessionId.value = null;
    } finally {
      busy.value = false;
    }
  }

  /**
   * Restore the active note to a revision via `db.noteHistory.restore(id)`,
   * then reload the revision list + the notes list (the note's content
   * changed). Returns `true` on success, `false` if the call threw. The editor
   * reload of the reverted content is an on-site follow-up (the notes store's
   * content-cache + reload signal drive it).
   */
  async function restore(sessionId: string): Promise<boolean> {
    busy.value = true;
    try {
      const db = getDatabase();
      await db.noteHistory.restore(sessionId);
      await refresh();
      await notes.load();
      lastError.value = null;
      return true;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[note-history] restore failed:", e);
      return false;
    } finally {
      busy.value = false;
    }
  }

  // When the active note changes: reseed the revision list + clear any preview.
  // `immediate` so an already-open note seeds the panel on first mount;
  // `flush: "sync"` so the headless tests can assert synchronously.
  watch(
    activeNoteId,
    () => {
      previewSessionId.value = null;
      preview.value = "";
      void refresh();
    },
    { immediate: true, flush: "sync" }
  );

  return {
    sessions,
    loading,
    busy,
    lastError,
    previewSessionId,
    preview,
    activeNoteId,
    refresh,
    loadPreview,
    restore
  };
});