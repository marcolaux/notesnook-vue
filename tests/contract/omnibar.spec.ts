// @vitest-environment node
/**
 * Contract tests for the unified title-bar omnibar (`useOmnibarStore`).
 *
 * Migrated from the former `search.spec.ts` (notes mode) and
 * `command-palette.spec.ts` (commands mode), plus the new `#` tags / `@`
 * notebooks / `:` tabs prefix modes and the "Search notes" third-flow
 * (a command that switches the omnibar to notes mode mid-execute).
 *
 * Layers:
 *  1. Pure snippet helpers (`@contracts/search`): `escapeHtml`, `matchesToHtml`,
 *     `snippetHtml` — the security-critical seam (note fragments are TEXT, never
 *     trusted HTML; a note with literal `<`/`>` must not inject markup). Unchanged
 *     from the old search spec.
 *  2. Headless `useOmnibarStore` — per-mode behaviour: notes FTS + cache +
 *     openResult/openResultsTab/reopen + the -1 sentinel; commands filtering +
 *     execute + the mode-switch close guard; tags/notebooks/tabs pick dispatch.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { escapeHtml, matchesToHtml, snippetHtml, type HighlightedResult } from "@contracts/search";
import { useOmnibarStore } from "@/stores/omnibar";
import { useEditorStore } from "@/stores/editor";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import { useNotesStore } from "@/stores/notes";
import { useCollectionsStore } from "@/stores/collections";
import { goToCollection } from "@/utils/collection-nav";
import {
  registerCommands,
  clearCommands,
  type Command
} from "@/commands/registry";
import type { Editor } from "@tiptap/vue-3";

// `omnibar.ts` imports `getDatabase` from the platform bootstrap; stub it. The
// fake db is per-test controllable via `mockDb` (mirrors the old search spec).
let mockDb: {
  lookup: { notesWithHighlighting: ReturnType<typeof vi.fn> };
  notes: { all: unknown };
};
vi.mock("@/platform/bootstrap", () => ({
  getDatabase: () => mockDb,
  bootstrap: vi.fn()
}));

// `goToCollection` would call `notes.filterByCollection` → `db.relations`, which
// the stub db doesn't have. Mock the whole module so tag/notebook picks are
// observable + side-effect-free.
vi.mock("@/utils/collection-nav", () => ({
  goToCollection: vi.fn()
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

function stubEditor(): Editor {
  return { isEditable: true } as unknown as Editor;
}

function fakeCommands(): Command[] {
  return [
    { id: "always", title: "Always visible", keywords: ["alpha"], group: "app", run: () => {} },
    {
      id: "needs-editor",
      title: "Editor action",
      keywords: ["bold", "strong"],
      group: "editor",
      when: (ctx) => !!ctx.editor,
      run: () => {}
    },
    { id: "new-note", title: "New note", keywords: ["create"], group: "app", run: () => {} }
  ];
}

describe("escapeHtml", () => {
  it("escapes the HTML-significant characters", () => {
    expect(escapeHtml("<b>")).toBe("&lt;b&gt;");
    expect(escapeHtml('"a" & \'b\'')).toBe("&quot;a&quot; &amp; &#39;b&#39;");
  });
});

describe("matchesToHtml", () => {
  it("wraps the matched span in <mark> and escapes every fragment", () => {
    const html = matchesToHtml([{ prefix: "hello <b>", match: "wor", suffix: "ld>" }]);
    expect(html).toBe("hello &lt;b&gt;<mark class=\"find-match\">wor</mark>ld&gt;");
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
    expect(snippetHtml(result("n1", "TitleHere", [["pre", "match", "post"]]))).toBe(
      "pre<mark class=\"find-match\">match</mark>post"
    );
  });

  it("falls back to the title when there are no content matches", () => {
    expect(snippetHtml(result("n1", "OnlyTitle"))).toBe("<mark class=\"find-match\">OnlyTitle</mark>");
  });

  it("returns empty when neither title nor content matches", () => {
    expect(snippetHtml(result("n1"))).toBe("");
  });
});

describe("useOmnibarStore — notes mode", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockDb = {
      lookup: { notesWithHighlighting: vi.fn() },
      notes: { all: {} }
    };
    clearCommands();
  });

  it("setQuery with no prefix lands in notes mode", () => {
    const omnibar = useOmnibarStore();
    omnibar.setQuery("apple");
    expect(omnibar.mode).toBe("notes");
    expect(omnibar.effectiveQuery).toBe("apple");
    expect(omnibar.activeIndex).toBe(-1); // notes sentinel
  });

  it("runSearch populates results + the cache from db.lookup", async () => {
    mockDb.lookup.notesWithHighlighting.mockReturnValue(fakeGrouping([result("a", "Apple"), result("b", "Boat")]));
    const omnibar = useOmnibarStore();
    omnibar.setQuery("a");
    await omnibar.runSearch();
    expect(omnibar.results).toHaveLength(2);
    expect(omnibar.results[0].id).toBe("a");
    expect(omnibar.resultsCache["a"]).toHaveLength(2);
    expect(omnibar.open).toBe(true);
    expect(mockDb.lookup.notesWithHighlighting).toHaveBeenCalledWith(
      "a",
      mockDb.notes.all,
      { sortBy: "relevance", sortDirection: "desc" }
    );
  });

  it("runSearch is a no-op (clears) for an empty/whitespace query", async () => {
    const omnibar = useOmnibarStore();
    omnibar.setQuery("   ");
    await omnibar.runSearch();
    expect(omnibar.results).toEqual([]);
    expect(omnibar.open).toBe(false);
    expect(mockDb.lookup.notesWithHighlighting).not.toHaveBeenCalled();
  });

  it("setQuery debounces the DB call (does not search synchronously)", () => {
    vi.useFakeTimers();
    mockDb.lookup.notesWithHighlighting.mockReturnValue(fakeGrouping([result("a")]));
    const omnibar = useOmnibarStore();
    omnibar.setQuery("x");
    expect(mockDb.lookup.notesWithHighlighting).not.toHaveBeenCalled();
    expect(omnibar.results).toEqual([]);
    vi.advanceTimersByTime(200);
    vi.useRealTimers();
  });

  it("next/prev cycle the active index through the results (notes -1 sentinel)", async () => {
    mockDb.lookup.notesWithHighlighting.mockReturnValue(fakeGrouping([result("a"), result("b"), result("c")]));
    const omnibar = useOmnibarStore();
    omnibar.setQuery("q");
    await omnibar.runSearch();
    expect(omnibar.activeIndex).toBe(-1);
    omnibar.next(); // -1 → first
    expect(omnibar.activeIndex).toBe(0);
    omnibar.next();
    expect(omnibar.activeIndex).toBe(1);
    omnibar.next();
    expect(omnibar.activeIndex).toBe(2);
    omnibar.next(); // wraps
    expect(omnibar.activeIndex).toBe(0);
    omnibar.prev();
    expect(omnibar.activeIndex).toBe(2);
  });

  it("prev from the no-selection sentinel lands on the last row", async () => {
    mockDb.lookup.notesWithHighlighting.mockReturnValue(fakeGrouping([result("a"), result("b"), result("c")]));
    const omnibar = useOmnibarStore();
    omnibar.setQuery("q");
    await omnibar.runSearch();
    expect(omnibar.activeIndex).toBe(-1);
    omnibar.prev(); // -1 → last
    expect(omnibar.activeIndex).toBe(2);
  });

  it("openResult opens a note tab + stages a pending scroll target (no editor live → staged)", async () => {
    mockDb.lookup.notesWithHighlighting.mockReturnValue(fakeGrouping([result("note-1", "Hi")]));
    const omnibar = useOmnibarStore();
    const layout = useEditorLayoutStore();
    const editorStore = useEditorStore();
    layout.init();
    omnibar.setQuery("hi");
    await omnibar.runSearch();
    omnibar.openResult(0);
    const tab = layout.tabForNote("note-1");
    expect(tab).toBeDefined();
    expect(tab?.groupId).toBe(layout.activeGroupId);
    expect(editorStore.pendingScrollTargetFor(tab!.id)?.query).toBe("hi");
    expect(editorStore.pendingScrollTargetFor(tab!.id)?.matchIndex).toBe(0);
    expect(omnibar.open).toBe(false);
    const notes = useNotesStore();
    expect(notes.isSelected("note-1")).toBe(true);
    expect(notes.selectedCount).toBe(1);
  });

  it("openResult reuses an already-open tab for the note + re-stages the target", async () => {
    mockDb.lookup.notesWithHighlighting.mockReturnValue(fakeGrouping([result("note-1", "Hi")]));
    const omnibar = useOmnibarStore();
    const layout = useEditorLayoutStore();
    const editorStore = useEditorStore();
    layout.init();
    const firstId = layout.openNote("note-1");
    omnibar.setQuery("hi");
    await omnibar.runSearch();
    omnibar.openResult(0);
    const matches = Object.values(layout.tabs).filter((t) => t.kind === "note");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.id).toBe(firstId);
    expect(layout.activeGroupId).toBe(matches[0]?.groupId);
    expect(editorStore.pendingScrollTargetFor(firstId)?.query).toBe("hi");
  });

  it("openResultsTab opens (or reuses) a kind:search tab for the query", async () => {
    const omnibar = useOmnibarStore();
    const layout = useEditorLayoutStore();
    layout.init();
    omnibar.setQuery("term");
    omnibar.resultsCache = { term: [result("n1", "T")] } as never;
    omnibar.openResultsTab();
    const tab = Object.values(layout.tabs).find((t) => t.kind === "search");
    expect(tab).toBeDefined();
    expect(tab?.searchQuery).toBe("term");
    const firstId = tab!.id;
    omnibar.openResultsTab();
    expect(Object.values(layout.tabs).filter((t) => t.kind === "search")).toHaveLength(1);
    expect(layout.tabForSearch("term")?.id).toBe(firstId);
  });

  it("reopen re-shows the dropdown (without re-querying) + resets the cursor to -1", async () => {
    mockDb.lookup.notesWithHighlighting.mockReturnValue(fakeGrouping([result("a"), result("b")]));
    const omnibar = useOmnibarStore();
    const layout = useEditorLayoutStore();
    layout.init();
    omnibar.setQuery("q");
    await omnibar.runSearch();
    expect(omnibar.open).toBe(true);
    expect(omnibar.activeIndex).toBe(-1);
    omnibar.next();
    expect(omnibar.activeIndex).toBe(0);
    omnibar.openResult();
    expect(omnibar.open).toBe(false);
    expect(omnibar.results).toHaveLength(2);
    const callsBefore = mockDb.lookup.notesWithHighlighting.mock.calls.length;
    omnibar.reopen();
    expect(omnibar.open).toBe(true);
    expect(omnibar.activeIndex).toBe(-1);
    expect(mockDb.lookup.notesWithHighlighting.mock.calls.length).toBe(callsBefore);
  });

  it("reopen is a no-op when there are no results to show", async () => {
    const omnibar = useOmnibarStore();
    omnibar.setQuery("q");
    await omnibar.runSearch();
    expect(omnibar.results).toHaveLength(0);
    omnibar.reopen();
    expect(omnibar.open).toBe(false);
  });
});

describe("useOmnibarStore — commands mode", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockDb = { lookup: { notesWithHighlighting: vi.fn() }, notes: { all: {} } };
    clearCommands();
    registerCommands(fakeCommands());
  });

  /** Type into command mode (keeps the `>` prefix so it stays in commands mode). */
  function cmdQuery(omnibar: ReturnType<typeof useOmnibarStore>, text: string): void {
    omnibar.setQuery(">" + text);
  }

  it("openCommands opens in commands mode with `>` + activeIndex 0", () => {
    const omnibar = useOmnibarStore();
    expect(omnibar.open).toBe(false);
    omnibar.openCommands();
    expect(omnibar.open).toBe(true);
    expect(omnibar.mode).toBe("commands");
    expect(omnibar.query).toBe(">");
    expect(omnibar.effectiveQuery).toBe("");
    expect(omnibar.activeIndex).toBe(0); // non-notes: 0-based, never -1
  });

  it("typing `>` into a closed omnibar opens the dropdown in commands mode", () => {
    // No hotkey/opener — pure typing. The prefix-mode list must open on its own
    // (notes mode opens via runSearch; prefix modes open in setQuery).
    const omnibar = useOmnibarStore();
    expect(omnibar.open).toBe(false);
    omnibar.setQuery(">");
    expect(omnibar.mode).toBe("commands");
    expect(omnibar.open).toBe(true);
    expect(omnibar.commandItems.length).toBeGreaterThan(0);
  });

  it("items exclude commands whose when predicate is false (editor undefined)", () => {
    const omnibar = useOmnibarStore();
    omnibar.openCommands();
    const ids = omnibar.commandItems.map((c) => c.id);
    expect(ids).toContain("always");
    expect(ids).toContain("new-note");
    expect(ids).not.toContain("needs-editor");
  });

  it("editor commands become visible once an editor is published", () => {
    const editorStore = useEditorStore();
    editorStore.register("tab", stubEditor());
    editorStore.setFocusedKey("tab");
    const omnibar = useOmnibarStore();
    omnibar.openCommands();
    expect(omnibar.commandItems.map((c) => c.id)).toContain("needs-editor");
  });

  it("setQuery filters by subsequence on title + keywords and resets activeIndex", () => {
    const editorStore = useEditorStore();
    editorStore.register("tab", stubEditor());
    editorStore.setFocusedKey("tab");
    const omnibar = useOmnibarStore();
    omnibar.openCommands();
    cmdQuery(omnibar, "bold");
    expect(omnibar.commandItems.map((c) => c.id)).toEqual(["needs-editor"]);
    expect(omnibar.activeIndex).toBe(0);
    cmdQuery(omnibar, "new");
    expect(omnibar.commandItems.map((c) => c.id)).toEqual(["new-note"]);
  });

  it("next/prev wrap around the filtered list (0-based, no -1)", () => {
    const editorStore = useEditorStore();
    editorStore.register("tab", stubEditor());
    editorStore.setFocusedKey("tab");
    const omnibar = useOmnibarStore();
    omnibar.openCommands();
    const n = omnibar.commandItems.length;
    expect(n).toBe(3);
    expect(omnibar.activeIndex).toBe(0);
    omnibar.next();
    expect(omnibar.activeIndex).toBe(1);
    omnibar.next();
    omnibar.next();
    expect(omnibar.activeIndex).toBe(0); // wrapped
    omnibar.prev();
    expect(omnibar.activeIndex).toBe(n - 1); // wrapped back
  });

  it("executeCommand runs the active command and closes the omnibar", () => {
    let ranId: string | null = null;
    clearCommands();
    registerCommands([{ id: "spy", title: "Spy", group: "app", run: () => (ranId = "spy") }]);
    const omnibar = useOmnibarStore();
    omnibar.openCommands();
    omnibar.executeCommand();
    expect(ranId).toBe("spy");
    expect(omnibar.open).toBe(false);
  });

  it("executeCommand does not throw when the list is empty", () => {
    clearCommands();
    const omnibar = useOmnibarStore();
    omnibar.openCommands();
    expect(() => omnibar.executeCommand()).not.toThrow();
    expect(omnibar.open).toBe(false);
  });

  it("closePalette is exposed in the command context", () => {
    let closeCalled = false;
    clearCommands();
    registerCommands([
      {
        id: "closer",
        title: "Closer",
        group: "app",
        run: (ctx) => {
          ctx.closePalette();
          closeCalled = true;
        }
      }
    ]);
    const omnibar = useOmnibarStore();
    omnibar.openCommands();
    omnibar.executeCommand();
    expect(closeCalled).toBe(true);
    expect(omnibar.open).toBe(false);
  });

  it("a command that switches mode (app:search-notes → openNotes) keeps the omnibar open", () => {
    // The third-flow close guard: executeCommand captures modeBefore; a command
    // that calls ctx.omnibar.openNotes() switches to notes mode, so execute must
    // NOT close the omnibar — the user lands in notes mode ready to type a term.
    clearCommands();
    registerCommands([
      {
        id: "search-notes",
        title: "Search notes",
        group: "app",
        run: (ctx) => ctx.omnibar.openNotes()
      }
    ]);
    const omnibar = useOmnibarStore();
    omnibar.openCommands();
    expect(omnibar.mode).toBe("commands");
    omnibar.executeCommand();
    expect(omnibar.mode).toBe("notes");
    expect(omnibar.open).toBe(true); // NOT closed — mode switched
    expect(omnibar.query).toBe(""); // the `>` was cleared
  });
});

