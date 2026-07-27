/**
 * Omnibar store — the unified title-bar picker. Subsumes the former
 * `useSearchStore` (FTS5/BM25 note search) and `useCommandPaletteStore` (command
 * palette) into ONE headless surface with VS-Code-style prefix modes:
 *
 *   (no prefix) notes     — FTS5/BM25 via `db.lookup.notesWithHighlighting`,
 *                            pick → open the note tab scrolled to the match.
 *   `>`          commands  — registry commands (`when`-filtered + subsequence).
 *   `#`          tags      — `collections.sortedTags`, pick → `goToCollection`.
 *   `@`          notebooks  — `collections.sortedNotebooks`, pick → `goToCollection`
 *                            (sub-notebooks included via `db.notebooks.notes`).
 *   `:`          tabs      — open `layout.tabs` + recent `notes.visibleItems`;
 *                            pick tab → `layout.activateTab`, recent → open note.
 *
 * The prefix is part of the query text (VS Code model): typing `>` enters command
 * mode, deleting it leaves. `#` matches notesnook's own `#tag` editor sigil; the
 * FTS query syntax is `field:value` (field tokens start with letters) so none of
 * the prefixes collide at the first character.
 *
 * State shape mirrors the two stores it replaces: a headless core the title-bar
 * `GlobalSearchInput` + `OmnibarDropdown` bind to (no component-local picker
 * state). `SearchResultsPane` (the `kind:"search"` tab) reuses
 * `resultsCache`/`loadResults`/`openNoteAt` — those signatures are load-bearing and
 * preserved exactly.
 *
 * Sentinel: `activeIndex === -1` is legal ONLY in notes mode (bare Enter opens the
 * Search Results tab). Every other mode clamps to `[0, n-1]`.
 */
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { cycleIndex, filterByKey } from "@notesnook-vue/editor-vue";
import { getDatabase } from "@/platform/bootstrap";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import { useEditorStore } from "@/stores/editor";
import { useNotesStore } from "@/stores/notes";
import { usePublishStore } from "@/stores/publish";
import { useCollectionsStore } from "@/stores/collections";
import { useTemplatesStore } from "@/stores/templates";
import { useAuthStore } from "@/stores/auth";
import { useShellStore } from "@/stores/shell";
import { useSyncStore } from "@/stores/sync";
import { useUpdaterStore } from "@/stores/updater";
import { useSpellCheckerStore } from "@/stores/spell-checker";
import { goToCollection } from "@/utils/collection-nav";
import { matchesToHtml, snippetHtml, type HighlightedResult } from "@contracts/search";
import {
  getCommands,
  getCommandRouter,
  type Command,
  type CommandContext
} from "@/commands/registry";
import { searchVectorEmbeddings } from "@/utils/vector-search";
import { readSemanticSearchEnabled } from "@/stores/settings";
import { logger } from "@/utils/logger";
import i18n from "@/i18n";

export type OmnibarMode = "notes" | "commands" | "tags" | "notebooks" | "tabs";

/** A single renderable + pickable row in the dropdown, uniform across modes. */
export interface OmnibarItem {
  /** Stable v-for key + active-row match. */
  key: string;
  /** The mode that produced this row (drives pick dispatch + row template). */
  mode: OmnibarMode;
  /** Plain-text label (non-notes rows; notes use `titleHtml` for rendering). */
  label: string;
  /** Notes mode: pre-rendered escaped title HTML (`matchesToHtml`). */
  titleHtml?: string;
  /** Notes mode: pre-rendered escaped snippet HTML (`snippetHtml`). */
  snippetHtml?: string;
  /** Secondary text: command group / collection note count / tab kind. */
  group?: string;
  /** Pick payload — the id to act on (note / tag / notebook / tab). */
  refId?: string;
  /** Tabs mode only: which pick action to run. */
  tabPick?: "tab" | "recent";
}

