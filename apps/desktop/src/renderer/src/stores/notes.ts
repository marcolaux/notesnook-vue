import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { Color, Note, Tag } from "@notesnook-vue/contracts";
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
import { toColorListItem, type ColorListItem } from "@/utils/colors";
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
  /** The note's assigned color (loaded via `db.relations.to(note,"color")`),
   *  or `null` when none. Drives the list-row tint. `null` (not `undefined`)
   *  once `loadColor` has resolved; `undefined` before the first load. */
  color?: ColorListItem | null;
}

/**
 * A tab as the editor tab-bar renders it: the layout store owns the tab's
 * identity + history; `title` is joined from the notes list here. This is a
 * *view* shape — no tab state is owned by the notes store (Phase 4.1
 * migration: tabs live in the editor-layout store).
 */
export interface EditorTab {
  id: string;
  /** `kind === "attachment"` tabs carry a filename (in `title`) and no noteId. */
  kind: "note" | "attachment";
  noteId?: string;
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

  /** One-shot focus request for the title input of a freshly created note.
   *  Because the `Editor` remounts per note id, `onMounted`/the `titleInputEl`
   *  watch reads this to decide how to focus the new title input (cleared on
   *  consumption):
   *  - `"select"` — focus + select-all (the New-note button seeds a placeholder
   *    "New note" the user will type over).
   *  - `"end"` — focus + caret at end (`createDraft` preserves the title the
   *    user is mid-typing; selecting it would let the next keystroke replace
   *    the just-typed letter). */
  const pendingTitleFocus = ref<"select" | "end" | null>(null);

  /** One-shot flag set by `createDraft({focus:"body"})`: the draft was promoted
   *  by a BODY keystroke (not a title keystroke), so after the tab Editor
   *  remounts + loads its seeded content the caret must land at the end of the
   *  body (NOT the title input — the user was typing in the body). Consumed in
   *  `Editor.vue`'s `loadCurrentNote` after `setContent`. */
  const pendingBodyFocus = ref(false);

  /** Active sidebar-collection filter (notebook/tag → a set of note IDs the
   * list is restricted to). `null` = show all. */
  const collectionFilter = ref<CollectionFilter | null>(null);

  // Per-note list previews (Phase 3.3 follow-up): thumbnail + checklist
  // progress, derived from each note's HTML body. Populated lazily and cached
  // by `loadPreview` so the list renders fast and previews trickle in.
  const previews = ref<Record<string, NotePreview>>({});
  /** noteId → "loading" while a preview fetch is in flight (idempotency guard). */
  const pendingPreviews = new Set<string>();

  // --- Multi-selection (file-manager semantics) ---------------------------
  // Separate from `activeNote` (the note open in the focused editor tab): the
  // selection is the set of rows the user has cmd/shift-clicked and that bulk
  // context-menu actions operate on. Plain click collapses it to the clicked
  // note AND opens it; modifier clicks build the set without opening. The set
  // persists across filter/search changes (ids no longer in `items` are pruned
  // by {@link pruneSelection} on {@link load}).
  const selectedNoteIds = ref<Set<string>>(new Set());
  /** The anchor note for a shift-click range-select (the last plain/cmd-clicked
   *  row). `null` until the first selection action. */
  const anchorId = ref<string | null>(null);

  const selectedCount = computed(() => selectedNoteIds.value.size);
  /** Is `id` part of the multi-selection? */
  function isSelected(id: string): boolean {
    return selectedNoteIds.value.has(id);
  }

  /** Drop selected ids that are no longer in `items` (e.g. trashed, moved out,
   *  or switched to a context that doesn't contain them). Called after {@link
   *  load} and after bulk trashing. */
  function pruneSelection(): void {
    if (selectedNoteIds.value.size === 0) return;
    const live = new Set(items.value.map((n) => n.id));
    const next = new Set<string>();
    for (const id of selectedNoteIds.value) if (live.has(id)) next.add(id);
    if (next.size !== selectedNoteIds.value.size) selectedNoteIds.value = next;
    if (anchorId.value && !live.has(anchorId.value)) anchorId.value = null;
  }

