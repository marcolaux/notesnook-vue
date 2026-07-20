// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  htmlToText,
  noteStats,
  formatAbsoluteDate,
  toAssignedTag,
  toAssignedNotebook,
  uniqueById,
  TOGGLE_KEYS,
  TOGGLE_LABELS
} from "@/utils/properties";
import { usePropertiesStore } from "@/stores/properties";
import { useNotesStore } from "@/stores/notes";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import type { Note } from "@notesnook-vue/contracts";

// In-memory fake db: a map of full Notes backs `notes.note`, the toggle
// setters, and `notes.all.items`. Per-note tag + notebook assignments back
// `relations.to(note,"tag"|"notebook").resolve()`; `relations.add`/`unlink`
// mutate the tag side; `notes.addToNotebook`/`removeFromNotebook` mutate the
// notebook side. Avoids the platform graph.
type FakeNote = Pick<
  Note,
  "id" | "title" | "headline" | "dateCreated" | "dateEdited" | "tags" | "pinned" | "favorite" | "readonly" | "localOnly"
>;

type FakeTag = { id: string; title: string; type: "tag"; dateCreated: number; dateModified: number };
type FakeNotebook = { id: string; title: string; type: "notebook"; dateCreated: number; dateModified: number };

const db = {
  _full: new Map<string, FakeNote>(),
  _noteTags: new Map<string, FakeTag[]>(),
  _noteNotebooks: new Map<string, FakeNotebook[]>(),
  _allTags: new Map<string, FakeTag>(),
  notes: {
    note: vi.fn(async (id: string) => db._full.get(id)),
    pin: vi.fn(async (state: boolean, ...ids: string[]) => {
      for (const id of ids) {
        const n = db._full.get(id);
        if (n) n.pinned = state;
      }
    }),
    favorite: vi.fn(async (state: boolean, ...ids: string[]) => {
      for (const id of ids) {
        const n = db._full.get(id);
        if (n) n.favorite = state;
      }
    }),
    readonly: vi.fn(async (state: boolean, ...ids: string[]) => {
      for (const id of ids) {
        const n = db._full.get(id);
        if (n) n.readonly = state;
      }
    }),
    localOnly: vi.fn(async (state: boolean, ...ids: string[]) => {
      for (const id of ids) {
        const n = db._full.get(id);
        if (n) n.localOnly = state;
      }
    }),
    addToNotebook: vi.fn(async (notebookId: string, ...noteIds: string[]) => {
      for (const id of noteIds) {
        const list = db._noteNotebooks.get(id) ?? [];
        if (!list.some((n) => n.id === notebookId)) {
          list.push({ id: notebookId, title: `Notebook ${notebookId}`, type: "notebook", dateCreated: 1, dateModified: 1 });
          db._noteNotebooks.set(id, list);
        }
      }
    }),
    removeFromNotebook: vi.fn(async (notebookId: string, ...noteIds: string[]) => {
      for (const id of noteIds) {
        const list = (db._noteNotebooks.get(id) ?? []).filter((n) => n.id !== notebookId);
        db._noteNotebooks.set(id, list);
      }
    }),
    all: { items: vi.fn(async () => Array.from(db._full.values())) }
  },
  relations: {
    to: vi.fn((ref: { id: string }, type: string) => ({
      resolve: vi.fn(async () => {
        if (type === "tag") return db._noteTags.get(ref.id) ?? [];
        if (type === "notebook") return db._noteNotebooks.get(ref.id) ?? [];
        return [];
      })
    })),
    add: vi.fn(async (from: { id: string; type: string }, to: { id: string; type: string }) => {
      if (from.type === "tag" && to.type === "note") {
        const tag =
          db._allTags.get(from.id) ??
          ({ id: from.id, title: `Tag ${from.id}`, type: "tag", dateCreated: 1, dateModified: 1 } as FakeTag);
        const list = db._noteTags.get(to.id) ?? [];
        if (!list.some((t) => t.id === tag.id)) list.push(tag);
        db._noteTags.set(to.id, list);
      }
    }),
    unlink: vi.fn(async (from: { id: string; type: string }, to: { id: string; type: string }) => {
      if (from.type === "tag" && to.type === "note") {
        const list = (db._noteTags.get(to.id) ?? []).filter((t) => t.id !== from.id);
        db._noteTags.set(to.id, list);
      }
    })
  },
  tags: {
    add: vi.fn(async (item: { title: string }) => {
      const id = `tag-${item.title.toLowerCase().replace(/\s+/g, "-")}`;
      const tag: FakeTag = { id, title: item.title, type: "tag", dateCreated: 1, dateModified: 1 };
      db._allTags.set(id, tag);
      return id;
    })
  },
  content: { findByNoteId: vi.fn(async () => null) }
};
vi.mock("@/platform/bootstrap", () => ({
  getDatabase: () => db,
  bootstrap: vi.fn()
}));