/** Max results fetched for the dropdown / results tab (VirtualizedGrouping
 *  batches in chunks of 20, so ~3 batched async fetches). */
const MAX_RESULTS = 50;
/** Debounce before hitting the DB (FTS + BM25 over body content). Notes mode only. */
const DEBOUNCE_MS = 180;
/** Bounded LRU of per-query result caches so the Search Results tab doesn't
 *  re-query when re-opened for a recently-searched term. Notes mode only. */
const CACHE_MAX = 8;
/** How many recent notes to surface in the `:` (tabs) mode after the open tabs. */
const MAX_RECENT = 10;

/** The leading character that selects a mode, or `null` for notes (no prefix). */
function prefixChar(s: string): string | null {
  const i = s.search(/\S/);
  if (i === -1) return null;
  return s[i] ?? null;
}

const PREFIX_TO_MODE: Record<string, OmnibarMode> = {
  ">": "commands",
  "#": "tags",
  "@": "notebooks",
  ":": "tabs"
};

/** Parse a raw input string into (mode, text-after-prefix). The text-after is
 *  what the mode's list filters by (and what notes-mode FTS searches). */
function parsePrefix(raw: string): { mode: OmnibarMode; text: string } {
  const ch = prefixChar(raw);
  if (ch && PREFIX_TO_MODE[ch]) {
    const idx = raw.indexOf(ch);
    return { mode: PREFIX_TO_MODE[ch], text: raw.slice(idx + 1) };
  }
  return { mode: "notes", text: raw };
}

