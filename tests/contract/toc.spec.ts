// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { extractTableOfContents } from "@/utils/toc";
import { useTocStore } from "@/stores/toc";
import { useNotesStore } from "@/stores/notes";
import { useEditorLayoutStore } from "@/stores/editor-layout";

// toc store reads the notes store (activeNote/activeContent); stub bootstrap
// so the platform graph isn't loaded.
vi.mock("@/platform/bootstrap", () => ({
  getDatabase: () => ({
    notes: { all: { items: async () => [] }, note: async () => undefined },
    content: { findByNoteId: async () => null }
  }),
  bootstrap: vi.fn()
}));

describe("extractTableOfContents", () => {
  it("empty HTML → []", () => {
    expect(extractTableOfContents("")).toEqual([]);
    expect(extractTableOfContents("<p>No headings here</p>")).toEqual([]);
  });

  it("extracts level + text for each heading, reusing explicit ids", () => {
    const html = "<h1 id=\"intro\">Introduction</h1><p>body</p><h2 id=\"sub\">Sub</h2>";
    expect(extractTableOfContents(html)).toEqual([
      { id: "intro", level: 1, text: "Introduction" },
      { id: "sub", level: 2, text: "Sub" }
    ]);
  });

  it("derives a slug when the heading has no id", () => {
    const html = "<h3>Hello World</h3>";
    expect(extractTableOfContents(html)).toEqual([{ id: "hello-world", level: 3, text: "Hello World" }]);
  });

  it("disambiguates duplicate slugs with -2, -3, …", () => {
    const html = "<h2>Notes</h2><h2>Notes</h2><h2>Notes</h2>";
    expect(extractTableOfContents(html).map((h) => h.id)).toEqual(["notes", "notes-2", "notes-3"]);
  });

  it("explicit duplicate ids are kept as-is (not slug-deduped)", () => {
    const html = "<h2 id=\"x\">A</h2><h2 id=\"x\">B</h2>";
    expect(extractTableOfContents(html).map((h) => h.id)).toEqual(["x", "x"]);
  });

  it("strips inline tags + decodes entities in the heading text", () => {
    const html = "<h1 id=\"t\">Hello <strong>world</strong> &amp; all</h1>";
    expect(extractTableOfContents(html)).toEqual([{ id: "t", level: 1, text: "Hello world & all" }]);
  });

  it("skips blank headings", () => {
    const html = "<h2 id=\"a\">A</h2><h2 id=\"b\"></h2><h2 id=\"c\">C</h2>";
    expect(extractTableOfContents(html).map((h) => h.text)).toEqual(["A", "C"]);
  });

  it("preserves document order", () => {
    const html = "<h3 id=\"c\">C</h3><h1 id=\"a\">A</h1><h2 id=\"b\">B</h2>";
    expect(extractTableOfContents(html).map((h) => h.id)).toEqual(["c", "a", "b"]);
  });

  it("non-alphanumeric heading text still produces a slug", () => {
    expect(extractTableOfContents("<h2>--- ??? ---</h2>")).toEqual([{ id: "heading", level: 2, text: "--- ??? ---" }]);
  });

  it("handles h1–h6", () => {
    const html = ["<h1 id=\"a\">1</h1>", "<h2 id=\"b\">2</h2>", "<h3 id=\"c\">3</h3>", "<h4 id=\"d\">4</h4>", "<h5 id=\"e\">5</h5>", "<h6 id=\"f\">6</h6>"].join("");
    expect(extractTableOfContents(html).map((h) => h.level)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("useTocStore", () => {
  beforeEach(() => setActivePinia(createPinia()));

  async function openNote(): Promise<void> {
    const layout = useEditorLayoutStore();
    layout.init();
    const notes = useNotesStore();
    await notes.load();
    notes.items = [{ id: "a", title: "A", headline: "", dateCreated: 0, dateEdited: 0, tags: [], pinned: false, favorite: false }];
    notes.selectNote("a");
  }

  it("items derive from activeContent (reactive)", async () => {
    await openNote();
    const notes = useNotesStore();
    const toc = useTocStore();
    expect(toc.items).toEqual([]); // no content yet
    notes.activeContent = "<h1 id=\"intro\">Introduction</h1><h2 id=\"s\">Sub</h2>";
    expect(toc.items.map((h) => h.id)).toEqual(["intro", "s"]);
    expect(toc.activeNoteId).toBe("a");
  });

  it("refresh re-derives from current content", async () => {
    await openNote();
    const notes = useNotesStore();
    const toc = useTocStore();
    notes.activeContent = "<h2 id=\"x\">X</h2>";
    toc.refresh();
    expect(toc.items.map((h) => h.text)).toEqual(["X"]);
  });

  it("setItems pushes a live editor outline", async () => {
    await openNote();
    const toc = useTocStore();
    toc.setItems([{ id: "live", level: 1, text: "Live" }]);
    expect(toc.items.map((h) => h.id)).toEqual(["live"]);
  });

  it("goto bumps scrollToSignal + sets scrollTarget", async () => {
    await openNote();
    const toc = useTocStore();
    expect(toc.scrollToSignal).toBe(0);
    toc.goto("intro");
    expect(toc.scrollToSignal).toBe(1);
    expect(toc.scrollTarget).toBe("intro");
    toc.goto("sub");
    expect(toc.scrollToSignal).toBe(2);
    expect(toc.scrollTarget).toBe("sub");
  });
});