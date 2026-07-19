import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { Note } from "@notesnook-vue/contracts";
import { getDatabase } from "@/platform/bootstrap";
import {
  filterNotes,
  sortNotes,
  DEFAULT_SORT_KEY,
  DEFAULT_SORT_DIR,
  type SortKey,
  type SortDir
} from "@/utils/notes-list";
import {
  extractNotePreview,
  EMPTY_PREVIEW,
  type NotePreview
} from "@/utils/note-preview";

export interface NoteListItem {
  id: string;
  title: string;
  headline: string;
  dateCreated: number;
  dateEdited: number;
  tags: string[];
  pinned: boolean;
  favorite: boolean;
}

interface EditorTab {
  id: string;
  noteId: string;
  title: string;
}

/** Editor content is stored as HTML (Notesnook `type: "tiptap"` content). */
type ContentState = "idle" | "loading" | "loaded" | "locked" | "error";
type SaveState = "idle" | "saving" | "saved" | "error";

function toListItem(n: Note): NoteListItem {
  return {
    id: n.id,
    title: n.title || "Untitled",
    headline: n.headline ?? "",
    dateCreated: n.dateCreated,
    dateEdited: n.dateEdited,
    tags: (n.tags ?? []).filter((t): t is string => typeof t === "string"),
    pinned: n.pinned,
    favorite: n.favorite
  };
}

/**
 * Notes store — reads from `@notesnook/core`'s `database.notes` collection.
 *
 * Content (the note body) is fetched separately via `database.content
 * .findByNoteId` and stored as HTML. Phase-2 spike: round-trips through a
 * TipTap editor in `Editor.vue`.
 */