export const useOmnibarStore = defineStore("omnibar", () => {
  const t = i18n.global.t.bind(i18n.global);
  const layout = useEditorLayoutStore();
  const editorStore = useEditorStore();
  const notes = useNotesStore();
  const collections = useCollectionsStore();
  // Referenced in `visibleCommands` so the command list re-evaluates when the
  // dynamically-synced template commands change (the registry itself is a
  // plain non-reactive Map, so without this dep newly-registered per-template
  // commands could be served stale between palette opens).
  const templates = useTemplatesStore();
  const auth = useAuthStore();
  const shell = useShellStore();
  const sync = useSyncStore();
  const updater = useUpdaterStore();
  const spellChecker = useSpellCheckerStore();
  const publish = usePublishStore();

  // --- core picker state ----------------------------------------------------
  const mode = ref<OmnibarMode>("notes");
  /** The full input text including any prefix char (the input binds to this). */
  const query = ref("");
  /** The query with the mode prefix stripped — what the lists filter by. */
  const effectiveQuery = ref("");
  const open = ref(false);
  /** Keyboard-nav cursor. `-1` (no row selected) is legal only in notes mode. */
  const activeIndex = ref(-1);
  /** Bumped by `focus()`/`openNotes()`/`openCommands()`; the input watches it. */
  const focusSignal = ref(0);

  // --- notes-mode state (lifted verbatim from the former search store) -------
  const loading = ref(false);
  const results = ref<HighlightedResult[]>([]);
  /** The trimmed query that produced `results` — stale guard + scroll target. */
  const lastQuery = ref("");
  /** Per-query result cache (bounded LRU via `cacheOrder`). The Search Results
   *  tab reads from here so re-opening a results tab is instant. */
  const resultsCache = ref<Record<string, HighlightedResult[]>>({});
  const cacheOrder = ref<string[]>([]);

  let timer: ReturnType<typeof setTimeout> | undefined;

  // --- commands-mode (lifted from the former command-palette store) ---------
  const ctx = computed<CommandContext>(() => ({
    editor: editorStore.editor,
    notes,
    auth,
    shell,
    sync,
    updater,
    spellChecker,
    layout,
    editorStore,
    publish,
    omnibar: { openNotes, openCommands, focus },
    router: getCommandRouter(),
    closePalette: close
  }));

  /** All commands whose `when` predicate currently passes. Reading
   *  `templates.templates` here ties the (non-reactive) registry to the
   *  templates list so the dynamic per-template commands refresh when
   *  templates are added/removed/renamed. */
  const visibleCommands = computed<Command[]>(() => {
    const c = ctx.value;
    // Touch the templates array length to track it as a dependency.
    void templates.templates.length;
    return getCommands().filter((cmd) => !cmd.when || cmd.when(c));
  });

  // --- per-mode filtered lists ----------------------------------------------
  /** Notes-mode rows (raw FTS results). */
  const noteResults = computed<HighlightedResult[]>(() => results.value);
  /** Commands-mode rows (raw commands, for `execute` to look up by index).
   *  Filtering matches against the *resolved* title (`t(cmd.title)` for key
   *  strings) + the English-literal `keywords`, so multi-word queries like
   *  "new note" still subsequence-match the localised label, not the key. */
  const commandItems = computed<Command[]>(() =>
    filterByKey(visibleCommands.value, effectiveQuery.value, (c) => [
      i18n.global.te(c.title) ? t(c.title) : c.title,
      ...(c.keywords ?? [])
    ])
  );
  /** Tags-mode rows. */
  const tagItems = computed(() =>
    filterByKey(collections.sortedTags, effectiveQuery.value, (t) => [t.title])
  );
  /** Notebooks-mode rows (flat, incl. sub-notebooks). */
  const notebookItems = computed(() =>
    filterByKey(collections.sortedNotebooks, effectiveQuery.value, (n) => [n.title])
  );

  /** Tabs-mode rows: open tabs (all groups) first, then recent notes. Each
   *  carries a `tabPick` so `pick` knows whether to activate a tab or open a note.
   *  Titles are joined the same way the tab bar joins them (notes via
   *  `notes.titleOf`, attachments via filename, search via "Search: <q>"). */
  const tabViewItems = computed<OmnibarItem[]>(() => {
    const tabs = Object.values(layout.tabs) as {
      id: string;
      kind: "note" | "attachment" | "search";
      noteId?: string;
      attachment?: { filename?: string };
      searchQuery?: string;
    }[];
    const tabRows: OmnibarItem[] = tabs.map((tab) => {
      const title =
        tab.kind === "attachment"
          ? (tab.attachment?.filename ?? t("omnibar.groupAttachment"))
          : tab.kind === "search"
            ? t("tabs.searchTitle", { query: tab.searchQuery ?? "" })
            : notes.titleOf(tab.noteId ?? "");
      return {
        key: "tab:" + tab.id,
        mode: "tabs",
        label: title,
        group: tab.kind === "note" ? t("omnibar.groupTab") : tab.kind === "search" ? t("omnibar.groupSearchTab") : t("omnibar.groupAttachment"),
        refId: tab.id,
        tabPick: "tab"
      };
    });
    const recent: OmnibarItem[] = notes.visibleItems
      .slice(0, MAX_RECENT)
      .map((n) => ({
        key: "recent:" + n.id,
        mode: "tabs",
        label: n.title || t("common.untitled"),
        group: t("omnibar.groupRecent"),
        refId: n.id,
        tabPick: "recent"
      }));
    return [...tabRows, ...recent];
  });

  /** The current mode's renderable rows (drives the dropdown + nav length). */
  const items = computed<OmnibarItem[]>(() => {
    switch (mode.value) {
      case "notes":
        return noteResults.value.map((r) => ({
          key: r.id,
          mode: "notes" as const,
          label: r.title.length ? matchesToHtml(r.title) : t("common.untitled"),
          titleHtml: r.title.length ? matchesToHtml(r.title) : t("common.untitled"),
          snippetHtml: snippetHtml(r),
          refId: r.id
        }));
      case "commands":
        return commandItems.value.map((cmd) => ({
          key: cmd.id,
          mode: "commands" as const,
          // `cmd.title` is an i18n key string (e.g. "command.newNote") for the
          // static app/editor commands; resolve it so palette labels localise +
          // react to locale switch. Dynamic / interpolated titles (the per-
          // template "New note from <title>" + "Go to <view>" snapshots) are
          // already-resolved plain strings → `te` returns false → passthrough.
          label: i18n.global.te(cmd.title) ? t(cmd.title) : cmd.title,
          group: cmd.group
        }));
      case "tags":
        return tagItems.value.map((t) => ({
          key: t.id,
          mode: "tags" as const,
          label: t.title,
          refId: t.id
        }));
      case "notebooks":
        return notebookItems.value.map((n) => ({
          key: n.id,
          mode: "notebooks" as const,
          label: n.title,
          refId: n.id
        }));
      case "tabs":
        return tabViewItems.value;
    }
  });

  /** Length of the active mode's list (sentinel-aware nav + clamp source). */
  const currentListLength = computed(() => items.value.length);

  // --- notes-mode FTS (lifted from the former search store) -----------------
  function bumpCache(q: string, items: HighlightedResult[]): void {
    const next = { ...resultsCache.value, [q]: items };
    const order = cacheOrder.value.filter((c) => c !== q);
    order.push(q);
    while (order.length > CACHE_MAX) {
      const evict = order.shift()!;
      delete next[evict];
    }
    resultsCache.value = next;
    cacheOrder.value = order;
  }

  async function fetchResults(q: string): Promise<HighlightedResult[]> {
    if (!q) return [];
    const db = getDatabase();
    
    // 1. Lexical FTS5 search
    const vg = await db.lookup.notesWithHighlighting(q, db.notes.all, {
      sortBy: "relevance",
      sortDirection: "desc"
    });
    const count = Math.min(vg.length, MAX_RESULTS);
    const ftsResults: HighlightedResult[] = [];
    for (let i = 0; i < count; i++) {
      const got = await vg.item(i);
      if (got.item) ftsResults.push(got.item);
    }

    // 2. Fall back to pure Lexical FTS5 if Semantic Search is disabled or query fails
    if (!readSemanticSearchEnabled()) {
      return ftsResults;
    }

    try {
      // 3. Vector KNN search
      const vecResults = await searchVectorEmbeddings(q, MAX_RESULTS);
      if (vecResults.length === 0) return ftsResults;

      // 4. Reciprocal Rank Fusion (RRF) scoring
      const rrfScores = new Map<string, number>();

      ftsResults.forEach((item, index) => {
        const rank = index + 1;
        const current = rrfScores.get(item.id) ?? 0;
        rrfScores.set(item.id, current + 1 / (60 + rank));
      });

      vecResults.forEach((item, index) => {
        const rank = index + 1;
        const current = rrfScores.get(item.noteId) ?? 0;
        rrfScores.set(item.noteId, current + 1 / (60 + rank));
      });

      const ftsMap = new Map(ftsResults.map((r) => [r.id, r]));
      const sortedIds = Array.from(rrfScores.keys()).sort(
        (a, b) => (rrfScores.get(b) ?? 0) - (rrfScores.get(a) ?? 0)
      );

      const blended: HighlightedResult[] = [];
      for (const id of sortedIds) {
        if (ftsMap.has(id)) {
          blended.push(ftsMap.get(id)!);
        } else {
          const note = notes.visibleItems.find((n) => n.id === id);
          if (note) {
            blended.push({
              id: note.id,
              title: [[note.title || t("common.untitled")]],
              body: [[(note.headline || note.title || t("common.untitled")).slice(0, 150)]],
              note
            } as unknown as HighlightedResult);
          }
        }
      }

      return blended.slice(0, MAX_RESULTS);
    } catch (e) {
      logger.error("[omnibar] Vector RRF blend failed, falling back to FTS5:", e);
      return ftsResults;
    }
  }

  async function runSearch(): Promise<void> {
    const q = query.value.trim();
    if (!q) {
      results.value = [];
      loading.value = false;
      open.value = false;
      return;
    }
    lastQuery.value = q;
    loading.value = true;
    try {
      const list = await fetchResults(q);
      if (q !== query.value.trim()) return; // stale guard
      results.value = list;
      activeIndex.value = -1;
      bumpCache(q, list);
      open.value = true;
    } catch (e) {
      logger.error("[omnibar] search failed:", e);
    } finally {
      if (q === query.value.trim()) loading.value = false;
    }
  }

  async function loadResults(q: string): Promise<HighlightedResult[]> {
    const cached = resultsCache.value[q];
    if (cached) return cached;
    try {
      const list = await fetchResults(q);
      bumpCache(q, list);
      return list;
    } catch (e) {
      logger.error("[omnibar] loadResults failed:", e);
      return [];
    }
  }

  // --- mode + query handling ------------------------------------------------
  function resetActiveIndex(): void {
    activeIndex.value = mode.value === "notes" ? -1 : 0;
  }

  /** Switch mode: clear the debounce timer + the notes-mode transient state so
   *  stale results never leak across a mode boundary, and reset the cursor. */
  function switchMode(next: OmnibarMode): void {
    if (next === mode.value) return;
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    mode.value = next;
    results.value = [];
    loading.value = false;
    resetActiveIndex();
  }

  function setQuery(raw: string): void {
    const parsed = parsePrefix(raw);
    if (parsed.mode !== mode.value) switchMode(parsed.mode);
    query.value = raw;
    effectiveQuery.value = parsed.text;
    resetActiveIndex();
    if (mode.value === "notes") {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      const trimmed = raw.trim();
      if (!trimmed) {
        results.value = [];
        open.value = false;
        loading.value = false;
        return;
      }
      timer = setTimeout(() => {
        timer = undefined;
        void runSearch();
      }, DEBOUNCE_MS);
    } else {
      // Non-notes modes filter in-memory via the `items` computed (no debounce).
      // Open the dropdown so the prefix list shows as soon as `>`/`#`/`@`/`:` is
      // typed — notes mode opens via `runSearch`, but these modes have no async
      // step to flip `open`, so set it here.
      open.value = true;
    }
  }

  // --- openers (hotkeys + the `app:search-notes` command) --------------------
  function openIn(m: OmnibarMode, q: string): void {
    switchMode(m);
    query.value = q;
    effectiveQuery.value = parsePrefix(q).text;
    resetActiveIndex();
    open.value = true;
    focusSignal.value++;
  }

  function openNotes(): void {
    openIn("notes", "");
  }

  function openCommands(): void {
    openIn("commands", ">");
  }

  function focus(): void {
    focusSignal.value++;
  }

  // --- keyboard nav ---------------------------------------------------------
  function next(): void {
    const n = currentListLength.value;
    if (n === 0) return;
    if (mode.value === "notes") {
      activeIndex.value = activeIndex.value < 0 ? 0 : cycleIndex(activeIndex.value, n, 1);
    } else {
      activeIndex.value = cycleIndex(activeIndex.value, n, 1);
    }
  }

  function prev(): void {
    const n = currentListLength.value;
    if (n === 0) return;
    if (mode.value === "notes") {
      activeIndex.value = activeIndex.value < 0 ? n - 1 : cycleIndex(activeIndex.value, n, -1);
    } else {
      activeIndex.value = cycleIndex(activeIndex.value, n, -1);
    }
  }

  function setActiveIndex(i: number): void {
    const n = currentListLength.value;
    if (mode.value === "notes") {
      activeIndex.value = i < 0 ? -1 : n === 0 ? -1 : Math.min(i, n - 1);
      return;
    }
    activeIndex.value = n === 0 ? 0 : Math.min(Math.max(i, 0), n - 1);
  }

  // --- notes-mode open actions (lifted; signatures load-bearing for
  //     SearchResultsPane) ---------------------------------------------------
  function openNoteAt(noteId: string, q: string, matchIndex = 0): void {
    shell.setVisualizerVisible(false);
    const tabId = layout.openTab(layout.activeGroupId, noteId);
    if (!tabId) {
      close();
      return;
    }
    const options = { caseSensitive: false, regexp: false };
    editorStore.setPendingScrollTarget(tabId, { query: q, matchIndex, options });
    notes.setSelection([noteId]);
    close();
  }

  function openResult(index = activeIndex.value, matchIndex = 0): void {
    const r = results.value[index];
    if (!r) return;
    openNoteAt(r.id, lastQuery.value || query.value.trim(), matchIndex);
  }

  function openResultsTab(): void {
    shell.setVisualizerVisible(false);
    const q = query.value.trim();
    if (!q) return;
    layout.openSearchTab(q);
    close();
  }

  function reopen(): void {
    if (results.value.length === 0) return;
    activeIndex.value = -1;
    open.value = true;
  }

  // --- command + collection/tab pick ---------------------------------------
  /** Run the active (or `index`-th) command. Guards the third-flow close race:
   *  a command (e.g. `app:search-notes` → `openNotes`) may switch the omnibar to
   *  another mode and keep it open — only close if it did NOT switch modes. */
  function executeCommand(index = activeIndex.value): void {
    shell.setVisualizerVisible(false);
    const cmd = commandItems.value[index];
    const modeBefore = mode.value;
    if (cmd) cmd.run(ctx.value);
    if (mode.value === modeBefore && open.value) close();
  }

  /** Dispatch the active row's pick action for the current mode. */
  function pick(index = activeIndex.value): void {
    shell.setVisualizerVisible(false);
    switch (mode.value) {
      case "notes":
        openResult(index);
        return;
      case "commands":
        executeCommand(index);
        return;
      case "tags": {
        const t = tagItems.value[index];
        if (t) void goToCollection("tag", t.id);
        close();
        return;
      }
      case "notebooks": {
        const n = notebookItems.value[index];
        if (n) void goToCollection("notebook", n.id);
        close();
        return;
      }

      case "tabs": {
        const it = tabViewItems.value[index];
        if (!it) return;
        if (it.tabPick === "tab" && it.refId) layout.activateTab(it.refId);
        else if (it.refId) notes.openTab({ id: it.refId, title: it.label });
        close();
        return;
      }
    }
  }

  /** The input's Enter handler — mode-aware. Notes mode preserves the
   *  `activeIndex>=0 → openResult` / `else openResultsTab` / `reopen` logic. */
  function commitEnter(): void {
    switch (mode.value) {
      case "notes":
        if (!open.value && results.value.length > 0) {
          reopen();
          return;
        }
        if (activeIndex.value >= 0) openResult();
        else openResultsTab();
        return;
      case "commands":
      case "tags":
      case "notebooks":
      case "tabs":
        pick(activeIndex.value);
        return;
    }
  }

  function close(): void {
    open.value = false;
  }

  function clear(): void {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    query.value = "";
    effectiveQuery.value = "";
    results.value = [];
    open.value = false;
    loading.value = false;
    activeIndex.value = -1;
  }

  return {
    // state
    mode,
    query,
    effectiveQuery,
    open,
    activeIndex,
    loading,
    results,
    lastQuery,
    resultsCache,
    focusSignal,
    items,
    currentListLength,
    visibleCommands,
    commandItems,
    // openers
    openNotes,
    openCommands,
    openIn,
    focus,
    // query + nav
    setQuery,
    next,
    prev,
    setActiveIndex,
    commitEnter,
    // notes-mode open actions (load-bearing for SearchResultsPane)
    runSearch,
    loadResults,
    openNoteAt,
    openResult,
    openResultsTab,
    reopen,
    // pick dispatch
    executeCommand,
    pick,
    // lifecycle
    close,
    clear
  };
});