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
    },
    // Single-note read used by `handleRemoteNoteChanged` to refresh list meta.
    note: vi.fn(async (id: string) => {
      const e = db.notes._store.get(id);
      if (!e) return undefined;
      return {
        id,
        title: e.title,
        headline: `H-${e.title}`,
        dateCreated: 0,
        dateEdited: 999,
        pinned: true,
        favorite: false,
        tags: []
      };
    })
  },
  content: { findByNoteId: vi.fn(async () => null) }
};
vi.mock("@/platform/bootstrap", () => ({
  getDatabase: () => db,
  bootstrap: vi.fn()
}));

// The notes store broadcasts note saves to other windows via the desktop bridge.
// Stub it so `broadcastNoteChanged` (called from saveContent/flushTitle) is a
// no-op rather than reaching a real IPC proxy. `vi.hoisted` so the mock factory
// (hoisted above imports) can reference the fn before its declaration.
const { notifyChangedMutate } = vi.hoisted(() => ({ notifyChangedMutate: vi.fn() }));
vi.mock("@/platform/desktop-bridge", () => ({
  desktop: { window: { notifyNoteChanged: { mutate: notifyChangedMutate } } }
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
    db.notes.note.mockClear();
    notifyChangedMutate.mockClear();
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

  it("resetView closes all tabs + clears previews/filter/content (context switch)", () => {
    const notes = useNotesStore();
    const layout = useEditorLayoutStore();
    layout.init();
    notes.items = SAMPLE;
    notes.selectNote("a");
    notes.selectNote("b");
    // Simulate per-context state accumulated while using the old context.
    notes.previews = { a: { thumbnail: "x", checklist: { total: 1, done: 0 } } } as any;
    notes.collectionFilter = { type: "tag", id: "t1", noteIds: new Set(["a"]) };
    notes.contentCache = { a: { html: "<p>old</p>", state: "loaded" } };
    notes.saveState = "saved";
    notes.lastSavedAt = 123;

    notes.resetView();

    // All tabs gone (note ids belonged to the old context's DB).
    expect(Object.keys(layout.tabs)).toHaveLength(0);
    expect(notes.openTabs).toEqual([]);
    expect(notes.activeTabId).toBeNull();
    // Per-context caches + content cache cleared; no active note → empty content.
    expect(notes.previews).toEqual({});
    expect(notes.collectionFilter).toBeNull();
    expect(notes.contentCache).toEqual({});
    expect(notes.activeContent).toBe("");
    expect(notes.contentState).toBe("idle");
    expect(notes.saveState).toBe("idle");
    expect(notes.lastSavedAt).toBeNull();
    // The list is cleared so the old context's notes don't flash before reload.
    expect(notes.items).toEqual([]);
    // Search/sort view prefs are deliberately preserved.
    expect(notes.query).toBe("");
    expect(notes.sortKey).toBeDefined();
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

  it("handleRemoteNoteChanged refreshes list meta + bumps the per-note signal for the changed note", async () => {
    const notes = useNotesStore();
    const layout = useEditorLayoutStore();
    layout.init();
    notes.items = SAMPLE;
    notes.selectNote("a");
    expect(notes.activeNote?.id).toBe("a");
    const before = notes.noteChangedSignalFor("a");

    // Seed the db row for "a" so `db.notes.note` returns it.
    db.notes._store.set("a", { id: "a", title: "Alpha (renamed)" });

    await notes.handleRemoteNoteChanged("a");
    // List item meta refreshed from the db row.
    const active = notes.items.find((n) => n.id === "a");
    expect(active?.title).toBe("Alpha (renamed)");
    expect(active?.dateEdited).toBe(999);
    expect(active?.pinned).toBe(true);
    // Per-note signal bumped → any pane showing "a" reloads (skip-if-dirty in Editor.vue).
    expect(notes.noteChangedSignalFor("a")).toBe(before + 1);
    // A note that wasn't changed is untouched.
    expect(notes.noteChangedSignalFor("b")).toBe(0);
    expect(db.notes.note).toHaveBeenCalledWith("a");
  });

  it("handleRemoteNoteChanged bumps the per-note signal for a non-active note too (background panes)", async () => {
    const notes = useNotesStore();
    const layout = useEditorLayoutStore();
    layout.init();
    notes.items = SAMPLE;
    notes.selectNote("a");
    const beforeA = notes.noteChangedSignalFor("a");
    const beforeB = notes.noteChangedSignalFor("b");
    db.notes._store.set("b", { id: "b", title: "Beta (renamed)" });

    await notes.handleRemoteNoteChanged("b");
    // Meta still refreshed (the list reflects the other note's edit)...
    const beta = notes.items.find((n) => n.id === "b");
    expect(beta?.title).toBe("Beta (renamed)");
    // ...and the per-note signal for "b" bumps (a background split pane showing
    // "b" must reload too — not only the focused note).
    expect(notes.noteChangedSignalFor("b")).toBe(beforeB + 1);
    expect(notes.noteChangedSignalFor("a")).toBe(beforeA);
  });

  it("handleRemoteNoteChanged does not bump the signal for a note not in the list", async () => {
    const notes = useNotesStore();
    const layout = useEditorLayoutStore();
    layout.init();
    notes.items = SAMPLE;
    notes.selectNote("a");
    db.notes._store.set("ghost", { id: "ghost", title: "Ghost" });

    await notes.handleRemoteNoteChanged("ghost");
    // Not in items → no signal pollution.
    expect(notes.noteChangedSignalFor("ghost")).toBe(0);
  });

  it("saveContent broadcasts the change to other windows", async () => {
    const notes = useNotesStore();
    const layout = useEditorLayoutStore();
    layout.init();
    notes.items = SAMPLE;
    notes.selectNote("a");
    await notes.saveContent("a", "<p>new</p>");
    expect(notifyChangedMutate).toHaveBeenCalledWith({ noteId: "a" });
  });
});