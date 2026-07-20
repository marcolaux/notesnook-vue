import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { Note, Tag } from "@notesnook-vue/contracts";
import { getDatabase } from "@/platform/bootstrap";
import {
  filterNotes,
  sortNotes,
  DEFAULT_SORT_KEY,
  DEFAULT_SORT_DIR,
  DEFAULT_GROUP_KEY,
  type SortKey,
  type SortDir,
  type GroupKey
} from "@/utils/notes-list";
import {
  extractNotePreview,
  EMPTY_PREVIEW,
  type NotePreview
} from "@/utils/note-preview";
import type { CollectionType } from "@/stores/collections";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import { useShellStore } from "@/stores/shell";
import { desktop } from "@/platform/desktop-bridge";

/** A collection filter applied to the notes list (sidebar selection). The
 * `noteIds` set is resolved up-front from `@notesnook/core` (notebooks via
 * `db.notebooks.notes(id)`, tags via `db.relations`), then `visibleItems`
 * filters by membership — no per-render re-query. */
export interface CollectionFilter {
  type: CollectionType;
  id: string;
  noteIds: Set<string>;
}

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

/**
 * A tab as the editor tab-bar renders it: the layout store owns the tab's
 * identity + history; `title` is joined from the notes list here. This is a
 * *view* shape — no tab state is owned by the notes store (Phase 4.1
 * migration: tabs live in the editor-layout store).
 */
