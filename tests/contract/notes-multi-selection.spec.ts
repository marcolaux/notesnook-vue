// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useNotesStore } from "@/stores/notes";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import type { NoteListItem } from "@/stores/notes";

// Stub bootstrap with a tiny in-memory db. The selection model + bulk
// trash/duplicate only touch `db.notes.all.items`, `db.notes.moveToTrash`,
// and `db.notes.duplicate` (all variadic) — so a minimal stub suffices.
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
    moveToTrash: vi.fn(async (..._ids: string[]) => {
      for (const id of _ids) db.notes._store.delete(id);
    }),
    duplicate: vi.fn(async (..._ids: string[]) => {
      for (const id of _ids) {
        const e = db.notes._store.get(id);
        if (e) {
          const copy = `dup-${id}-${db.notes._store.size}`;
          db.notes._store.set(copy, { id: copy, title: e.title });
        }
      }
    })
  },
  content: { findByNoteId: vi.fn(async () => null) }
};
vi.mock("@/platform/bootstrap", () => ({
  getCurrentContext: () => "local",
  getDatabase: () => db,
  bootstrap: vi.fn()
}));

const { notifyChangedMutate } = vi.hoisted(() => ({ notifyChangedMutate: vi.fn() }));
vi.mock("@/platform/desktop-bridge", () => ({
  desktop: { window: { notifyNoteChanged: { mutate: notifyChangedMutate } } }
}));

function item(p: Partial<NoteListItem> & Pick<NoteListItem, "id" | "title" | "dateEdited">): NoteListItem {
  return {
    id: p.id,
    title: p.title,
    headline: p.headline ?? "",
    dateCreated: p.dateCreated ?? 0,
    dateEdited: p.dateEdited,
    tags: p.tags ?? [],
    pinned: p.pinned ?? false,
    favorite: p.favorite ?? false
  };
}

// dateEdited desc is the default sort, so visibleItems order is [a, b, c].
const SAMPLE: NoteListItem[] = [
  item({ id: "a", title: "Alpha", dateEdited: 30 }),
  item({ id: "b", title: "Beta", dateEdited: 20 }),
  item({ id: "c", title: "Gamma", dateEdited: 10 })
];

