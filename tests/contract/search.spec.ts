// @vitest-environment node
/**
 * Contract tests for the global (title-bar) search.
 *
 * Two layers:
 *  1. Pure snippet helpers (`@contracts/search`): `escapeHtml`, `matchesToHtml`,
 *     `snippetHtml` — escaping + `<mark>` wrapping + snippet selection. These
 *     are the security-critical seam (note fragments are TEXT, never trusted
 *     HTML; a note with literal `<`/`>` must not inject markup).
 *  2. Headless `useSearchStore`: debounced query → `db.lookup.notesWithHighlighting`
 *     (mocked) → ranked results + cache; keyboard-nav cycle; `openResult` stages
 *     a pending scroll target + opens a forced tab; `openResultsTab` opens a
 *     `kind: "search"` tab.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { escapeHtml, matchesToHtml, snippetHtml, type HighlightedResult } from "@contracts/search";
import { useSearchStore } from "@/stores/search";
import { useEditorStore } from "@/stores/editor";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import { useNotesStore } from "@/stores/notes";

// `search.ts` imports `getDatabase` from the platform bootstrap; stub it. The
// fake db is per-test controllable via `mockDb` (mirrors collections.spec.ts).
let mockDb: {
  lookup: { notesWithHighlighting: ReturnType<typeof vi.fn> };
  notes: { all: unknown };
};
vi.mock("@/platform/bootstrap", () => ({
  getDatabase: () => mockDb,
  bootstrap: vi.fn()
}));

/** A minimal `VirtualizedGrouping` stub: `.length` + async `.item(i)`. */
function fakeGrouping(items: HighlightedResult[]): {
  length: number;
  item: (i: number) => Promise<{ item?: HighlightedResult }>;
} {
  return {
    length: items.length,
    item: async (i: number) => ({ item: items[i] })
  };
}

function result(id: string, title = "", content: string[][] = []): HighlightedResult {
  return {
    id,
    type: "searchResult",
    title: title ? [{ prefix: "", match: title, suffix: "" }] : [],
    content: content.map((c) => [{ prefix: c[0] ?? "", match: c[1] ?? "", suffix: c[2] ?? "" }]),
    rank: 0,
    dateCreated: 0,
    dateModified: 0
  };
}

describe("escapeHtml", () => {
  it("escapes the HTML-significant characters", () => {
    expect(escapeHtml("<b>")).toBe("&lt;b&gt;");
    expect(escapeHtml('"a" & \'b\'')).toBe("&quot;a&quot; &amp; &#39;b&#39;");
  });
});

describe("matchesToHtml", () => {
  it("wraps the matched span in <mark> and escapes every fragment", () => {
    const html = matchesToHtml([
      { prefix: "hello <b>", match: "wor", suffix: "ld>" }
    ]);
    expect(html).toBe("hello &lt;b&gt;<mark class=\"find-match\">wor</mark>ld&gt;");
    // The literal <b> from the note must NOT survive as a tag:
    expect(html).not.toContain("<b>");
  });

  it("collapses whitespace to one line", () => {
    expect(matchesToHtml([{ prefix: "a\n  b ", match: "c", suffix: " d" }])).toBe(
      "a b <mark class=\"find-match\">c</mark> d"
    );
  });

  it("caps long snippets", () => {
    const long = "x".repeat(300);
    const html = matchesToHtml([{ prefix: long, match: "y", suffix: "" }]);
    expect(html.endsWith("…")).toBe(true);
    expect(html.length).toBeLessThan(220);
  });
});

describe("snippetHtml", () => {
  it("prefers the first content block over the title", () => {
    const r = result("n1", "TitleHere", [["pre", "match", "post"]]);
    expect(snippetHtml(r)).toBe("pre<mark class=\"find-match\">match</mark>post");
  });

  it("falls back to the title when there are no content matches", () => {
    const r = result("n1", "OnlyTitle");
    expect(snippetHtml(r)).toBe("<mark class=\"find-match\">OnlyTitle</mark>");
  });

  it("returns empty when neither title nor content matches", () => {
    expect(snippetHtml(result("n1"))).toBe("");
  });
});