  /** Replace the selection with the given ids (no editor effect). Used by the
   *  right-click handler to collapse a multi-selection to the clicked row. */
  function setSelection(ids: string[]): void {
    selectedNoteIds.value = new Set(ids);
    anchorId.value = ids.length > 0 ? (ids[ids.length - 1] ?? null) : null;
  }

  /** Clear the multi-selection entirely. */
  function clearSelection(): void {
    selectedNoteIds.value = new Set();
    anchorId.value = null;
  }

  const count = computed(() => items.value.length);

  /** Favourite notes surfaced as sidebar shortcut rows — the notes with
   *  `favorite === true`, slimmed to `{id, title, type:"note"}`, ordered by
   *  `dateEdited` descending (most-recently-edited first). Reactive over
   *  `items`, so a `properties.toggle("favorite")` → `load()` reassigns `items`
   *  and the sidebar Shortcuts section re-renders with no extra wiring. These
   *  are NOT `db.shortcuts` items (upstream disallows notes); they're merged
   *  with notebook/tag shortcuts at the view layer (Sidebar.vue). */
  const favorites = computed(() =>
    items.value
      .filter((n) => n.favorite)
      .sort((a, b) => b.dateEdited - a.dateEdited)
      .map((n) => ({ id: n.id, title: n.title, type: "note" as const }))
  );

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

  /** Tabs in the active group, joined with titles for the tab bar. Attachment
   *  tabs use their filename as the title (no note lookup). */
  const openTabs = computed<EditorTab[]>(() =>
    layout.tabsOf(layout.activeGroupId).map((t) => ({
      id: t.id,
      kind: t.kind,
      ...(t.noteId !== undefined ? { noteId: t.noteId } : {}),
      title:
        t.kind === "attachment"
          ? (t.attachment?.filename ?? "Attachment")
          : titleOf(t.noteId ?? "")
    }))
  );

  const activeTabId = computed<string | null>(() => layout.activeTab?.id ?? null);

