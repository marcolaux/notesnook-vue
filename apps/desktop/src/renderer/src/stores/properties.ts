import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { getDatabase } from "@/platform/bootstrap";
import { useNotesStore } from "@/stores/notes";
import type { Notebook, Tag } from "@notesnook-vue/contracts";
import {
  noteStats,
  toAssignedTag,
  toAssignedNotebook,
  uniqueById,
  TOGGLE_KEYS,
  type AssignedNotebook,
  type AssignedTag,
  type NoteStats,
  type ToggleKey,
  type ToggleState
} from "@/utils/properties";

/**
 * Properties store (Phase 5.1) — the data backing the right-side properties
 * panel for the active note: content stats (word/char/line), the four core-
 * backed per-note toggles, and the created/modified dates.
 *
 * Bounded to the toggles `@notesnook/core`'s `Notes` collection exposes
 * dedicated setters for (`pin`/`favorite`/`readonly`/`localOnly`), plus the
 * active note's tag + notebook assignments (read via `db.relations.to(...,
 * "tag"|"notebook").resolve()`, written via `db.relations.add`/`unlink` for
 * tags and `db.notes.addToNotebook`/`removeFromNotebook` for notebooks — the
 * `Note.tags`/`Note.notebooks` fields are `@deprecated`). Vault-lock, archive,
 * and spell-check are still deferred. The panel UI itself is on-site.
 *
 * Coupling: reads the active note + its loaded HTML from the notes store (a
 * facade over the editor-layout store) and the toggle setters from the db.
 * `toggle(key)` flips a flag via `db.notes.<key>(state, id)`, reloads the full
 * note (so `readonly`/`localOnly` — which the list item doesn't carry — stay
 * fresh), and reloads the notes list so pin/favorite/dateEdited update.
 *
 * Stats are derived from the *loaded* `activeContent` HTML (headless path); a
 * live on-site panel can instead read the editor's text — the store exposes
 * `setStats` so the editor can push live counts directly when available.
 */
const EMPTY_TOGGLES: ToggleState = { pinned: false, favorite: false, readonly: false, localOnly: false };

/**
 * Maps a {@link ToggleKey} to its `db.notes.*` setter name. Only `pinned`
 * differs from the toggle id (`db.notes.pin`); the other three match.
 */
const TOGGLE_DB_METHOD: Record<ToggleKey, "pin" | "favorite" | "readonly" | "localOnly"> = {
  pinned: "pin",
  favorite: "favorite",
  readonly: "readonly",
  localOnly: "localOnly"
};