export interface EditorTab {
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
 *
 * Tab/pane bookkeeping is delegated to the editor-layout store (Phase 4.1):
 * this store owns note *data* only (items, content, previews, list view
 * state). The `openTabs`/`activeTabId`/`activeTab`/`activeNote`/`selectNote`/
 * `openTab`/`closeTab` API is kept as a facade so existing consumers
 * (`Editor.vue`, `NotesList.vue`, `app-commands.ts`) compile unchanged while
 * the real tab state lives in the layout store.
 */
export const useNotesStore = defineStore("notes", () => {
  const items = ref<NoteListItem[]>([]);

  // Tab state lives in the editor-layout store (Phase 4.1). The fields below
  // are facades over it so consumers don't change.
  const layout = useEditorLayoutStore();

  /**
   * Per-note content cache (Phase 4.2) — the HTML body + load state for each
   * note, keyed by note id. Replaces the former single-slot `activeContent`/
   * `contentState` so a split layout can keep several notes' content resident
   * at once (each pane reads its own note's entry). `activeContent`/
   * `contentState` below are now computeds over the *focused* note's entry, so
   * the properties/toc/links stores (which follow the focused pane) work
   * unchanged. Populated lazily by {@link loadContent}; never mutated on edit
   * (edits go to the DB via {@link saveContent} — the cache holds the loaded
   * snapshot, same staleness-by-design as the old single-slot ref).
   */
  const contentCache = ref<Record<string, { html: string; state: ContentState }>>({});

  /** Read a note's cached content entry (undefined when never loaded). */
  function getContent(noteId: string): { html: string; state: ContentState } | undefined {
    return contentCache.value[noteId];
  }

  /** HTML content of the focused note (`""` when empty / not yet loaded). */
  const activeContent = computed(() => getContent(activeNote.value?.id ?? "")?.html ?? "");
  /** Load state of the focused note. */
  const contentState = computed<ContentState>(
    () => getContent(activeNote.value?.id ?? "")?.state ?? "idle"
  );

  const saveState = ref<SaveState>("idle");
  const lastSavedAt = ref<number | null>(null);

  // Notes-list view state (Phase 3.3): search query + regex flag + sort. The
  // `visibleItems` computed is what the list renders; `items` stays the raw
  // collection so filtering/sorting never throws away data.
  const query = ref("");
  const regexSearch = ref(false);
  const sortKey = ref<SortKey>(DEFAULT_SORT_KEY);
  const sortDir = ref<SortDir>(DEFAULT_SORT_DIR);
  /** List grouping mode (Phase 3.3): `none` = flat, `date` = bucketed. */
  const groupKey = ref<GroupKey>(DEFAULT_GROUP_KEY);
  /** Incremented by the "Search notes" palette command; the list watches it to
   * focus the search input (DOM focus is an on-site visual gate). */
  const focusSearchSignal = ref(0);

  /**
   * Per-note change signals (Phase 4.2) — bumped by {@link handleRemoteNoteChanged}
   * for the note that changed in another window, so ANY pane showing that note
   * (focused or background) can reload from DB (skip-if-dirty). Replaces the
   * former single global signal, which only fired for the focused note and so
   * missed background panes. Read via {@link noteChangedSignalFor}.
   */
  const noteChangedSignals = ref<Record<string, number>>({});

  /** The change-signal counter for a note (0 when never bumped). */
  function noteChangedSignalFor(noteId: string): number {
    return noteChangedSignals.value[noteId] ?? 0;
  }

  /** One-shot flag set by `create()`: the Editor remounts per note id, so its
   * `onMounted` checks this to focus the title input for a freshly created
   * note (cleared on consumption). */
  const pendingTitleFocus = ref(false);

  /** Active sidebar-collection filter (notebook/tag → a set of note IDs the
   * list is restricted to). `null` = show all. */
  const collectionFilter = ref<CollectionFilter | null>(null);

  // Per-note list previews (Phase 3.3 follow-up): thumbnail + checklist
  // progress, derived from each note's HTML body. Populated lazily and cached
  // by `loadPreview` so the list renders fast and previews trickle in.
  const previews = ref<Record<string, NotePreview>>({});
  /** noteId → "loading" while a preview fetch is in flight (idempotency guard). */
  const pendingPreviews = new Set<string>();

  const count = computed(() => items.value.length);

  /** The list the `NotesList` renders: restricted to the active collection
   * filter (if any), then filtered by `query`, then sorted. */
  const visibleItems = computed<NoteListItem[]>(() => {
    const base = collectionFilter.value
      ? items.value.filter((n) => collectionFilter.value!.noteIds.has(n.id))
      : items.value;
    return sortNotes(filterNotes(base, query.value, { regex: regexSearch.value }), sortKey.value, sortDir.value);
  });

  /** Title for a note id, joined from the items list ("Untitled" fallback). */
  function titleOf(noteId: string): string {
    return items.value.find((n) => n.id === noteId)?.title ?? "Untitled";
  }

  /** Tabs in the active group, joined with titles for the tab bar. */
  const openTabs = computed<EditorTab[]>(() =>
    layout.tabsOf(layout.activeGroupId).map((t) => ({ id: t.id, noteId: t.noteId, title: titleOf(t.noteId) }))
  );

  const activeTabId = computed<string | null>(() => layout.activeTab?.id ?? null);

  const activeTab = computed<EditorTab | null>(() => {
    const t = layout.activeTab;
    return t ? { id: t.id, noteId: t.noteId, title: titleOf(t.noteId) } : null;
  });

  const activeNote = computed(() =>
    items.value.find((n) => n.id === (layout.activeTab?.noteId ?? "")) ?? null
  );

  /** Open (or reuse) a tab for a note in the active group. */
  function openTab(note: Pick<NoteListItem, "id" | "title">): void {
    layout.openNote(note.id);
  }

  /** Close a tab by id (delegates to the layout store).
   *
   *  Torn-off note window (`?window=note&noteId=…`): the window exists only to
   *  host this one note in focus mode, so closing the *last* tab closes the
   *  window too — but only while focus mode is still on. If the user disabled
   *  focus mode the window becomes a regular editing surface and stays open
   *  with an empty editor (the user can open another note). Other tabs
   *  remaining also keeps the window open. */
  function closeTab(tabId: string): void {
    layout.closeTab(tabId);
    if (
      typeof location !== "undefined" &&
      new URLSearchParams(location.search).get("window") === "note" &&
      useShellStore().focusMode &&
      Object.keys(layout.tabs).length === 0
    ) {
      void desktop.window.close.mutate().catch(() => {
        /* main unreachable (e.g. tests) — no-op */
      });
    }
  }

  /**
   * Reorder a tab within the active group's tab list (drag-to-reorder in the
   * tab bar). `toIndex` is the desired final position in the group's tab list
   * after the tab is removed (clamped). Delegates to the layout store.
   */
  function reorderTab(tabId: string, toIndex: number): void {
    layout.reorderTab(layout.activeGroupId, tabId, toIndex);
  }

  /**
   * Reset per-context view state on an account/context switch: close every open
   * tab (their note ids belong to the previous context's DB), drop cached list
   * previews + the sidebar collection filter + the active note's loaded content,
   * and clear the list so the previous context's notes don't flash before the
   * reload. Search/sort/grouping prefs are deliberately kept — they're view
   * preferences, not per-account data. `load()` repopulates `items` + previews
   * for the now-current context.
   */
  function resetView(): void {
    layout.closeAllTabs();
    items.value = [];
    previews.value = {};
    collectionFilter.value = null;
    contentCache.value = {};
    saveState.value = "idle";
    lastSavedAt.value = null;
  }

  /** Open a note by id (the NotesList click handler) in the active group. */
  function selectNote(id: string): void {
    layout.openNote(id);
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

  /** Set the list grouping mode (`none` = flat, `date` = bucketed). */
  function setGroupKey(key: GroupKey): void {
    groupKey.value = key;
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

  /**
   * Restrict the notes list to a sidebar collection. Resolves the member note
   * IDs up-front from `@notesnook/core` (notebooks via `db.notebooks.notes(id)`,
   * tags via `db.relations`) and stores them so `visibleItems` filters by
   * membership without a per-render re-query. `All Notes` clears it via
   * {@link clearCollectionFilter}.
   */
  async function filterByCollection(type: CollectionType, id: string): Promise<void> {
    const db = getDatabase();
    let noteIds: string[];
    if (type === "notebook") {
      noteIds = await db.notebooks.notes(id);
    } else {
      // Tag→note relations are stored `from=tag, to=note` (upstream adds
      // `relations.add({tag}, {note})`), so resolve notes from the tag's
      // **from** side. Querying `.to(tag, "note")` would look for tags on the
      // to side, which never happens → empty. See properties.addTag.
      const tagged = await db.relations.from({ type: "tag", id }, "note").resolve();
      noteIds = tagged.map((n) => n.id);
    }
    collectionFilter.value = { type, id, noteIds: new Set(noteIds) };
  }

  /** Clear the collection filter (back to all notes). */
  function clearCollectionFilter(): void {
    collectionFilter.value = null;
  }

  /** Load all notes from the database into the list. */
  async function load(): Promise<void> {
    const db = getDatabase();
    const all = await db.notes.all.items();
    items.value = all.map(toListItem);
    // Fire-and-forget preview enrichment per note: the list renders
    // immediately from `items`, previews populate as each content fetch
    // resolves. Not awaited so a slow/locked note never blocks the list.
    for (const note of items.value) {
      void loadPreview(note.id);
      // Tags live in `db.relations`, not the deprecated `Note.tags` field
      // (which is empty in practice) — resolve them per note the same way.
      void loadTags(note.id);
    }
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

  /** Resolve a note's tags via `db.relations` and update the list item's
   * `tags`. The `Note.tags` field is `@deprecated` and empty in practice —
   * tags are stored as `tag → note` relations, so they must be queried
   * separately (mirrors `properties.loadAssignments`). Fire-and-forget like
   * {@link loadPreview}: the list renders with empty tags and the chips
   * populate as each relation query resolves. Never throws into the render
   * path. Called from {@link load} (which the properties store triggers after
   * any tag assignment change, so the list stays in sync). */
  async function loadTags(noteId: string): Promise<void> {
    try {
      const db = getDatabase();
      const tagItems = (await db.relations
        .to({ id: noteId, type: "note" }, "tag")
        .resolve()
        .catch(() => [] as Tag[])) as Tag[];
      const titles = tagItems.map((t) => t.title || "Untitled");
      const item = items.value.find((n) => n.id === noteId);
      if (item) item.tags = titles;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[notes] loadTags failed:", e);
    }
  }

  /** Create a new note, reload, and open it in a tab in the active group. */
  async function create(): Promise<void> {
    const db = getDatabase();
    const id = await db.notes.add({ title: "New note" });
    await load();
    pendingTitleFocus.value = true;
    layout.openNote(id);
  }

  /**
   * Lazily create a note from an empty editor pane on first keystroke. Seeds
   * the db with the title + HTML the user already typed, opens the new note as
   * a tab in `groupId` (the drafting pane's group — NOT necessarily the active
   * one), and pre-seeds the content cache with the exact bytes the user typed
   * so the new tab's Editor reads them straight from the cache (no DB round-
   * trip race that could show the pre-await-window text). The draft Editor
   * unmounts and the tab Editor mounts+loads; text is preserved (caret resets
   * to the start — acceptable for a brand-new note). Returns the new note id,
   * or `null` on db failure (the editor keeps its text either way).
   */
  async function createDraft(
    opts: { title: string; content?: string },
    groupId: string
  ): Promise<string | null> {
    const db = getDatabase();
    const addArg: { title: string; content?: { type: "tiptap"; data: string } } = {
      title: opts.title
    };
    if (opts.content) addArg.content = { type: "tiptap", data: opts.content };
    let id: string;
    try {
      id = await db.notes.add(addArg);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[notes] createDraft failed:", e);
      return null;
    }
    await load();
    // Pre-seed the cache so the new tab Editor's loadContent is a cache hit
    // with the user's latest text (races out the DB read).
    contentCache.value = {
      ...contentCache.value,
      [id]: { html: opts.content ?? "", state: "loaded" }
    };
    layout.openTab(groupId, id);
    return id;
  }

  /**
   * Load the HTML body of `noteId` into the per-note content cache. Idempotent:
   * a cached entry that already reached a terminal state (`loaded`/`locked`) is
   * not re-fetched unless `force` is set (e.g. a remote-change reload, or the
   * KeepAlive `onActivated` stale-check). Vault-locked notes surface as
   * `state === "locked"`. The Editor reads the result via {@link getContent}.
   */
  async function loadContent(
    noteId: string,
    opts: { force?: boolean } = {}
  ): Promise<void> {
    if (!noteId) return;
    const existing = contentCache.value[noteId];
    if (existing && !opts.force && (existing.state === "loaded" || existing.state === "locked")) {
      return;
    }
    contentCache.value = {
      ...contentCache.value,
      [noteId]: { html: existing?.html ?? "", state: "loading" }
    };
    try {
      const db = getDatabase();
      const item = await db.content.findByNoteId(noteId);
      if (item && "locked" in item && item.locked) {
        contentCache.value = { ...contentCache.value, [noteId]: { html: "", state: "locked" } };
        return;
      }
      const data = item && typeof item.data === "string" ? item.data : "";
      contentCache.value = { ...contentCache.value, [noteId]: { html: data, state: "loaded" } };
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[notes] loadContent failed:", e);
      contentCache.value = { ...contentCache.value, [noteId]: { html: "", state: "error" } };
    }
  }

  /** Load the HTML body of the focused note (thin wrapper over {@link loadContent}). */
  async function loadActiveContent(): Promise<void> {
    const id = activeNote.value?.id;
    if (id) await loadContent(id);
  }

  /**
   * Handle an `app:note-changed` broadcast from another window: that window
   * saved `noteId`, so refresh our view of it. Always re-fetch the note row and
   * patch the in-memory list item (title/headline/dateEdited/pinned/favorite) +
   * re-derive its list preview, so the main window's list reflects edits made
   * in a torn-off note window. Bump {@link noteChangedSignals} for the changed
   * note (whenever it's in our list) so ANY pane showing it — focused or a
   * background split pane — reloads content from DB (skip-if-dirty, so a
   * receiver mid-edit is never clobbered). `title` is patched only when there's
   * no pending title edit for this note, so an in-progress title rename isn't
   * overwritten. Silently no-ops if the note isn't in our list (not loaded in
   * this context — e.g. a different account's DB).
   */
  async function handleRemoteNoteChanged(noteId: string): Promise<void> {
    const item = items.value.find((n) => n.id === noteId);
    try {
      const db = getDatabase();
      const n = await db.notes.note(noteId);
      if (item && n) {
        item.dateEdited = n.dateEdited;
        item.headline = n.headline ?? item.headline;
        item.pinned = n.pinned;
        item.favorite = n.favorite;
        // Don't clobber an in-progress title edit in this window.
        if (!titlePendingIds.has(noteId)) item.title = n.title || "Untitled";
      }
      // Refresh the list preview (thumbnail/checklist progress) from the new
      // content; `force` bypasses the cache so a stale preview is replaced.
      void loadPreview(noteId, true);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[notes] handleRemoteNoteChanged failed:", e);
      return;
    }
    if (item) {
      noteChangedSignals.value = {
        ...noteChangedSignals.value,
        [noteId]: (noteChangedSignals.value[noteId] ?? 0) + 1
      };
    }
  }

  /**
   * Fire-and-forget cross-window broadcast: tell every OTHER window that
   * `noteId` changed so an editor showing the same note reloads to the latest
   * saved content. Each window owns its own `Database`/eventManager, so a save
   * here is invisible to the others without this relay. Never throws — the
   * tRPC bridge is absent in unit tests, and a failed broadcast must not break
   * the save. The main process excludes this window (the sender) from the
   * broadcast so the actively-edited editor is never disrupted by its own save.
   */
  function broadcastNoteChanged(noteId: string): void {
    try {
      void desktop.window.notifyNoteChanged.mutate({ noteId });
    } catch {
      // No IPC bridge (unit tests) — silently ignore.
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
      // Tell the other windows so an editor showing this note reloads.
      broadcastNoteChanged(note.id);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[notes] saveContent failed:", e);
      saveState.value = "error";
    }
  }

  // --- Title editing (debounced per-note), flushed on switch/deactivate ---
  // The title is a `Note` field separate from content; `db.notes.add` is a
  // Partial upsert, so a title-only write (`{ id, title }`) leaves the stored
  // content untouched. The list item's `title` is patched in memory at once so
  // the tab bar + notes list reflect the edit live; persistence is debounced
  // PER NOTE (Phase 4.2 — a single global slot would let two split panes
  // editing different notes' titles clobber each other's pending flush) and
  // flushed on note switch / deactivate / unmount (the Editor orchestrates the
  // flush, mirroring `flushSave`). `saveContent` also re-writes `note.title`,
  // so a title edit followed by a content edit is persisted by whichever fires.
  const titleTimers: Record<string, ReturnType<typeof setTimeout>> = {};
  const titlePendingIds = new Set<string>();

  function setTitle(noteId: string, title: string): void {
    const note = items.value.find((n) => n.id === noteId);
    if (!note) return;
    note.title = title;
    note.dateEdited = Date.now();
    titlePendingIds.add(noteId);
    if (titleTimers[noteId]) clearTimeout(titleTimers[noteId]);
    titleTimers[noteId] = setTimeout(() => void flushTitle(noteId), 500);
  }

  /** Flush the pending title write for `noteId` (or every pending note when
   *  omitted). Clears its timer + pending flag; persists the in-memory title. */
  async function flushTitle(noteId?: string): Promise<void> {
    const ids = noteId ? [noteId] : [...titlePendingIds];
    for (const id of ids) {
      if (titleTimers[id]) {
        clearTimeout(titleTimers[id]);
        delete titleTimers[id];
      }
      if (!titlePendingIds.has(id)) continue;
      titlePendingIds.delete(id);
      try {
        const db = getDatabase();
        await db.notes.add({ id, title: items.value.find((n) => n.id === id)?.title ?? "" });
        // A title-only edit still changes the note — tell the other windows so
        // their tab title + list headline update.
        broadcastNoteChanged(id);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[notes] flushTitle failed:", e);
      }
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
    contentCache,
    getContent,
    saveState,
    lastSavedAt,
    query,
    regexSearch,
    sortKey,
    sortDir,
    groupKey,
    focusSearchSignal,
    noteChangedSignals,
    noteChangedSignalFor,
    pendingTitleFocus,
    previews,
    collectionFilter,
    openTab,
    closeTab,
    reorderTab,
    resetView,
    selectNote,
    load,
    create,
    createDraft,
    loadPreview,
    loadContent,
    loadActiveContent,
    saveContent,
    handleRemoteNoteChanged,
    setTitle,
    flushTitle,
    filterByCollection,
    clearCollectionFilter,
    setQuery,
    toggleRegex,
    setSortKey,
    setSortDir,
    toggleSortDir,
    setGroupKey,
    clearSearch,
    focusSearch
  };
});