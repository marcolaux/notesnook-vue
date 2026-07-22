/**
 * Global-search store (title-bar search) — the headless core. Owns the query,
 * the debounced search against the vendored core's FTS5/BM25 backend
 * (`db.lookup.notesWithHighlighting`), the ranked result list + keyboard-nav
 * `activeIndex`, and the actions to open a result (new tab scrolled to the
 * match) or open a "Search Results" tab.
 *
 * Mirrors {@link stores/command-palette.ts}: a headless store the title-bar
 * input + dropdown bind to (no component-local search state). The dropdown is a
 * teleported overlay cloned from `CommandPalette.vue`; `cycleIndex` is reused
 * from editor-vue (same import as `commands/menu.ts`).
 *
 * This is the LEXICAL phase (BM25 + the existing FTS infrastructure). The store
 * is the single ranker seam: a later semantic phase swaps `runSearch` for an
 * embedding-backed ranker and the dropdown / results-tab / scroll plumbing is
 * reused unchanged.
 *
 * Stale-guard: a query typed while a search is in flight is tracked against
 * `query` at resolve time; late results for an older query are discarded.
 */
import { defineStore } from "pinia";
import { ref } from "vue";
import { cycleIndex } from "@notesnook-vue/editor-vue";
import { getDatabase } from "@/platform/bootstrap";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import { useEditorStore } from "@/stores/editor";
import { useNotesStore } from "@/stores/notes";
import { scrollEditorToMatch } from "@/utils/search-scroll";
import type { HighlightedResult } from "@contracts/search";

/** Max results fetched for the dropdown / results tab (the VirtualizedGrouping
 *  batches in chunks of 20, so this is ~3 batched async fetches). */
const MAX_RESULTS = 50;
/** Debounce before hitting the DB (FTS + BM25 over body content). */
const DEBOUNCE_MS = 180;
/** Bounded LRU of per-query result caches so the Search Results tab doesn't
 *  re-query when re-opened for a recently-searched term. */
const CACHE_MAX = 8;

