// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useNotesStore } from "@/stores/notes";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import type { NoteListItem } from "@/stores/notes";

// The notes store now delegates tab bookkeeping to the editor-layout store
// and only touches the db for note *data* (load/create/save). Stub bootstrap
// with a tiny in-memory db so `create()` can run without the platform graph.
const db = {
  notes: {
    _store: new Map<string, { id: string; title: string }>(),
    add: vi.fn(async ({ title }: { title: string }) => {
      const id = `n-${db.notes._store.size + 1}`;
      db.notes._store.set(id, { id, title });
      return id;
    }),
    all: {
      items: vi.fn(async () => Array.from(db.notes._store.values()))
    }
  },
  content: { findByNoteId: vi.fn(async () => null) }
};
vi.mock("@/platform/bootstrap", () => ({
  getDatabase: () => db,
  bootstrap: vi.fn()
}));

function item(p: Partial<NoteListItem> & Pick<NoteListItem, "id" | "title">): NoteListItem {
  return {
    id: p.id,
    title: p.title,
    headline: p.headline ?? "",
    dateCreated: p.dateCreated ?? 0,
    dateEdited: p.dateEdited ?? 0,
    tags: p.tags ?? [],
    pinned: p.pinned ?? false,
    favorite: p.favorite ?? false
  };
}

const SAMPLE: NoteListItem[] = [
  item({ id: "a", title: "Alpha", dateEdited: 30 }),
  item({ id: "b", title: "Beta", dateEdited: 20 }),
  item({ id: "c", title: "Gamma", dateEdited: 10 })
];

describe("notes-tabs facade — tab state lives in the editor-layout store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    db.notes._store.clear();
    db.notes.add.mockClear();
    db.notes.all.items.mockClear();
  });

  it("no tabs / no active note before anything is opened", () => {
    const notes = useNotesStore();
    notes.items = SAMPLE;
    expect(notes.openTabs).toEqual([]);
    expect(notes.activeTabId).toBeNull();
    expect(notes.activeTab).toBeNull();
    expect(notes.activeNote).toBeNull();
  });

  it("selectNote opens a tab in the layout store + derives openTabs/activeNote", () => {
    const notes = useNotesStore();
    const layout = useEditorLayoutStore();
    layout.init();
    notes.items = SAMPLE;

    notes.selectNote("a");
    expect(Object.keys(layout.tabs)).toHaveLength(1);
    expect(layout.activeTab?.noteId).toBe("a");
    expect(notes.activeTabId).toBe(layout.activeTab?.id);
    expect(notes.openTabs.map((t) => t.noteId)).toEqual(["a"]);
    expect(notes.openTabs[0].title).toBe("Alpha");
    expect(notes.activeNote?.id).toBe("a");
  });

  it("selectNote reuses an existing tab (no duplicate)", () => {
    const notes = useNotesStore();
    const layout = useEditorLayoutStore();
    layout.init();
    notes.items = SAMPLE;
    notes.selectNote("a");
    const first = notes.activeTabId;
    notes.selectNote("b");
    notes.selectNote("a");
    expect(notes.activeTabId).toBe(first);
    expect(notes.openTabs).toHaveLength(2);
    expect(layout.activeTab?.noteId).toBe("a");
  });

  it("switching the active note via selectNote updates activeNote reactively", () => {
    const notes = useNotesStore();
    const layout = useEditorLayoutStore();
    layout.init();
    notes.items = SAMPLE;
    notes.selectNote("a");
    expect(notes.activeNote?.id).toBe("a");
    notes.selectNote("c");
    expect(notes.activeNote?.id).toBe("c");
    expect(notes.openTabs.map((t) => t.noteId)).toEqual(["a", "c"]);
  });

  it("closeTab removes the tab from the layout store", () => {
    const notes = useNotesStore();
    const layout = useEditorLayoutStore();
    layout.init();
    notes.items = SAMPLE;
    notes.selectNote("a");
    notes.selectNote("b");
    const aTab = notes.openTabs.find((t) => t.noteId === "a")!;
    notes.closeTab(aTab.id);
    expect(Object.keys(layout.tabs)).toHaveLength(1);
    expect(notes.openTabs.map((t) => t.noteId)).toEqual(["b"]);
  });

  it("create() opens the new note in a tab via the layout store", async () => {
    const notes = useNotesStore();
    const layout = useEditorLayoutStore();
    layout.init();
    notes.items = [];
    await notes.create();
    expect(db.notes.add).toHaveBeenCalled();
    expect(notes.items.length).toBe(1);
    expect(layout.activeTab?.noteId).toBe(notes.items[0].id);
    expect(notes.activeNote?.id).toBe(notes.items[0].id);
  });

  it("titles fall back to 'Untitled' for a note not in the list", () => {
    const notes = useNotesStore();
    const layout = useEditorLayoutStore();
    layout.init();
    notes.items = []; // no items → unknown title
    notes.selectNote("ghost");
    expect(notes.openTabs[0].title).toBe("Untitled");
    expect(notes.activeNote).toBeNull(); // not in items → no active note object
  });

  it("layout state is shared — the layout store sees the same tabs", () => {
    const notes = useNotesStore();
    const layout = useEditorLayoutStore();
    layout.init();
    notes.items = SAMPLE;
    notes.selectNote("a");
    // A second notes-store instance on the same pinia sees the same tabs.
    const notes2 = useNotesStore();
    expect(notes2.openTabs.map((t) => t.noteId)).toEqual(["a"]);
    expect(notes2.activeNote?.id).toBe("a");
  });
});