describe("useOmnibarStore — tags / notebooks / tabs modes", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockDb = { lookup: { notesWithHighlighting: vi.fn() }, notes: { all: {} } };
    clearCommands();
    vi.mocked(goToCollection).mockClear();
  });

  it("# prefix enters tags mode; pick dispatches goToCollection('tag', id)", () => {
    const omnibar = useOmnibarStore();
    const collections = useCollectionsStore();
    collections.tags = [
      { id: "t1", title: "Work", dateCreated: 0, dateModified: 0 },
      { id: "t2", title: "Personal", dateCreated: 0, dateModified: 0 }
    ];
    omnibar.setQuery("#work");
    expect(omnibar.mode).toBe("tags");
    expect(omnibar.effectiveQuery).toBe("work");
    expect(omnibar.items.map((i) => i.label)).toEqual(["Work"]);
    expect(omnibar.activeIndex).toBe(0); // non-notes: 0-based
    omnibar.pick(0);
    expect(goToCollection).toHaveBeenCalledWith("tag", "t1");
    expect(omnibar.open).toBe(false);
  });

  it("@ prefix enters notebooks mode; pick dispatches goToCollection('notebook', id)", () => {
    const omnibar = useOmnibarStore();
    const collections = useCollectionsStore();
    collections.notebooks = [
      { id: "nb1", title: "Projects", description: "", dateCreated: 0, dateModified: 0, pinned: false },
      { id: "nb2", title: "Inbox", description: "", dateCreated: 0, dateModified: 0, pinned: false }
    ];
    omnibar.setQuery("@proj");
    expect(omnibar.mode).toBe("notebooks");
    expect(omnibar.items.map((i) => i.label)).toEqual(["Projects"]);
    omnibar.pick(0);
    expect(goToCollection).toHaveBeenCalledWith("notebook", "nb1");
    expect(omnibar.open).toBe(false);
  });

  it(": prefix enters tabs mode; pick on a tab row activates it", () => {
    const omnibar = useOmnibarStore();
    const layout = useEditorLayoutStore();
    const notes = useNotesStore();
    layout.init();
    const tabId = layout.openTab(layout.activeGroupId, "note-1");
    // Seed the notes list so the tab title resolves + recent notes exist.
    notes.items = [
      { id: "note-1", title: "My Note", headline: "", dateCreated: 0, dateEdited: 0, tags: [], pinned: false, favorite: false }
    ];
    omnibar.setQuery(":");
    expect(omnibar.mode).toBe("tabs");
    // First row is the open tab; its label is the note title.
    expect(omnibar.items[0].label).toBe("My Note");
    expect(omnibar.items[0].tabPick).toBe("tab");
    omnibar.pick(0);
    // activateTab set the tab's group activeTabId + made its group active.
    expect(layout.activeGroupId).toBe(layout.tabs[tabId].groupId);
    expect(omnibar.open).toBe(false);
  });

  it(": tabs mode recent row opens the note (no goToCollection)", () => {
    const omnibar = useOmnibarStore();
    const layout = useEditorLayoutStore();
    const notes = useNotesStore();
    layout.init();
    notes.items = [
      { id: "r1", title: "Recent one", headline: "", dateCreated: 0, dateEdited: 5, tags: [], pinned: false, favorite: false }
    ];
    omnibar.setQuery(":");
    // No open tabs → the first row is the recent note.
    const recent = omnibar.items.find((i) => i.tabPick === "recent");
    expect(recent).toBeDefined();
    expect(recent?.label).toBe("Recent one");
    omnibar.pick(omnibar.items.indexOf(recent!));
    // A note tab was opened for r1.
    expect(layout.tabForNote("r1")).toBeDefined();
    expect(goToCollection).not.toHaveBeenCalled();
  });
});