describe("useSearchStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockDb = {
      lookup: { notesWithHighlighting: vi.fn() },
      notes: { all: {} }
    };
  });

  it("runSearch populates results + the cache from db.lookup", async () => {
    mockDb.lookup.notesWithHighlighting.mockReturnValue(fakeGrouping([result("a", "Apple"), result("b", "Boat")]));
    const search = useSearchStore();
    search.setQuery("a");
    // Bypass the debounce by calling runSearch directly.
    await search.runSearch();
    expect(search.results).toHaveLength(2);
    expect(search.results[0].id).toBe("a");
    expect(search.resultsCache["a"]).toHaveLength(2);
    expect(search.open).toBe(true);
    expect(mockDb.lookup.notesWithHighlighting).toHaveBeenCalledWith(
      "a",
      mockDb.notes.all,
      { sortBy: "relevance", sortDirection: "desc" }
    );
  });

  it("runSearch is a no-op (clears) for an empty/whitespace query", async () => {
    const search = useSearchStore();
    search.setQuery("   ");
    await search.runSearch();
    expect(search.results).toEqual([]);
    expect(search.open).toBe(false);
    expect(mockDb.lookup.notesWithHighlighting).not.toHaveBeenCalled();
  });

  it("setQuery debounces the DB call (does not search synchronously)", () => {
    vi.useFakeTimers();
    mockDb.lookup.notesWithHighlighting.mockReturnValue(fakeGrouping([result("a")]));
    const search = useSearchStore();
    search.setQuery("x");
    expect(mockDb.lookup.notesWithHighlighting).not.toHaveBeenCalled();
    expect(search.results).toEqual([]);
    vi.advanceTimersByTime(200);
    // The debounced timer fired runSearch (async); let it settle.
    vi.useRealTimers();
  });

  it("next/prev cycle the active index through the results", async () => {
    mockDb.lookup.notesWithHighlighting.mockReturnValue(
      fakeGrouping([result("a"), result("b"), result("c")])
    );
    const search = useSearchStore();
    search.setQuery("q");
    await search.runSearch();
    expect(search.activeIndex).toBe(0);
    search.next();
    expect(search.activeIndex).toBe(1);
    search.next();
    expect(search.activeIndex).toBe(2);
    search.next(); // wraps
    expect(search.activeIndex).toBe(0);
    search.prev();
    expect(search.activeIndex).toBe(2);
  });

  it("openResult opens a note tab + stages a pending scroll target (no editor live → staged)", async () => {
    mockDb.lookup.notesWithHighlighting.mockReturnValue(fakeGrouping([result("note-1", "Hi")]));
    const search = useSearchStore();
    const layout = useEditorLayoutStore();
    const editorStore = useEditorStore();
    layout.init();
    search.setQuery("hi");
    await search.runSearch();
    search.openResult(0);
    // openTab created a note tab in the active group (no live editor in the
    // test env → the target stays staged for Editor.vue to consume).
    const tab = layout.tabForNote("note-1");
    expect(tab).toBeDefined();
    expect(tab?.groupId).toBe(layout.activeGroupId);
    // Pending scroll target staged under the tab's id (keyed by tabId so only
    // that tab's Editor consumes it).
    expect(editorStore.pendingScrollTargetFor(tab!.id)?.query).toBe("hi");
    expect(editorStore.pendingScrollTargetFor(tab!.id)?.matchIndex).toBe(0);
    expect(search.open).toBe(false); // dropdown closed after opening
    // The opened note is seeded as the list selection (mirrors a plain-click in
    // the list) so a subsequent cmd/shift-click builds a multi-selection that
    // includes it — without this, the first toggle would select only the other
    // row and the search-opened active note would be left out of the set.
    const notes = useNotesStore();
    expect(notes.isSelected("note-1")).toBe(true);
    expect(notes.selectedCount).toBe(1);
  });

  it("openResult reuses an already-open tab for the note (no duplicate) + re-stages the target", async () => {
    mockDb.lookup.notesWithHighlighting.mockReturnValue(fakeGrouping([result("note-1", "Hi")]));
    const search = useSearchStore();
    const layout = useEditorLayoutStore();
    const editorStore = useEditorStore();
    layout.init();
    // Pre-open the note in a tab (as if the user had clicked it in the list).
    const firstId = layout.openNote("note-1");
    search.setQuery("hi");
    await search.runSearch();
    search.openResult(0);
    // The existing tab is reused (no second tab spawned)…
    const matches = Object.values(layout.tabs).filter((t) => t.kind === "note");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.id).toBe(firstId);
    // …and made active, with a fresh scroll target staged for it.
    expect(layout.activeGroupId).toBe(matches[0]?.groupId);
    expect(editorStore.pendingScrollTargetFor(firstId)?.query).toBe("hi");
  });

  it("openResultsTab opens (or reuses) a kind:search tab for the query", async () => {
    const search = useSearchStore();
    const layout = useEditorLayoutStore();
    layout.init();
    search.setQuery("term");
    // Force a cache entry so the results tab has data without a live DB call.
    search.resultsCache = { term: [result("n1", "T")] } as never;
    search.openResultsTab();
    const tab = Object.values(layout.tabs).find((t) => t.kind === "search");
    expect(tab).toBeDefined();
    expect(tab?.searchQuery).toBe("term");
    // A second openResultsTab for the same query reuses the tab (dedup-by-query).
    const firstId = tab!.id;
    search.openResultsTab();
    expect(Object.values(layout.tabs).filter((t) => t.kind === "search")).toHaveLength(1);
    expect(layout.tabForSearch("term")?.id).toBe(firstId);
  });
});