export const usePropertiesStore = defineStore("properties", () => {
  const notes = useNotesStore();

  /** Content stats for the active note (derived from `activeContent` or pushed
   * live by the editor via {@link setStats}). */
  const stats = ref<NoteStats>({ words: 0, chars: 0, lines: 0 });
  /** The four core-backed toggles for the active note (loaded from the full
   * Note via `db.notes.note(id)`). */
  const toggles = ref<ToggleState>({ ...EMPTY_TOGGLES });
  /** True while the full note is being loaded for toggle state. */
  const loadingNote = ref(false);

  /** Tags assigned to the active note (loaded via `db.relations.to(note,
   * "tag").resolve()`). Empty when no note is active. */
  const tags = ref<AssignedTag[]>([]);
  /** Notebooks the active note belongs to (loaded via `db.relations.to(note,
   * "notebook").resolve()`; a note may belong to several). */
  const notebooks = ref<AssignedNotebook[]>([]);
  /** True while tag/notebook assignments are being (re)loaded. */
  const loadingAssignments = ref(false);
  /** True while a tag/notebook mutation is in flight (gates the panel UI). */
  const busy = ref(false);
  /** Last assignment-mutation error message, or `null`. Cleared on success. */
  const lastError = ref<string | null>(null);

  const activeNoteId = computed(() => notes.activeNote?.id ?? null);

  /** Created/modified dates (absolute) for the active note's list item. */
  const dateCreated = computed(() => notes.activeNote?.dateCreated ?? 0);
  const dateEdited = computed(() => notes.activeNote?.dateEdited ?? 0);

  /** Load the full Note to populate the toggles (the list item only carries
   * pin/favorite; readonly/localOnly come from the full note). Idempotent +
   * never throws — a failure leaves the previous toggles intact. */
  async function loadNote(): Promise<void> {
    const id = activeNoteId.value;
    if (!id) {
      toggles.value = { ...EMPTY_TOGGLES };
      return;
    }
    loadingNote.value = true;
    try {
      const db = getDatabase();
      const note = await db.notes.note(id);
      if (note) {
        toggles.value = {
          pinned: !!note.pinned,
          favorite: !!note.favorite,
          readonly: !!note.readonly,
          localOnly: !!note.localOnly
        };
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[properties] loadNote failed:", e);
    } finally {
      loadingNote.value = false;
    }
  }

  /** Load the active note's tag + notebook assignments in parallel via
   * `db.relations.to(note, "tag"|"notebook").resolve()`. Idempotent + never
   * throws — a failure leaves the previous assignments intact. Resets to
   * empty when no note is active. */
  async function loadAssignments(): Promise<void> {
    const id = activeNoteId.value;
    if (!id) {
      tags.value = [];
      notebooks.value = [];
      return;
    }
    loadingAssignments.value = true;
    try {
      const db = getDatabase();
      const ref = { id, type: "note" as const };
      const [tagItems, notebookItems] = await Promise.all([
        db.relations.to(ref, "tag").resolve().catch(() => []),
        db.relations.to(ref, "notebook").resolve().catch(() => [])
      ]);
      tags.value = uniqueById((tagItems as Tag[]).map(toAssignedTag));
      notebooks.value = uniqueById((notebookItems as Notebook[]).map(toAssignedNotebook));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[properties] loadAssignments failed:", e);
    } finally {
      loadingAssignments.value = false;
    }
  }

  /** Recompute content stats from the loaded HTML. */
  function refreshStats(): void {
    stats.value = noteStats(notes.activeContent || "");
  }

  /** Live-editor push: the editor can push its current word/char/line counts
   * directly so the panel updates as the user types (on-site optimisation;
   * the headless path derives from `activeContent` via {@link refreshStats}). */
  function setStats(s: NoteStats): void {
    stats.value = s;
  }

  /**
   * Flip a per-note toggle via the db setter, then reload the full note +
   * the notes list (so pin/favorite/dateEdited reflect in the list). Returns
   * the new state, or `null` if the toggle could not be applied.
   */
  async function toggle(key: ToggleKey): Promise<boolean | null> {
    const id = activeNoteId.value;
    if (!id) return null;
    const next = !toggles.value[key];
    try {
      const db = getDatabase();
      await db.notes[TOGGLE_DB_METHOD[key]](next, id);
      // Reload the full note so the toggles (incl. readonly/localOnly) stay
      // fresh, and the list so pin/favorite/dateEdited update.
      await loadNote();
      await notes.load();
      return toggles.value[key];
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[properties] toggle failed:", e);
      return null;
    }
  }

  /**
   * Attach an existing tag to the active note via
   * `db.relations.add({tag}, {note})` (tag→note direction, per upstream), then
   * reload assignments + the notes list. Returns `true` on success, `false`
   * if no note is active or the call threw.
   */
  async function addTag(tagId: string): Promise<boolean> {
    const id = activeNoteId.value;
    if (!id) return false;
    busy.value = true;
    try {
      const db = getDatabase();
      await db.relations.add(
        { id: tagId, type: "tag" },
        { id, type: "note" }
      );
      await loadAssignments();
      await notes.load();
      lastError.value = null;
      return true;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[properties] addTag failed:", e);
      return false;
    } finally {
      busy.value = false;
    }
  }

  /**
   * Detach a tag from the active note via `db.relations.unlink({tag}, {note})`,
   * then reload. See {@link addTag} for the return contract.
   */
  async function removeTag(tagId: string): Promise<boolean> {
    const id = activeNoteId.value;
    if (!id) return false;
    busy.value = true;
    try {
      const db = getDatabase();
      await db.relations.unlink(
        { id: tagId, type: "tag" },
        { id, type: "note" }
      );
      await loadAssignments();
      await notes.load();
      lastError.value = null;
      return true;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[properties] removeTag failed:", e);
      return false;
    } finally {
      busy.value = false;
    }
  }

  /**
   * Create a new tag (`db.tags.add({title})` → id) and attach it to the active
   * note. Data-returning (unlike the boolean mutators): on success returns the
   * new `{id, title}` so the panel can render the chip without a reload; on
   * failure (no active note, duplicate title, or a relation error) returns
   * `null`. The sidebar's collections store is NOT refreshed here — the view
   * composes `collections.load()` after a successful create (on-site).
   */
  async function createTag(title: string): Promise<AssignedTag | null> {
    const id = activeNoteId.value;
    if (!id || !title.trim()) return null;
    busy.value = true;
    try {
      const db = getDatabase();
      const tagId = await db.tags.add({ title: title.trim() });
      await db.relations.add(
        { id: tagId, type: "tag" },
        { id, type: "note" }
      );
      await loadAssignments();
      await notes.load();
      lastError.value = null;
      return tags.value.find((t) => t.id === tagId) ?? { id: tagId, title: title.trim() };
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[properties] createTag failed:", e);
      return null;
    } finally {
      busy.value = false;
    }
  }

  /**
   * Add the active note to a notebook via `db.notes.addToNotebook(notebookId,
   * noteId)`, then reload. See {@link addTag} for the return contract.
   */
  async function addNotebook(notebookId: string): Promise<boolean> {
    const id = activeNoteId.value;
    if (!id) return false;
    busy.value = true;
    try {
      const db = getDatabase();
      await db.notes.addToNotebook(notebookId, id);
      await loadAssignments();
      await notes.load();
      lastError.value = null;
      return true;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[properties] addNotebook failed:", e);
      return false;
    } finally {
      busy.value = false;
    }
  }

  /**
   * Remove the active note from a notebook via
   * `db.notes.removeFromNotebook(notebookId, noteId)`, then reload. See
   * {@link addTag} for the return contract.
   */
  async function removeNotebook(notebookId: string): Promise<boolean> {
    const id = activeNoteId.value;
    if (!id) return false;
    busy.value = true;
    try {
      const db = getDatabase();
      await db.notes.removeFromNotebook(notebookId, id);
      await loadAssignments();
      await notes.load();
      lastError.value = null;
      return true;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[properties] removeNotebook failed:", e);
      return false;
    } finally {
      busy.value = false;
    }
  }

  // When the active note changes: reset stats to the loaded content + reload
  // the full note for toggle state + reload tag/notebook assignments. `immediate`
  // so an already-open note seeds the panel on first mount. `flush: "sync"` so
  // stats update in the same tick (the headless tests assert synchronously after
  // a content change).
  watch(
    activeNoteId,
    () => {
      refreshStats();
      void loadNote();
      void loadAssignments();
    },
    { immediate: true, flush: "sync" }
  );

  // Keep stats fresh when the loaded content changes (e.g. after a reload or
  // when the editor flushes a different note's content).
  watch(
    () => notes.activeContent,
    () => refreshStats(),
    { flush: "sync" }
  );

  return {
    stats,
    toggles,
    loadingNote,
    tags,
    notebooks,
    loadingAssignments,
    busy,
    lastError,
    activeNoteId,
    dateCreated,
    dateEdited,
    TOGGLE_KEYS,
    loadNote,
    loadAssignments,
    refreshStats,
    setStats,
    toggle,
    addTag,
    removeTag,
    createTag,
    addNotebook,
    removeNotebook
  };
});