import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { getDatabase } from "@/platform/bootstrap";
import { useNotesStore } from "@/stores/notes";
import type { Color, Notebook, Tag } from "@notesnook-vue/contracts";
import {
  noteStats,
  toAssignedTag,
  toAssignedNotebook,
  toAssignedColor,
  uniqueById,
  TOGGLE_KEYS,
  type AssignedColor,
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
  /** The active note's assigned color (loaded via
   * `db.relations.to(note,"color").resolve()`; a note has at most one color),
   * or `null` when none / no note active. */
  const color = ref<AssignedColor | null>(null);
  /** True while tag/notebook/color assignments are being (re)loaded. */
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
      color.value = null;
      return;
    }
    loadingAssignments.value = true;
    try {
      const db = getDatabase();
      const ref = { id, type: "note" as const };
      const [tagItems, notebookItems, colorItems] = await Promise.all([
        db.relations.to(ref, "tag").resolve().catch(() => []),
        db.relations.to(ref, "notebook").resolve().catch(() => []),
        db.relations.to(ref, "color").resolve().catch(() => [])
      ]);
      tags.value = uniqueById((tagItems as Tag[]).map(toAssignedTag));
      notebooks.value = uniqueById((notebookItems as Notebook[]).map(toAssignedNotebook));
      // A note has at most one color; `db.relations.to(note,"color").resolve()`
      // returns the Color items on the `from` side — take the first (if any).
      const c = (colorItems as Color[])[0];
      color.value = c ? toAssignedColor(c) : null;
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

  /** Id-aware read of a note's assigned tag ids (`db.relations.to(note, "tag")
   *  .resolve()`). Unlike {@link loadAssignments} (which is active-note-only and
   *  mutates `tags`/`notebooks`/`color`), this is a side-effect-free read for an
   *  arbitrary note — used by the editor's chip reconcile on open, where the
   *  note may be a background split pane not reflected in `tags`. Never throws;
   *  returns `[]` on failure. */
  async function getAssignedTagIds(noteId: string): Promise<string[]> {
    try {
      const db = getDatabase();
      const items = await db.relations
        .to({ id: noteId, type: "note" }, "tag")
        .resolve()
        .catch(() => [] as Tag[]);
      return (items as Tag[]).map((t) => t.id);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[properties] getAssignedTagIds failed:", e);
      return [];
    }
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
   *
   * Accepts an optional explicit `noteId` so the notes-list context menu can
   * toggle a flag on a note that is NOT the active one (the menu operates on
   * the right-clicked row, not `activeNote`). When `noteId` is omitted or
   * matches the active note, the cached `toggles` state is used + refreshed as
   * before; for a non-active note the current state is read from the full note
   * via `db.notes.note(id)` (the list item only carries pin/favorite, so
   * readonly/localOnly must come from the full note).
   */
  async function toggle(key: ToggleKey, noteId?: string): Promise<boolean | null> {
    const id = noteId ?? activeNoteId.value;
    if (!id) return null;
    const isActive = id === activeNoteId.value;
    // Current state: from the cached toggles for the active note, else read the
    // full note (readonly/localOnly aren't on the list item).
    let current: boolean;
    if (isActive) {
      current = toggles.value[key];
    } else {
      try {
        const db = getDatabase();
        const note = await db.notes.note(id);
        current = note ? Boolean(note[key]) : false;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[properties] toggle(loadNote) failed:", e);
        return null;
      }
    }
    const next = !current;
    try {
      const db = getDatabase();
      await db.notes[TOGGLE_DB_METHOD[key]](next, id);
      if (isActive) {
        // Reload the full note so the toggles (incl. readonly/localOnly) stay
        // fresh, and the list so pin/favorite/dateEdited update.
        await loadNote();
      }
      await notes.load();
      return isActive ? toggles.value[key] : next;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[properties] toggle failed:", e);
      return null;
    }
  }

  /**
   * Attach an existing tag to a note via `db.relations.add({tag}, {note})`
   * (tag→note direction, per upstream), then reload assignments + the notes
   * list. Id-aware: `noteId` defaults to the active note so the notes-list row
   * context menu can tag a non-active note (mirrors {@link toggle}'s `noteId?`).
   * Returns `true` on success, `false` if no note resolves or the call threw.
   */
  async function addTag(tagId: string, noteId?: string): Promise<boolean> {
    const id = noteId ?? activeNoteId.value;
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
   * Detach a tag from a note via `db.relations.unlink({tag}, {note})`, then
   * reload. Id-aware (see {@link addTag}). See {@link addTag} for the return contract.
   */
  async function removeTag(tagId: string, noteId?: string): Promise<boolean> {
    const id = noteId ?? activeNoteId.value;
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
   * Create a new tag (`db.tags.add({title})` → id) and attach it to a note.
   * Id-aware (`noteId` defaults to the active note). Data-returning (unlike the
   * boolean mutators): on success returns the new `{id, title}` so the panel /
   * menu can render the chip without a reload; on failure (no note resolves,
   * duplicate title, or a relation error) returns `null`. When `noteId` is
   * explicit the result is built from the inputs (the active note's `tags`
   * list is not consulted). The sidebar's collections store is NOT refreshed
   * here — the view composes `collections.load()` after a successful create.
   */
  async function createTag(title: string, noteId?: string): Promise<AssignedTag | null> {
    const id = noteId ?? activeNoteId.value;
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
      return noteId
        ? { id: tagId, title: title.trim() }
        : tags.value.find((t) => t.id === tagId) ?? { id: tagId, title: title.trim() };
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
   * Add a note to a notebook via `db.notes.addToNotebook(notebookId, noteId)`,
   * then reload. Id-aware (see {@link addTag}). See {@link addTag} for the return contract.
   */
  async function addNotebook(notebookId: string, noteId?: string): Promise<boolean> {
    const id = noteId ?? activeNoteId.value;
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
   * Remove a note from a notebook via `db.notes.removeFromNotebook(notebookId,
   * noteId)`, then reload. Id-aware (see {@link addTag}). See {@link addTag}
   * for the return contract.
   */
  async function removeNotebook(notebookId: string, noteId?: string): Promise<boolean> {
    const id = noteId ?? activeNoteId.value;
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

  /**
   * Create a new notebook (`db.notebooks.add({title})` → id) and add a note to
   * it via `db.notes.addToNotebook`. Id-aware (`noteId` defaults to the active
   * note). Data-returning like {@link createTag}: on success `{id, title}`,
   * on failure `null`. The sidebar's collections store is NOT refreshed here —
   * the view composes `collections.load()` after a successful create.
   */
  async function createNotebook(title: string, noteId?: string): Promise<AssignedNotebook | null> {
    const id = noteId ?? activeNoteId.value;
    if (!id || !title.trim()) return null;
    busy.value = true;
    try {
      const db = getDatabase();
      const notebookId = await db.notebooks.add({ title: title.trim() });
      await db.notes.addToNotebook(notebookId, id);
      await loadAssignments();
      await notes.load();
      lastError.value = null;
      return { id: notebookId, title: title.trim() };
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[properties] createNotebook failed:", e);
      return null;
    } finally {
      busy.value = false;
    }
  }

  /**
   * Assign a color to a note via `db.relations.add({color}, {note})` (color→note
   * direction, per upstream; `Note.color` is `@deprecated`). A note has at most
   * one color, so any existing color relation is unlinked first via
   * `db.relations.to(note,"color").unlink()` (clears all color→note for the
   * note). Id-aware (`noteId` defaults to the active note). Returns `true` on
   * success, `false` if no note resolves or the call threw. See {@link addTag}
   * for the busy/lastError pattern.
   */
  async function setColor(colorId: string, noteId?: string): Promise<boolean> {
    const id = noteId ?? activeNoteId.value;
    if (!id) return false;
    busy.value = true;
    try {
      const db = getDatabase();
      const ref = { id, type: "note" as const };
      await db.relations.to(ref, "color").unlink();
      await db.relations.add(
        { id: colorId, type: "color" },
        { id, type: "note" }
      );
      await loadAssignments();
      await notes.load();
      lastError.value = null;
      return true;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[properties] setColor failed:", e);
      return false;
    } finally {
      busy.value = false;
    }
  }

  /**
   * Remove the note's color via `db.relations.to(note,"color").unlink()`.
   * Id-aware (see {@link setColor}). See {@link addTag} for the return contract.
   */
  async function clearColor(noteId?: string): Promise<boolean> {
    const id = noteId ?? activeNoteId.value;
    if (!id) return false;
    busy.value = true;
    try {
      const db = getDatabase();
      await db.relations.to({ id, type: "note" as const }, "color").unlink();
      await loadAssignments();
      await notes.load();
      lastError.value = null;
      return true;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[properties] clearColor failed:", e);
      return false;
    } finally {
      busy.value = false;
    }
  }

  // --- Bulk (multi-selection) actions --------------------------------------
  // Each operates on an explicit list of note ids (the notes-list multi-
  // selection) and uses the variadic `db.notes.*` signatures where core exposes
  // them (one batched SQL write for all ids) or loops `db.relations.add`/
  // `unlink` per note inside a `db.transaction` (no bulk relation add exists).
  // After the write, `loadAssignments()` refreshes the active note's panel
  // (only relevant when the active note is in the set — cheap re-read
  // otherwise) and `notes.load()` refreshes the list. Mirrors the busy/
  // lastError/never-throws pattern of the single-note mutators above.

  /** Set `pinned`/`favorite` to an explicit state across many notes in one
   *  batched `db.notes.pin`/`favorite(state, ...ids)` UPDATE. */
  async function setToggleMany(
    key: ToggleKey,
    ids: string[],
    state: boolean
  ): Promise<void> {
    if (ids.length === 0) return;
    busy.value = true;
    try {
      const db = getDatabase();
      await db.notes[TOGGLE_DB_METHOD[key]](state, ...ids);
      await loadAssignments();
      await notes.load();
      lastError.value = null;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[properties] setToggleMany failed:", e);
    } finally {
      busy.value = false;
    }
  }

  /** Add every note in `ids` to a notebook via the variadic
   *  `db.notes.addToNotebook(notebookId, ...noteIds)`. */
  async function addToNotebookMany(notebookId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    busy.value = true;
    try {
      const db = getDatabase();
      await db.notes.addToNotebook(notebookId, ...ids);
      await loadAssignments();
      await notes.load();
      lastError.value = null;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[properties] addToNotebookMany failed:", e);
    } finally {
      busy.value = false;
    }
  }

  /** Remove every note in `ids` from a notebook via the variadic
   *  `db.notes.removeFromNotebook(notebookId, ...noteIds)` (core wraps its
   *  internal loop in a single transaction). */
  async function removeFromNotebookMany(notebookId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    busy.value = true;
    try {
      const db = getDatabase();
      await db.notes.removeFromNotebook(notebookId, ...ids);
      await loadAssignments();
      await notes.load();
      lastError.value = null;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[properties] removeFromNotebookMany failed:", e);
    } finally {
      busy.value = false;
    }
  }

  /** Attach a tag to every note in `ids` (loop `db.relations.add` per note
   *  inside a transaction — no bulk relation add exists). */
  async function addTagToMany(tagId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    busy.value = true;
    try {
      const db = getDatabase();
      await db.transaction(async () => {
        for (const id of ids) {
          await db.relations.add({ id: tagId, type: "tag" }, { id, type: "note" });
        }
      });
      await loadAssignments();
      await notes.load();
      lastError.value = null;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[properties] addTagToMany failed:", e);
    } finally {
      busy.value = false;
    }
  }

  /** Detach a tag from every note in `ids` (loop `db.relations.unlink` per note
   *  inside a transaction). */
  async function removeTagToMany(tagId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    busy.value = true;
    try {
      const db = getDatabase();
      await db.transaction(async () => {
        for (const id of ids) {
          await db.relations.unlink({ id: tagId, type: "tag" }, { id, type: "note" });
        }
      });
      await loadAssignments();
      await notes.load();
      lastError.value = null;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[properties] removeTagToMany failed:", e);
    } finally {
      busy.value = false;
    }
  }

  /** Create a tag and attach it to every note in `ids`. */
  async function createTagMany(title: string, ids: string[]): Promise<void> {
    const t = title.trim();
    if (ids.length === 0 || !t) return;
    busy.value = true;
    try {
      const db = getDatabase();
      const tagId = await db.tags.add({ title: t });
      await db.transaction(async () => {
        for (const id of ids) {
          await db.relations.add({ id: tagId, type: "tag" }, { id, type: "note" });
        }
      });
      await loadAssignments();
      await notes.load();
      lastError.value = null;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[properties] createTagMany failed:", e);
    } finally {
      busy.value = false;
    }
  }

  /** Create a notebook and add every note in `ids` to it. */
  async function createNotebookMany(title: string, ids: string[]): Promise<void> {
    const t = title.trim();
    if (ids.length === 0 || !t) return;
    busy.value = true;
    try {
      const db = getDatabase();
      const notebookId = await db.notebooks.add({ title: t });
      await db.notes.addToNotebook(notebookId, ...ids);
      await loadAssignments();
      await notes.load();
      lastError.value = null;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[properties] createNotebookMany failed:", e);
    } finally {
      busy.value = false;
    }
  }

  /** Assign a color to every note in `ids` (loop per note: unlink existing
   *  color then add the new one, inside a transaction). Mirrors {@link setColor}
   *  per-note; a note has at most one color. */
  async function setColorMany(colorId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    busy.value = true;
    try {
      const db = getDatabase();
      await db.transaction(async () => {
        for (const id of ids) {
          await db.relations.to({ id, type: "note" }, "color").unlink();
          await db.relations.add({ id: colorId, type: "color" }, { id, type: "note" });
        }
      });
      await loadAssignments();
      await notes.load();
      lastError.value = null;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[properties] setColorMany failed:", e);
    } finally {
      busy.value = false;
    }
  }

  /** Clear the color from every note in `ids` via a single bulk
   *  `db.relations.to({type:"note",ids},"color").unlink()` (one SQL delete —
   *  a note has at most one color, so unlinking all color relations for the set
   *  is equivalent to clearing each note's color). */
  async function clearColorMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    busy.value = true;
    try {
      const db = getDatabase();
      await db.relations.to({ type: "note", ids }, "color").unlink();
      await loadAssignments();
      await notes.load();
      lastError.value = null;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[properties] clearColorMany failed:", e);
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
    color,
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
    getAssignedTagIds,
    removeTag,
    createTag,
    addNotebook,
    removeNotebook,
    createNotebook,
    setColor,
    clearColor,
    setToggleMany,
    addToNotebookMany,
    removeFromNotebookMany,
    addTagToMany,
    removeTagToMany,
    createTagMany,
    createNotebookMany,
    setColorMany,
    clearColorMany
  };
});