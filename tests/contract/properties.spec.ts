// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  htmlToText,
  noteStats,
  formatAbsoluteDate,
  TOGGLE_KEYS,
  TOGGLE_LABELS
} from "@/utils/properties";
import { usePropertiesStore } from "@/stores/properties";
import { useNotesStore } from "@/stores/notes";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import type { Note } from "@notesnook-vue/contracts";

// In-memory fake db: a map of full Notes backs `notes.note`, the toggle
// setters, and `notes.all.items`. Avoids the platform graph.
type FakeNote = Pick<
  Note,
  "id" | "title" | "headline" | "dateCreated" | "dateEdited" | "tags" | "pinned" | "favorite" | "readonly" | "localOnly"
>;

const db = {
  _full: new Map<string, FakeNote>(),
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
    all: { items: vi.fn(async () => Array.from(db._full.values())) }
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

describe("usePropertiesStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    db._full.clear();
    db.notes.note.mockClear();
    db.notes.pin.mockClear();
    db.notes.favorite.mockClear();
    db.notes.readonly.mockClear();
    db.notes.localOnly.mockClear();
    db.notes.all.items.mockClear();
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
    notes.activeContent = "<p>Hello world</p><p>Second line here</p>";
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