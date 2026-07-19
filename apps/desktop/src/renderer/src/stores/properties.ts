import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { getDatabase } from "@/platform/bootstrap";
import { useNotesStore } from "@/stores/notes";
import {
  noteStats,
  TOGGLE_KEYS,
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
 * dedicated setters for (`pin`/`favorite`/`readonly`/`localOnly`). Tags,
 * notebooks, vault-lock, archive, and spell-check are deferred (see
 * `utils/properties.ts`). The panel UI itself is on-site.
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

  // When the active note changes: reset stats to the loaded content + reload
  // the full note for toggle state. `immediate` so an already-open note seeds
  // the panel on first mount. `flush: "sync"` so stats update in the same tick
  // (the headless tests assert synchronously after a content change).
  watch(
    activeNoteId,
    () => {
      refreshStats();
      void loadNote();
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
    activeNoteId,
    dateCreated,
    dateEdited,
    TOGGLE_KEYS,
    loadNote,
    refreshStats,
    setStats,
    toggle
  };
});