describe("notes multi-selection model", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    db.notes._store.clear();
    for (const n of SAMPLE) db.notes._store.set(n.id, { id: n.id, title: n.title });
    db.notes.all.items.mockClear();
    db.notes.moveToTrash.mockClear();
    db.notes.duplicate.mockClear();
  });

  it("starts with no selection", () => {
    const notes = useNotesStore();
    expect(notes.selectedCount).toBe(0);
    expect(notes.isSelected("a")).toBe(false);
  });

  it("selectOnly opens the note AND collapses the selection to it", () => {
    const notes = useNotesStore();
    const layout = useEditorLayoutStore();
    layout.init();
    notes.items = SAMPLE;

    notes.selectOnly("a");
    expect(notes.selectedCount).toBe(1);
    expect(notes.isSelected("a")).toBe(true);
    expect(layout.activeTab?.noteId).toBe("a");
  });

  it("toggleSelection adds/removes a note WITHOUT opening it", () => {
    const notes = useNotesStore();
    const layout = useEditorLayoutStore();
    layout.init();
    notes.items = SAMPLE;
    notes.selectOnly("a");
    const openTabId = notes.activeTabId;

    notes.toggleSelection("b");
    expect(notes.selectedCount).toBe(2);
    expect(notes.isSelected("b")).toBe(true);
    // The editor stays on "a" (no open).
    expect(layout.activeTab?.noteId).toBe("a");
    expect(notes.activeTabId).toBe(openTabId);

    notes.toggleSelection("b");
    expect(notes.selectedCount).toBe(1);
    expect(notes.isSelected("b")).toBe(false);
  });

  it("extendSelection ranges from the anchor in visibleItems order", () => {
    const notes = useNotesStore();
    const layout = useEditorLayoutStore();
    layout.init();
    notes.items = SAMPLE;
    notes.selectOnly("a"); // anchor = a (index 0 in [a,b,c])

    notes.extendSelection("c"); // a..c → [a, b, c]
    expect(notes.selectedCount).toBe(3);
    expect(notes.isSelected("c")).toBe(true);

    // Anchor does not move: shift-clicking "b" ranges from "a" again → [a, b].
    notes.extendSelection("b");
    expect(notes.selectedCount).toBe(2);
    expect([...notes.selectedNoteIds]).toEqual(["a", "b"]);
  });

  it("extendSelection falls back to just the clicked note when the anchor is gone", () => {
    const notes = useNotesStore();
    const layout = useEditorLayoutStore();
    layout.init();
    notes.items = SAMPLE;
    notes.clearSelection(); // no anchor
    notes.extendSelection("b");
    expect(notes.selectedCount).toBe(1);
    expect(notes.isSelected("b")).toBe(true);
  });

  it("setSelection replaces the selection; clearSelection empties it", () => {
    const notes = useNotesStore();
    notes.items = SAMPLE;
    notes.setSelection(["a", "b"]);
    expect(notes.selectedCount).toBe(2);
    notes.clearSelection();
    expect(notes.selectedCount).toBe(0);
    expect(notes.anchorId).toBeNull();
  });

  it("selectNote (the public facade) collapses the selection + opens", () => {
    const notes = useNotesStore();
    const layout = useEditorLayoutStore();
    layout.init();
    notes.items = SAMPLE;
    notes.setSelection(["a", "b", "c"]);
    notes.selectNote("b");
    expect(notes.selectedCount).toBe(1);
    expect(notes.isSelected("b")).toBe(true);
    expect(layout.activeTab?.noteId).toBe("b");
  });

  it("pruneSelection drops selected ids no longer in items (via load)", async () => {
    const notes = useNotesStore();
    notes.items = SAMPLE;
    notes.setSelection(["a", "b"]);
    // Simulate "a" being trashed elsewhere: the next load returns only [b, c].
    db.notes._store.delete("a");
    await notes.load();
    expect(notes.selectedCount).toBe(1);
    expect(notes.isSelected("b")).toBe(true);
    expect(notes.isSelected("a")).toBe(false);
  });

  it("moveToTrashMany spreads ids into the variadic db call, clears selection + reloads", async () => {
    const notes = useNotesStore();
    const layout = useEditorLayoutStore();
    layout.init();
    notes.items = SAMPLE;
    notes.selectNote("a");
    notes.toggleSelection("b");
    expect(notes.selectedCount).toBe(2);

    await notes.moveToTrashMany(["a", "b"]);
    expect(db.notes.moveToTrash).toHaveBeenCalledWith("a", "b");
    expect(notes.selectedCount).toBe(0);
    // "a" + "b" are gone from the db; the reloaded list has only "c".
    expect(notes.items.map((n) => n.id)).toEqual(["c"]);
    // Tabs hosting trashed notes are closed.
    expect(Object.keys(layout.tabs)).toHaveLength(0);
  });

  it("duplicateMany spreads ids into the variadic db call + reloads", async () => {
    const notes = useNotesStore();
    notes.items = SAMPLE;
    await notes.duplicateMany(["a", "b"]);
    expect(db.notes.duplicate).toHaveBeenCalledWith("a", "b");
    // Two copies appended (c remains, plus dup-a + dup-b). The db store starts
    // at size 3 (a, b, c), so the first copy is `dup-a-3` then `dup-b-4`.
    expect(notes.items.map((n) => n.id).sort()).toEqual(["a", "b", "c", "dup-a-3", "dup-b-4"].sort());
  });

  it("moveToTrashMany / duplicateMany are no-ops on an empty id list", async () => {
    const notes = useNotesStore();
    await notes.moveToTrashMany([]);
    await notes.duplicateMany([]);
    expect(db.notes.moveToTrash).not.toHaveBeenCalled();
    expect(db.notes.duplicate).not.toHaveBeenCalled();
  });
});