export const useNotesStore = defineStore("notes", () => {
  const items = ref<NoteListItem[]>([]);
  const openTabs = ref<EditorTab[]>([]);
  const activeTabId = ref<string | null>(null);

  /** HTML content of the active note (`""` when empty / not yet loaded). */
  const activeContent = ref<string>("");
  const contentState = ref<ContentState>("idle");
  const saveState = ref<SaveState>("idle");
  const lastSavedAt = ref<number | null>(null);

  // Notes-list view state (Phase 3.3): search query + regex flag + sort. The
  // `visibleItems` computed is what the list renders; `items` stays the raw
  // collection so filtering/sorting never throws away data.
  const query = ref("");
  const regexSearch = ref(false);
  const sortKey = ref<SortKey>(DEFAULT_SORT_KEY);
  const sortDir = ref<SortDir>(DEFAULT_SORT_DIR);
  /** Incremented by the "Search notes" palette command; the list watches it to
   * focus the search input (DOM focus is an on-site visual gate). */
  const focusSearchSignal = ref(0);

  // Per-note list previews (Phase 3.3 follow-up): thumbnail + checklist
  // progress, derived from each note's HTML body. Populated lazily and cached
  // by `loadPreview` so the list renders fast and previews trickle in.
  const previews = ref<Record<string, NotePreview>>({});
  /** noteId → "loading" while a preview fetch is in flight (idempotency guard). */
  const pendingPreviews = new Set<string>();

  const count = computed(() => items.value.length);

  /** The list the `NotesList` renders: filtered by `query`, then sorted. */
  const visibleItems = computed<NoteListItem[]>(() =>
    sortNotes(filterNotes(items.value, query.value, { regex: regexSearch.value }), sortKey.value, sortDir.value)
  );

  const activeTab = computed(() => openTabs.value.find((t) => t.id === activeTabId.value) ?? null);
  const activeNote = computed(() =>
    items.value.find((n) => n.id === activeTab.value?.noteId) ?? null
  );

  function openTab(note: Pick<NoteListItem, "id" | "title">): void {
    const existing = openTabs.value.find((t) => t.noteId === note.id);
    if (existing) {
      activeTabId.value = existing.id;
      return;
    }
    const tab: EditorTab = { id: crypto.randomUUID(), noteId: note.id, title: note.title };
    openTabs.value.push(tab);
    activeTabId.value = tab.id;
  }

  function closeTab(tabId: string): void {
    const idx = openTabs.value.findIndex((t) => t.id === tabId);
    if (idx === -1) return;
    openTabs.value.splice(idx, 1);
    if (activeTabId.value === tabId) {
      activeTabId.value = openTabs.value[idx - 1]?.id ?? openTabs.value[0]?.id ?? null;
    }
  }

  function selectNote(id: string): void {
    const item = items.value.find((n) => n.id === id);
    if (item) openTab(item);
  }

  /** Update the search query (plain or regex per `regexSearch`). */
  function setQuery(q: string): void {
    query.value = q;
  }

  /** Toggle regex mode for the search query. */
  function toggleRegex(): void {
    regexSearch.value = !regexSearch.value;
  }

  function setSortKey(key: SortKey): void {
    sortKey.value = key;
  }

  function setSortDir(dir: SortDir): void {
    sortDir.value = dir;
  }

  /** Flip asc↔desc for the current sort key. */
  function toggleSortDir(): void {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  }

  function clearSearch(): void {
    query.value = "";
  }

  /** Palette "Search notes" command → bump the focus signal. */
  function focusSearch(): void {
    focusSearchSignal.value += 1;
  }

  /** Load all notes from the database into the list. */
  async function load(): Promise<void> {
    const db = getDatabase();
    const all = await db.notes.all.items();
    items.value = all.map(toListItem);
    // Fire-and-forget preview enrichment per note: the list renders
    // immediately from `items`, previews populate as each content fetch
    // resolves. Not awaited so a slow/locked note never blocks the list.
    for (const note of items.value) void loadPreview(note.id);
  }

  /**
   * Fetch + parse a note's HTML body into a list preview (thumbnail +
   * checklist progress), caching it in {@link previews}. Idempotent: a
   * second call for an already-cached or in-flight note is a no-op unless
   * `force` is set (e.g. after an edit). Vault-locked / missing content
   * resolves to an empty preview rather than throwing.
   */
  async function loadPreview(noteId: string, force = false): Promise<void> {
    if (!force && (previews.value[noteId] || pendingPreviews.has(noteId))) {
      return;
    }
    pendingPreviews.add(noteId);
    try {
      const db = getDatabase();
      const item = await db.content.findByNoteId(noteId);
      if (item && "locked" in item && item.locked) {
        previews.value = { ...previews.value, [noteId]: EMPTY_PREVIEW };
        return;
      }
      const data = item && typeof item.data === "string" ? item.data : "";
      previews.value = { ...previews.value, [noteId]: extractNotePreview(data) };
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[notes] loadPreview failed:", e);
      previews.value = { ...previews.value, [noteId]: EMPTY_PREVIEW };
    } finally {
      pendingPreviews.delete(noteId);
    }
  }

  /** Create a new note, reload, and open it in a tab. */
  async function create(): Promise<void> {
    const db = getDatabase();
    const id = await db.notes.add({ title: "New note" });
    await load();
    const item = items.value.find((n) => n.id === id);
    if (item) openTab(item);
  }

  /**
   * Load the HTML body of the active note. Vault-locked notes surface as
   * `contentState === "locked"` (unlock is Phase 6).
   */
  async function loadActiveContent(): Promise<void> {
    const note = activeNote.value;
    if (!note) {
      activeContent.value = "";
      contentState.value = "idle";
      return;
    }
    contentState.value = "loading";
    try {
      const db = getDatabase();
      const item = await db.content.findByNoteId(note.id);
      if (item && "locked" in item && item.locked) {
        activeContent.value = "";
        contentState.value = "locked";
        return;
      }
      const data = item && typeof item.data === "string" ? item.data : "";
      activeContent.value = data;
      contentState.value = "loaded";
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[notes] loadActiveContent failed:", e);
      activeContent.value = "";
      contentState.value = "error";
    }
  }

  /**
   * Persist a note's HTML body. Uses `notes.add` with the existing id so the
   * collection upserts content + bumps `dateEdited`/`headline` atomically
   * (the same path the upstream editor uses). Takes an explicit `noteId` so
   * the Editor can flush a pending edit for the *previous* note on switch.
   */
  async function saveContent(noteId: string, html: string): Promise<void> {
    const note = items.value.find((n) => n.id === noteId);
    if (!note) return;
    saveState.value = "saving";
    try {
      const db = getDatabase();
      await db.notes.add({
        id: note.id,
        title: note.title,
        content: { type: "tiptap", data: html },
        localOnly: false,
        pinned: note.pinned,
        favorite: note.favorite,
        readonly: false
      });
      lastSavedAt.value = Date.now();
      saveState.value = "saved";
      // Patch the list item in place so dateEdited/headline stay fresh.
      note.dateEdited = Date.now();
      // headline is regenerated by core from the content; approximate from
      // the first text line for the list until the next full `load()`.
      const firstLine = html
        .replace(/<[^>]+>/g, " ")
        .trim()
        .split(/\s+/)
        .slice(0, 10)
        .join(" ");
      note.headline = firstLine;
      // Re-derive the list preview from the just-saved HTML so the thumbnail
      // / progress bar update live without a content round-trip.
      previews.value = { ...previews.value, [note.id]: extractNotePreview(html) };
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[notes] saveContent failed:", e);
      saveState.value = "error";
    }
  }

  return {
    items,
    visibleItems,
    openTabs,
    activeTabId,
    activeTab,
    activeNote,
    count,
    activeContent,
    contentState,
    saveState,
    lastSavedAt,
    query,
    regexSearch,
    sortKey,
    sortDir,
    focusSearchSignal,
    previews,
    openTab,
    closeTab,
    selectNote,
    load,
    create,
    loadPreview,
    loadActiveContent,
    saveContent,
    setQuery,
    toggleRegex,
    setSortKey,
    setSortDir,
    toggleSortDir,
    clearSearch,
    focusSearch
  };
});