function fakeNote(p: Partial<FakeNote> & Pick<FakeNote, "id" | "title">): FakeNote {
  return {
    id: p.id,
    title: p.title,
    headline: p.headline ?? "",
    dateCreated: p.dateCreated ?? 100,
    dateEdited: p.dateEdited ?? 100,
    tags: p.tags ?? [],
    pinned: p.pinned ?? false,
    favorite: p.favorite ?? false,
    readonly: p.readonly ?? false,
    localOnly: p.localOnly ?? false
  };
}

describe("htmlToText", () => {
  it("strips tags + decodes common entities", () => {
    expect(htmlToText("<p>Hello &amp; welcome</p>")).toBe("Hello & welcome");
    expect(htmlToText("<p>A &lt;b&gt; B</p>")).toBe("A <b> B");
    expect(htmlToText("a&nbsp;b&quot;c&#39;d")).toBe('a b"c\'d');
  });

  it("inserts newlines at block boundaries", () => {
    expect(htmlToText("<p>One</p><p>Two</p>")).toBe("One\nTwo");
    expect(htmlToText("<ul><li>A</li><li>B</li></ul>")).toBe("A\nB");
  });

  it("br → newline", () => {
    expect(htmlToText("a<br>b")).toBe("a\nb");
    expect(htmlToText("a<br/>b<br />c")).toBe("a\nb\nc");
  });

  it("empty input → empty string", () => {
    expect(htmlToText("")).toBe("");
  });
});

describe("noteStats", () => {
  it("empty HTML → all zeros", () => {
    expect(noteStats("")).toEqual({ words: 0, chars: 0, lines: 0 });
  });

  it("counts words, chars, non-empty lines", () => {
    const s = noteStats("<p>Hello world</p><p>Second line here</p>");
    // text = "Hello world\nSecond line here"
    expect(s.words).toBe(5);
    expect(s.chars).toBe("Hello world\nSecond line here".length);
    expect(s.lines).toBe(2);
  });

  it("collapses block noise (no phantom lines counted)", () => {
    const s = noteStats("<p>One</p><ul><li>A</li><li>B</li></ul>");
    // Non-empty lines: "One", "A", "B" → 3 lines.
    expect(s.lines).toBe(3);
    expect(s.words).toBe(3);
  });
});

describe("formatAbsoluteDate", () => {
  it("0 → empty string", () => {
    expect(formatAbsoluteDate(0)).toBe("");
  });
  it("formats a timestamp as a localized absolute date", () => {
    const ts = new Date(2026, 6, 19, 12, 30).getTime();
    const out = formatAbsoluteDate(ts);
    expect(out).toContain("2026");
    expect(out).toContain("12");
    expect(out).toContain("30");
  });
});

describe("TOGGLE_KEYS / TOGGLE_LABELS", () => {
  it("exposes the four core-backed toggles with labels", () => {
    expect(TOGGLE_KEYS).toEqual(["pinned", "favorite", "readonly", "localOnly"]);
    expect(TOGGLE_LABELS.pinned).toBe("Pinned");
    expect(TOGGLE_LABELS.localOnly).toBe("Disable sync");
  });
});