  const activeTab = computed<EditorTab | null>(() => {
    const t = layout.activeTab;
    if (!t) return null;
    return {
      id: t.id,
      kind: t.kind,
      ...(t.noteId !== undefined ? { noteId: t.noteId } : {}),
      title:
        t.kind === "attachment"
          ? (t.attachment?.filename ?? "Attachment")
          : titleOf(t.noteId ?? "")
    };
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
    // Capture the closing tab's note BEFORE close so we can prune it from the
    // list selection. Plain-clicking a note calls `selectOnly` (adds it to
    // `selectedNoteIds` AND opens it); while open the row shows the active
    // highlight, hiding the latent selection. If we don't prune it here, the
    // closed note stays "selected" yet is no longer the active note → its row
    // flips to the multi-selection checkmark/green style as if it had been
    // cmd/shift-clicked. Only the closed note is dropped — any other notes the
    // user explicitly multi-selected are preserved. The newly-activated
    // neighbour is already marked by the `activeNote` highlight, so no
    // `selectOnly` follow is needed.
    const closedNoteId = layout.tabs[tabId]?.noteId;
    layout.closeTab(tabId);
    if (closedNoteId && selectedNoteIds.value.has(closedNoteId)) {
      const next = new Set(selectedNoteIds.value);
      next.delete(closedNoteId);
      selectedNoteIds.value = next;
      if (anchorId.value === closedNoteId) anchorId.value = null;
    }
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

  /** Collapse the selection to a single note AND open it in the active group.
   *  The plain-click path: opens the note + establishes a one-element
   *  selection, so the right-clicked-row menu and bulk actions behave the same
   *  whether the user plain-clicked or cmd/shift-built a set. */
  function selectOnly(id: string): void {
    selectedNoteIds.value = new Set([id]);
    anchorId.value = id;
    layout.openNote(id);
  }

  /** Toggle a note's membership in the multi-selection WITHOUT opening it
   *  (cmd/ctrl-click). The anchor moves to the toggled note so a subsequent
   *  shift-click ranges from it. */
  function toggleSelection(id: string): void {
    const next = new Set(selectedNoteIds.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedNoteIds.value = next;
    anchorId.value = id;
  }

  /** Range-select from the {@link anchorId} to `id` (inclusive) in
   *  `visibleItems` order, WITHOUT opening (shift-click). If the anchor is not
   *  in the visible list (cleared by a filter change), the range falls back to
   *  just `id`. The anchor is NOT moved, so repeated shift-clicks all range
   *  from the same anchor. */
  function extendSelection(id: string): void {
    const ordered = visibleItems.value.map((n) => n.id);
    const anchor = anchorId.value;
    const ai = anchor ? ordered.indexOf(anchor) : -1;
    const bi = ordered.indexOf(id);
    if (ai === -1 || bi === -1) {
      selectedNoteIds.value = new Set([id]);
      return;
    }
    const [from, to] = ai <= bi ? [ai, bi] : [bi, ai];
    selectedNoteIds.value = new Set(ordered.slice(from, to + 1));
  }

  /** Open a note by id (the NotesList plain-click handler) in the active group
   *  and collapse the selection to it. Kept as the public entry point so
   *  existing consumers (`App.vue`, `Sidebar.vue`) that call `selectNote` also
   *  establish a one-element selection. */
  function selectNote(id: string): void {
    selectOnly(id);
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
    } else if (type === "color") {
      // Color→note relations are stored `from=color, to=note` (same direction
      // as tag→note — see properties.setColor). Resolve the color's notes from
      // its `from` side.
      const colored = await db.relations.from({ type: "color", id }, "note").resolve();
      noteIds = colored.map((n) => n.id);
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
    pruneSelection();
    // Per-note enrichment (preview + tags + color) is fire-and-forget and
    // progressive: the list renders from `items` alone — `previewOf`/tags/
    // color are guarded in the template — so it must NOT run on the boot
    // critical path. SQLite is a single serialized connection (mutex FIFO) and
    // each query crosses a renderer→main IPC round-trip. Firing 3 queries × N
    // notes in one burst saturates the mutex (interactive queries — open note,
    // switch collection — queue behind it, so the app feels unresponsive) and
    // the N `DOMParser` runs in `loadPreview` jank the main thread.
    //
    // So the fan-out is (1) deferred off the boot critical path, (2) **phased**
    // — cheap color+tags (the visible tint + tag chips, single relation query
    // each, no parse) run for ALL notes before the heavy preview (a content
    // fetch + DOMParser parse) — and (3) **chunked** across idle frames so the
    // mutex never saturates: interactive queries interleave between chunks and
    // tints appear quickly during the cheap phase before any heavy work runs.
    // `requestIdleCallback` paces each chunk in the renderer; synchronous fallback
    // when it's unavailable (node test envs) preserves the prior run-everything
    // behaviour and avoids leaking timers across tests. See plan
    // melodic-hopping-rainbow.
    const ids = items.value.map((n) => n.id);
    const CHUNK = 12;
    const schedule = (fn: () => void): void => {
      if (typeof requestIdleCallback === "function") requestIdleCallback(() => fn());
      else fn();
    };
    const runChunked = (tasks: Array<() => void>, done: () => void): void => {
      let i = 0;
      const step = (): void => {
        // `slice` + for-of yields defined elements (no `noUncheckedIndexedAccess`
        // hazard, unlike indexing `tasks[i]`).
        const batch = tasks.slice(i, i + CHUNK);
        for (const task of batch) task();
        i += batch.length;
        if (i < tasks.length) schedule(step);
        else done();
      };
      schedule(step);
    };
    // Phase 1 — cheap: tint + tag chips for every note (color first so the tint
    //  lands before the tag query).
    const colorTags = ids.map((id) => () => {
      void loadColor(id);
      void loadTags(id);
    });
    // Phase 2 — heavy: content fetch + HTML parse for the thumbnail/checklist.
    const previews = ids.map((id) => () => {
      void loadPreview(id);
    });
    runChunked(colorTags, () => runChunked(previews, () => {}));
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

  /** Resolve a note's single assigned color via
   *  `db.relations.to(note,"color").resolve()` (color→note; `Note.color` is
   *  @deprecated) + patch the in-memory item's `color` so the list row tints.
   *  Fire-and-forget like {@link loadTags}; never throws. */
  async function loadColor(noteId: string): Promise<void> {
    try {
      const db = getDatabase();
      const colorItems = (await db.relations
        .to({ id: noteId, type: "note" }, "color")
        .resolve()
        .catch(() => [] as Color[])) as Color[];
      const item = items.value.find((n) => n.id === noteId);
      if (item) item.color = colorItems[0] ? toColorListItem(colorItems[0]) : null;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[notes] loadColor failed:", e);
    }
  }

  /** Create a new note, reload, and open it in a tab in the active group. */
  async function create(): Promise<void> {
    const db = getDatabase();
    const id = await db.notes.add({ title: "New note" });
    await load();
    pendingTitleFocus.value = "select";
    layout.openNote(id);
  }

  /**
   * Lazily create a note from an empty editor pane on first keystroke. Seeds
   * the db with the title + HTML captured at call time, opens the new note as a
   * tab in `groupId` (the drafting pane's group — NOT necessarily the active
   * one), and pre-seeds the content cache so the new tab's Editor reads the
   * text straight from the cache (no DB round-trip race). The draft Editor
   * unmounts and the tab Editor mounts+loads. Returns the new note id, or
   * `null` on db failure (the editor keeps its text either way).
   *
   * `getLatestContent` re-captures the draft editor's HTML RIGHT BEFORE
   * `layout.openTab` (the remount trigger). This is essential: `db.notes.add`
   * + `load()` are awaited, and the user may keep typing through that window —
   * those characters live ONLY in the still-alive draft editor (the snapshot in
   * `opts.content` was taken before the await and is already stale). Re-seeding
   * the cache from the live editor at the last possible moment — before the
   * remount unmounts it — is what preserves the full typed text. (Title typed
   * during the window is reconciled separately by the caller via `setTitle`.)
   *
   * `focus` controls where the caret lands after the remount, mirroring where
   * the user was typing: `"title"` (default — a title keystroke) requests
   * caret-at-end title focus; `"body"` (a body keystroke) requests caret-at-end
   * body focus so the user keeps typing in the body instead of being yanked to
   * the title. The flag is set BEFORE `layout.openTab` (the remount trigger) so
   * the new instance's focus watches see it.
   */
  async function createDraft(
    opts: { title: string; content?: string },
    groupId: string,
    focus: "title" | "body" = "title",
    getLatestContent?: () => string
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
    // Re-capture the draft editor's CURRENT html right before the remount. The
    // editor is still alive here (openTab hasn't run), so this includes any text
    // typed during the db.add/load await window — without it, the new tab's
    // Editor would load the pre-await snapshot from `opts.content` and the text
    // typed during the window would vanish when the draft editor unmounts. Seed
    // the cache from this so the new tab's loadContent is a cache hit with the
    // FULL text (the DB still holds the pre-await snapshot; the latest persists
    // on the next autosave / deactivate-flush like any other edit).
    const latestHtml = getLatestContent?.() ?? opts.content ?? "";
    contentCache.value = {
      ...contentCache.value,
      [id]: { html: latestHtml, state: "loaded" }
    };
    // The draft Editor (keyed "draft:"+groupId) unmounts and the tab Editor
    // (keyed by tab id) mounts — different elements, so DOM focus is lost on
    // the transition. Re-establish focus matching where the user was typing:
    //  - "title" → caret-at-end title input (NOT select-all: the user is mid-
    //    typing and select-all would let the next keystroke clobber the just-
    //    typed letter).
    //  - "body" → caret at the end of the body so a body keystroke keeps
    //    typing in the body instead of jumping to the title.
    if (focus === "body") pendingBodyFocus.value = true;
    else pendingTitleFocus.value = "end";
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
      // TEMP-DIAG sync-pull: does the local DB hold the synced note metadata +
      // content, or is it stale? Logs the note's contentId/dateEdited and the
      // content item actually served, on every load (incl. force reloads).
      try {
        const n = await db.notes.note(noteId);
        // TEMP-DIAG sync-pull: note sync-state — is our local copy dirty /
        // conflicted / not-yet-synced (which would block pulling the server's
        // newer version)? dateModified ~now => we touched it locally; synced
        // false => unsynced local edit; conflicted true => conflict.
        // eslint-disable-next-line no-console
        console.log(
          "[sync] loadContent meta:",
          noteId,
          "contentId:", n?.contentId,
          "dateEdited:", n?.dateEdited,
          "dateModified:", n?.dateModified,
          "synced:", n?.synced,
          "conflicted:", n?.conflicted,
          "localOnly:", n?.localOnly,
          "remote:", n?.remote,
          "deleted:", n?.deleted,
          "force:", !!opts.force
        );
      } catch { /* diag ignore */ }
      const item = await db.content.findByNoteId(noteId);
      if (item && "locked" in item && item.locked) {
        contentCache.value = { ...contentCache.value, [noteId]: { html: "", state: "locked" } };
        return;
      }
      const data = item && typeof item.data === "string" ? item.data : "";
      // eslint-disable-next-line no-console
      console.log(
        "[sync] content served:",
        "itemId:", item?.id,
        "len:", data.length,
        "preview:", JSON.stringify(data.slice(0, 100))
      );
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
   * Queue server downloads of `noteId`'s image/webclip attachments so their
   * encrypted blobs land locally and the editor's image node-views can lazy-
   * load them. Fire-and-forget — core's `db.attachments.downloadMedia` queues
   * chunked downloads (deduping blobs already present) and fires
   * `EVENTS.mediaAttachmentDownloaded` per completed hash, which the
   * `ImageComponent` subscribes to (via `wireAttachmentStorage`) to swap out
   * of the placeholder. This is the receive-side counterpart to the
   * `FileStorage` upload/download transfers: without it, a freshly-synced note
   * shows its images as placeholders because the blobs are never fetched.
   * Never throws — a failed queue (no token / offline) just leaves the
   * placeholders, matching the pre-sync behaviour.
   */
  function downloadMedia(noteId: string): void {
    if (!noteId) return;
    try {
      const db = getDatabase();
      void db.attachments.downloadMedia(noteId).catch((e) => {
        // eslint-disable-next-line no-console
        console.warn("[notes] downloadMedia failed:", e);
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[notes] downloadMedia failed:", e);
    }
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
        readonly: false,
        // A fresh `sessionId` per save makes core (`content.add` →
        // `noteHistory.add`, gated on `content.sessionId`) write one history
        // entry per autosave — keyed `${noteId}_${sessionId}`, so each save is
        // a distinct version. Without this, no history entry is created at all.
        sessionId: crypto.randomUUID()
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
      // TEMP DIAG: confirm the note↔attachment relation was created by core's
      // `content.postProcess` → `processLinkedAttachments`. Without this
      // relation, other devices' `db.attachments.downloadMedia(noteId)` →
      // `ofNote(noteId)` finds no attachments and never downloads our blobs
      // (placeholders there), even though our app shows them from local cache.
      // Remove once cross-app image sync is verified on-site.
      void (async () => {
        try {
          const linked = await db.relations
            .from({ type: "note", id: note.id }, "attachment")
            .selector.fields(["attachments.hash", "attachments.dateUploaded"])
            .items();
          // eslint-disable-next-line no-console
          console.log(
            `[notes] saveContent diag: note ${note.id} linked attachments=${linked.length}`,
            linked.map((a: { hash: string; dateUploaded?: number }) => ({
              hash: a.hash,
              uploaded: !!a.dateUploaded
            }))
          );
        } catch {
          // ignore diag failure
        }
      })();
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

  /** Move a note to trash via `db.notes.moveToTrash(id)`, close any editor tab
   *  hosting it, then reload the list. Never throws — returns `true` on
   *  success. The caller is responsible for refreshing the sidebar's trash
   *  count (`collections.load()`), which lives in a separate store. */
  async function moveToTrash(noteId: string): Promise<boolean> {
    if (!noteId) return false;
    try {
      const db = getDatabase();
      await db.notes.moveToTrash(noteId);
      // Close any open tab whose note is the one just trashed (the layout
      // store keys tabs by tab id, so look them up by noteId).
      for (const tab of Object.values(layout.tabs)) {
        if (tab.noteId === noteId) layout.closeTab(tab.id);
      }
      await load();
      return true;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[notes] moveToTrash failed:", e);
      return false;
    }
  }

  /** Move a batch of notes to trash via the variadic `db.notes.moveToTrash(
   *  ...ids)` (one SQL call for all), close every open tab hosting any of them,
   *  clear the multi-selection, and reload the list. Mirrors {@link moveToTrash}
   *  for the per-note close + reload, but in a single db round-trip. The caller
   *  refreshes the sidebar's trash count (`collections.load()`). Never throws. */
  async function moveToTrashMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      const db = getDatabase();
      await db.notes.moveToTrash(...ids);
      for (const tab of Object.values(layout.tabs)) {
        if (tab.noteId && ids.includes(tab.noteId)) layout.closeTab(tab.id);
      }
      clearSelection();
      await load();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[notes] moveToTrashMany failed:", e);
    }
  }

  /** Duplicate a batch of notes via the variadic `db.notes.duplicate(...ids)`
   *  (core re-links each note's relations internally; new ids aren't reliably
   *  returned), then reload the list so the copies appear. Does not auto-open
   *  the duplicates and leaves the selection intact. Never throws. */
  async function duplicateMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      const db = getDatabase();
      await db.notes.duplicate(...ids);
      await load();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[notes] duplicateMany failed:", e);
    }
  }

  /** Archive a note via `db.notes.archive(true, id)`, then reload the list (the
   *  note drops out of All Notes because `db.notes.all` excludes archived
   *  notes). Editor tabs hosting the note are **not** closed — archived notes
   *  remain openable/editable (`db.notes.note(id)` is a direct lookup). Never
   *  throws — returns `true` on success. The caller is responsible for
   *  refreshing the sidebar's archive count (`collections.reloadArchiveCount()`),
   *  which lives in a separate store. */
  async function archive(noteId: string): Promise<boolean> {
    if (!noteId) return false;
    try {
      const db = getDatabase();
      await db.notes.archive(true, noteId);
      await load();
      return true;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[notes] archive failed:", e);
      return false;
    }
  }

  /** Archive a batch of notes via the variadic `db.notes.archive(true, ...ids)`
   *  (one SQL call for all), clear the multi-selection, and reload the list.
   *  Mirrors {@link archive} (no tab closing). The caller refreshes the sidebar's
   *  archive count (`collections.reloadArchiveCount()`). Never throws. */
  async function archiveMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      const db = getDatabase();
      await db.notes.archive(true, ...ids);
      clearSelection();
      await load();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[notes] archiveMany failed:", e);
    }
  }

  /** Unarchive a note via `db.notes.archive(false, id)`, then reload the list so
   *  it reappears in All Notes. Never throws — returns `true` on success. The
   *  caller refreshes the sidebar's archive count. */
  async function unarchive(noteId: string): Promise<boolean> {
    if (!noteId) return false;
    try {
      const db = getDatabase();
      await db.notes.archive(false, noteId);
      await load();
      return true;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[notes] unarchive failed:", e);
      return false;
    }
  }

  /** Unarchive a batch of notes via `db.notes.archive(false, ...ids)`, clear the
   *  multi-selection, and reload the list. The caller refreshes the sidebar's
   *  archive count. Never throws. */
  async function unarchiveMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      const db = getDatabase();
      await db.notes.archive(false, ...ids);
      clearSelection();
      await load();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[notes] unarchiveMany failed:", e);
    }
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
    favorites,
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
    pendingBodyFocus,
    previews,
    collectionFilter,
    openTab,
    closeTab,
    reorderTab,
    resetView,
    selectNote,
    selectOnly,
    toggleSelection,
    extendSelection,
    setSelection,
    clearSelection,
    pruneSelection,
    isSelected,
    selectedNoteIds,
    selectedCount,
    anchorId,
    load,
    create,
    createDraft,
    loadPreview,
    loadContent,
    loadActiveContent,
    downloadMedia,
    saveContent,
    handleRemoteNoteChanged,
    setTitle,
    flushTitle,
    moveToTrash,
    moveToTrashMany,
    duplicateMany,
    archive,
    archiveMany,
    unarchive,
    unarchiveMany,
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