export const useSearchStore = defineStore("search", () => {
  const layout = useEditorLayoutStore();
  const editorStore = useEditorStore();
  const notes = useNotesStore();

  const query = ref("");
  /** Dropdown visibility. Set true after a successful search; the input
   *  component closes it on blur/Escape. */
  const open = ref(false);
  const loading = ref(false);
  const results = ref<HighlightedResult[]>([]);
  const activeIndex = ref(0);
  /** The trimmed query that produced `results` — drives the stale guard + the
   *  pending scroll target's `query` field. */
  const lastQuery = ref("");
  /** Per-query result cache (bounded LRU via `cacheOrder`). The Search Results
   *  tab reads from here so re-opening a results tab is instant. */
  const resultsCache = ref<Record<string, HighlightedResult[]>>({});
  const cacheOrder = ref<string[]>([]);
  /** Bumped by `focus()` (the `app:search-notes` command + the ⌃⌥F hotkey); the
   *  title-bar input watches it to focus itself (mirrors `notes.focusSearchSignal`). */
  const focusSignal = ref(0);

  let timer: ReturnType<typeof setTimeout> | undefined;

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

  /** Shared fetch core: run `db.lookup.notesWithHighlighting` for `q` and pull
   *  the first {@link MAX_RESULTS} items. Returns the result list (empty on
   *  error). Pure w.r.t. store state — callers decide what to update. */
  async function fetchResults(q: string): Promise<HighlightedResult[]> {
    if (!q) return [];
    const db = getDatabase();
    const vg = await db.lookup.notesWithHighlighting(q, db.notes.all, {
      sortBy: "relevance",
      sortDirection: "desc"
    });
    const count = Math.min(vg.length, MAX_RESULTS);
    const items: HighlightedResult[] = [];
    for (let i = 0; i < count; i++) {
      const got = await vg.item(i);
      if (got.item) items.push(got.item);
    }
    return items;
  }

  /** The debounced core (driven by the title-bar input). Reads
   *  `db.lookup.notesWithHighlighting` (FTS5 + BM25 over title + body, with
   *  structured filters parsed from the query). Discards stale results. */
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
      const items = await fetchResults(q);
      // Stale guard: a newer query may have been typed while awaiting.
      if (q !== query.value.trim()) return;
      results.value = items;
      activeIndex.value = 0;
      bumpCache(q, items);
      open.value = true;
    } catch (e) {
      console.error("[global search] failed:", e);
    } finally {
      if (q === query.value.trim()) loading.value = false;
    }
  }

  /** Populate the cache for `q` without disturbing the input's query/open
   *  state — used by the Search Results tab when its query's cache entry was
   *  evicted (the tab is usually opened right after a search, so the cache is
   *  warm; this covers the rare eviction + re-open case). */
  async function loadResults(q: string): Promise<HighlightedResult[]> {
    const cached = resultsCache.value[q];
    if (cached) return cached;
    try {
      const items = await fetchResults(q);
      bumpCache(q, items);
      return items;
    } catch (e) {
      console.error("[global search] loadResults failed:", e);
      return [];
    }
  }

  function setQuery(q: string): void {
    query.value = q;
    activeIndex.value = 0;
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    const trimmed = q.trim();
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
  }

  function next(): void {
    if (results.value.length === 0) return;
    activeIndex.value = cycleIndex(activeIndex.value, results.value.length, 1);
  }

  function prev(): void {
    if (results.value.length === 0) return;
    activeIndex.value = cycleIndex(activeIndex.value, results.value.length, -1);
  }

  /** Set the active row directly (mouse hover/click). Clamped to the list. */
  function setActiveIndex(i: number): void {
    const n = results.value.length;
    activeIndex.value = n === 0 ? 0 : Math.min(Math.max(i, 0), n - 1);
  }

  /** Bump the focus-signal (palette command / hotkey → input focuses itself). */
  function focus(): void {
    focusSignal.value++;
  }

  /**
   * Open a result note scrolled to the match. Reuses an already-open tab for the
   * note (activating its group) if one exists; otherwise creates a fresh tab in
   * the active group — so a second search pick for a note you already have open
   * focuses that tab instead of spawning a duplicate.
   *
   * Three consumption paths for the scroll target, all keyed by tabId so only
   * this tab's editor acts on it:
   *  1. Tab already open AND its editor live + DOM attached (the note is
   *     currently visible): no mount/reactivation lifecycle hook will fire, so
   *     scroll it directly here.
   *  2. Tab already open but deactivated (`<KeepAlive>`-cached, DOM detached):
   *     `openTab` reactivates it → `Editor.vue`'s `onActivated` consumes the
   *     staged target.
   *  3. Brand-new tab: editor isn't registered yet → `Editor.vue`'s
   *     `loadCurrentNote` consumes the staged target after `setContent`.
   *
   * `query` is the string to locate in the doc; `matchIndex` is which occurrence
   * (dropdown passes 0; the results tab passes the snippet's block index — an
   * approximation of the Nth occurrence in document order, see
   * `scrollEditorToMatch`).
   */
  function openNoteAt(noteId: string, q: string, matchIndex = 0): void {
    const tabId = layout.openTab(layout.activeGroupId, noteId);
    if (!tabId) {
      close();
      return;
    }
    const options = { caseSensitive: false, regexp: false };
    editorStore.setPendingScrollTarget(tabId, { query: q, matchIndex, options });
    // Path 1: the note is already the visible tab — its editor is live and its
    // DOM is attached, so no lifecycle hook will fire to consume the target.
    // Scroll directly. (`isConnected` is false for a KeepAlive-deactivated tab
    // → leave the target staged for `onActivated`; undefined for a brand-new
    // tab → leave it staged for `loadCurrentNote`.)
    const live = editorStore.getEditor(tabId);
    if (live && !live.isDestroyed && live.view.dom.isConnected) {
      editorStore.clearPendingScrollTarget(tabId);
      scrollEditorToMatch(live, q, matchIndex, options);
    }
    // Seed the list selection to this note so it matches a plain-click in the
    // list: opening the note (→ activeNote) but, unlike `notes.selectOnly`,
    // does NOT touch `selectedNoteIds`. Without seeding, the first
    // cmd/shift-click on another row toggles JUST that row (the active note was
    // never in the selection), so multi-selecting "from" the search-opened note
    // appears broken. `setSelection` seeds without an editor effect.
    notes.setSelection([noteId]);
    close();
  }

  /** Open the active (or `index`-th) dropdown result. */
  function openResult(index: number = activeIndex.value, matchIndex = 0): void {
    const r = results.value[index];
    if (!r) return;
    openNoteAt(r.id, lastQuery.value || query.value.trim(), matchIndex);
  }

  /** Open (or reuse) a "Search Results" tab for the current query. */
  function openResultsTab(): void {
    const q = query.value.trim();
    if (!q) return;
    layout.openSearchTab(q);
    close();
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
    results.value = [];
    open.value = false;
    loading.value = false;
    activeIndex.value = 0;
  }

  return {
    query,
    open,
    loading,
    results,
    activeIndex,
    lastQuery,
    resultsCache,
    focusSignal,
    setQuery,
    runSearch,
    loadResults,
    next,
    prev,
    setActiveIndex,
    focus,
    openResult,
    openNoteAt,
    openResultsTab,
    close,
    clear
  };
});