describe("toAssignedTag / toAssignedNotebook / uniqueById", () => {
  it("toAssignedTag maps id+title with Untitled fallback", () => {
    expect(toAssignedTag({ id: "t1", title: "Work", type: "tag", dateCreated: 1, dateModified: 1 } as never)).toEqual({
      id: "t1",
      title: "Work"
    });
    expect(toAssignedTag({ id: "t2", title: "", type: "tag", dateCreated: 1, dateModified: 1 } as never).title).toBe(
      "Untitled"
    );
  });

  it("toAssignedNotebook maps id+title with Untitled fallback", () => {
    expect(
      toAssignedNotebook({ id: "n1", title: "Research", type: "notebook", dateCreated: 1, dateModified: 1 } as never)
    ).toEqual({ id: "n1", title: "Research" });
    expect(
      toAssignedNotebook({ id: "n2", title: "", type: "notebook", dateCreated: 1, dateModified: 1 } as never).title
    ).toBe("Untitled");
  });

  it("uniqueById dedupes by id preserving first-seen order, skips holes", () => {
    expect(uniqueById([{ id: "a" }, { id: "b" }, { id: "a" }, { id: "c" }])).toEqual([
      { id: "a" },
      { id: "b" },
      { id: "c" }
    ]);
    expect(uniqueById([])).toEqual([]);
  });
});

describe("usePropertiesStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    db._full.clear();
    db._noteTags.clear();
    db._noteNotebooks.clear();
    db._allTags.clear();
    db.notes.note.mockClear();
    db.notes.pin.mockClear();
    db.notes.favorite.mockClear();
    db.notes.readonly.mockClear();
    db.notes.localOnly.mockClear();
    db.notes.addToNotebook.mockClear();
    db.notes.removeFromNotebook.mockClear();
    db.notes.all.items.mockClear();
    db.relations.to.mockClear();
    db.relations.add.mockClear();
    db.relations.unlink.mockClear();
    db.tags.add.mockClear();
    db.content.findByNoteId.mockClear();
  });

  async function openNote(note: FakeNote): Promise<void> {
    db._full.set(note.id, note);
    const layout = useEditorLayoutStore();
    layout.init();
    const notes = useNotesStore();
    await notes.load();
    notes.selectNote(note.id);
  }

  it("no active note → zero stats + empty toggles", async () => {
    setActivePinia(createPinia());
    const layout = useEditorLayoutStore();
    layout.init();
    useNotesStore(); // populate pinia (no items, no tab)
    const props = usePropertiesStore();
    await props.loadNote();
    expect(props.activeNoteId).toBeNull();
    expect(props.stats).toEqual({ words: 0, chars: 0, lines: 0 });
    expect(props.toggles).toEqual({ pinned: false, favorite: false, readonly: false, localOnly: false });
  });

  it("loadNote reads the full note's toggles (incl. readonly/localOnly)", async () => {
    await openNote(fakeNote({ id: "a", title: "A", pinned: true, readonly: true, localOnly: true }));
    const props = usePropertiesStore();
    await props.loadNote();
    expect(db.notes.note).toHaveBeenCalledWith("a");
    expect(props.toggles).toEqual({ pinned: true, favorite: false, readonly: true, localOnly: true });
    expect(props.activeNoteId).toBe("a");
  });

  it("stats derive from activeContent (updated reactively)", async () => {
    await openNote(fakeNote({ id: "a", title: "A" }));
    const notes = useNotesStore();
    const props = usePropertiesStore();
    await props.loadNote();
    expect(props.stats.words).toBe(0); // no content yet
    notes.contentCache = { a: { html: "<p>Hello world</p><p>Second line here</p>", state: "loaded" } };
    // the activeContent watch recomputes stats
    expect(props.stats.words).toBe(5);
    expect(props.stats.lines).toBe(2);
  });

  it("setStats pushes live counts (editor path)", async () => {
    await openNote(fakeNote({ id: "a", title: "A" }));
    const props = usePropertiesStore();
    props.setStats({ words: 99, chars: 500, lines: 7 });
    expect(props.stats).toEqual({ words: 99, chars: 500, lines: 7 });
  });

  it("toggle flips a flag via db, reloads note + list", async () => {
    await openNote(fakeNote({ id: "a", title: "A", pinned: false }));
    const notes = useNotesStore();
    const props = usePropertiesStore();
    await props.loadNote();
    expect(props.toggles.pinned).toBe(false);
    const result = await props.toggle("pinned");
    expect(result).toBe(true);
    expect(db.notes.pin).toHaveBeenCalledWith(true, "a");
    // toggles reloaded from the full note (now pinned)
    expect(props.toggles.pinned).toBe(true);
    // list reloaded → the list item reflects pinned
    expect(notes.items.find((n) => n.id === "a")?.pinned).toBe(true);
  });

  it("toggle readonly/localOnly (not carried by the list item) still works", async () => {
    await openNote(fakeNote({ id: "a", title: "A", readonly: false }));
    const props = usePropertiesStore();
    await props.loadNote();
    await props.toggle("readonly");
    expect(db.notes.readonly).toHaveBeenCalledWith(true, "a");
    expect(props.toggles.readonly).toBe(true);
  });

  it("toggle returns null with no active note", async () => {
    setActivePinia(createPinia());
    const layout = useEditorLayoutStore();
    layout.init();
    useNotesStore();
    const props = usePropertiesStore();
    const result = await props.toggle("favorite");
    expect(result).toBeNull();
  });

  it("dateCreated/dateEdited come from the active list item", async () => {
    await openNote(fakeNote({ id: "a", title: "A", dateCreated: 111, dateEdited: 222 }));
    const props = usePropertiesStore();
    expect(props.dateCreated).toBe(111);
    expect(props.dateEdited).toBe(222);
  });
});

describe("usePropertiesStore — tags & notebooks", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    db._full.clear();
    db._noteTags.clear();
    db._noteNotebooks.clear();
    db._allTags.clear();
    db.notes.note.mockClear();
    db.notes.addToNotebook.mockClear();
    db.notes.removeFromNotebook.mockClear();
    db.relations.to.mockClear();
    db.relations.add.mockClear();
    db.relations.unlink.mockClear();
    db.tags.add.mockClear();
  });

  async function openNote(note: FakeNote): Promise<void> {
    db._full.set(note.id, note);
    const layout = useEditorLayoutStore();
    layout.init();
    const notes = useNotesStore();
    await notes.load();
    notes.selectNote(note.id);
  }

  it("no active note → empty tags + notebooks", async () => {
    setActivePinia(createPinia());
    const layout = useEditorLayoutStore();
    layout.init();
    useNotesStore();
    const props = usePropertiesStore();
    await props.loadAssignments();
    expect(props.tags).toEqual([]);
    expect(props.notebooks).toEqual([]);
  });

  it("loadAssignments reads tag + notebook relations in parallel", async () => {
    db._noteTags.set("a", [
      { id: "t1", title: "Work", type: "tag", dateCreated: 1, dateModified: 1 }
    ]);
    db._noteNotebooks.set("a", [
      { id: "nb1", title: "Research", type: "notebook", dateCreated: 1, dateModified: 1 }
    ]);
    await openNote(fakeNote({ id: "a", title: "A" }));
    const props = usePropertiesStore();
    await props.loadAssignments();
    expect(db.relations.to).toHaveBeenCalledWith({ id: "a", type: "note" }, "tag");
    expect(db.relations.to).toHaveBeenCalledWith({ id: "a", type: "note" }, "notebook");
    expect(props.tags).toEqual([{ id: "t1", title: "Work" }]);
    expect(props.notebooks).toEqual([{ id: "nb1", title: "Research" }]);
  });

  it("addTag links tag→note via relations.add, then reloads", async () => {
    db._allTags.set("t1", { id: "t1", title: "Work", type: "tag", dateCreated: 1, dateModified: 1 });
    await openNote(fakeNote({ id: "a", title: "A" }));
    const props = usePropertiesStore();
    const ok = await props.addTag("t1");
    expect(ok).toBe(true);
    expect(db.relations.add).toHaveBeenCalledWith({ id: "t1", type: "tag" }, { id: "a", type: "note" });
    expect(props.tags).toEqual([{ id: "t1", title: "Work" }]);
    expect(props.busy).toBe(false);
    expect(props.lastError).toBeNull();
  });

  it("removeTag unlinks tag→note via relations.unlink, then reloads", async () => {
    db._noteTags.set("a", [
      { id: "t1", title: "Work", type: "tag", dateCreated: 1, dateModified: 1 },
      { id: "t2", title: "Home", type: "tag", dateCreated: 1, dateModified: 1 }
    ]);
    await openNote(fakeNote({ id: "a", title: "A" }));
    const props = usePropertiesStore();
    const ok = await props.removeTag("t1");
    expect(ok).toBe(true);
    expect(db.relations.unlink).toHaveBeenCalledWith({ id: "t1", type: "tag" }, { id: "a", type: "note" });
    expect(props.tags).toEqual([{ id: "t2", title: "Home" }]);
  });

  it("createTag creates the tag + links it, returns the new tag", async () => {
    await openNote(fakeNote({ id: "a", title: "A" }));
    const props = usePropertiesStore();
    const created = await props.createTag("Ideas");
    expect(db.tags.add).toHaveBeenCalledWith({ title: "Ideas" });
    expect(db.relations.add).toHaveBeenCalledWith({ id: "tag-ideas", type: "tag" }, { id: "a", type: "note" });
    expect(created).toEqual({ id: "tag-ideas", title: "Ideas" });
    expect(props.tags).toContainEqual({ id: "tag-ideas", title: "Ideas" });
  });

  it("createTag trims + rejects empty title (returns null, no db call)", async () => {
    await openNote(fakeNote({ id: "a", title: "A" }));
    const props = usePropertiesStore();
    expect(await props.createTag("   ")).toBeNull();
    expect(db.tags.add).not.toHaveBeenCalled();
  });

  it("addNotebook uses db.notes.addToNotebook, then reloads", async () => {
    await openNote(fakeNote({ id: "a", title: "A" }));
    const props = usePropertiesStore();
    const ok = await props.addNotebook("nb1");
    expect(ok).toBe(true);
    expect(db.notes.addToNotebook).toHaveBeenCalledWith("nb1", "a");
    expect(props.notebooks).toEqual([{ id: "nb1", title: "Notebook nb1" }]);
  });

  it("removeNotebook uses db.notes.removeFromNotebook, then reloads", async () => {
    db._noteNotebooks.set("a", [
      { id: "nb1", title: "Research", type: "notebook", dateCreated: 1, dateModified: 1 }
    ]);
    await openNote(fakeNote({ id: "a", title: "A" }));
    const props = usePropertiesStore();
    const ok = await props.removeNotebook("nb1");
    expect(ok).toBe(true);
    expect(db.notes.removeFromNotebook).toHaveBeenCalledWith("nb1", "a");
    expect(props.notebooks).toEqual([]);
  });

  it("addTag returns false + sets lastError when relations.add throws", async () => {
    await openNote(fakeNote({ id: "a", title: "A" }));
    db.relations.add.mockRejectedValueOnce(new Error("boom"));
    const props = usePropertiesStore();
    const ok = await props.addTag("t1");
    expect(ok).toBe(false);
    expect(props.lastError).toBe("boom");
    expect(props.busy).toBe(false);
  });

  it("mutators return false with no active note", async () => {
    setActivePinia(createPinia());
    const layout = useEditorLayoutStore();
    layout.init();
    useNotesStore();
    const props = usePropertiesStore();
    expect(await props.addTag("t1")).toBe(false);
    expect(await props.removeTag("t1")).toBe(false);
    expect(await props.createTag("x")).toBeNull();
    expect(await props.addNotebook("nb1")).toBe(false);
    expect(await props.removeNotebook("nb1")).toBe(false);
    expect(db.relations.add).not.toHaveBeenCalled();
    expect(db.notes.addToNotebook).not.toHaveBeenCalled();
  });
});