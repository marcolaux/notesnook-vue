// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { usePropertiesStore } from "@/stores/properties";
import { useNotesStore } from "@/stores/notes";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import type { Note } from "@notesnook-vue/contracts";

// Minimal stub db for the bulk *Many actions. Supports BOTH the single-note
// `relations.to({id},"color")` form (used by setColorMany's per-note unlink)
// AND the bulk `relations.to({type:"note",ids},"color")` form (used by
// clearColorMany's single bulk unlink), plus `.get()` (raw relations) and a
// `db.transaction` that just runs the executor. Records every call so the
// tests assert variadic spread + per-note relation loops.
type Rel = { fromId: string; fromType: string; toId: string; toType: string };

const db = {
  // raw relation log (tag/color/notebook → note) keyed `${fromId}|${toId}`.
  _rels: new Map<string, Rel>(),
  _full: new Map<string, Pick<Note, "id" | "pinned" | "favorite">>(),
  transaction: vi.fn(async (executor: (tr?: unknown) => Promise<void>) => executor()),
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
    addToNotebook: vi.fn(async (_notebookId: string, ...noteIds: string[]) => {
      for (const id of noteIds) db._rels.set(`nb|${id}`, { fromId: _notebookId, fromType: "notebook", toId: id, toType: "note" });
    }),
    removeFromNotebook: vi.fn(async (_notebookId: string, ...noteIds: string[]) => {
      for (const id of noteIds) db._rels.delete(`nb|${id}`);
    }),
    all: { items: vi.fn(async () => Array.from(db._full.values())) }
  },
  relations: {
    to: vi.fn((ref: { id?: string; type?: string; ids?: string[] }, type: string) => {
      const noteIds = ref.ids ?? (ref.id ? [ref.id] : []);
      return {
        resolve: vi.fn(async () => []),
        get: vi.fn(async () =>
          Array.from(db._rels.values()).filter((r) => r.fromType === type && noteIds.includes(r.toId))
        ),
        unlink: vi.fn(async () => {
          for (const id of noteIds)
            for (const r of Array.from(db._rels.values()))
              if (r.toId === id && r.fromType === type) db._rels.delete(`${r.fromId}|${r.toId}`);
        })
      };
    }),
    add: vi.fn(async (from: { id: string; type: string }, to: { id: string; type: string }) => {
      db._rels.set(`${from.id}|${to.id}`, { fromId: from.id, fromType: from.type, toId: to.id, toType: to.type });
    }),
    unlink: vi.fn(async (from: { id: string; type: string }, to: { id: string; type: string }) => {
      db._rels.delete(`${from.id}|${to.id}`);
    })
  },
  tags: { add: vi.fn(async (item: { title: string }) => `tag-${item.title}`) },
  notebooks: { add: vi.fn(async (item: { title: string }) => `nb-${item.title}`) },
  content: { findByNoteId: vi.fn(async () => null) }
};
vi.mock("@/platform/bootstrap", () => ({
  getCurrentContext: () => "local",
  getDatabase: () => db,
  bootstrap: vi.fn()
}));
vi.mock("@/platform/desktop-bridge", () => ({
  desktop: { window: { notifyNoteChanged: { mutate: vi.fn() } } }
}));

describe("properties bulk (*Many) actions", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    db._rels.clear();
    db._full.clear();
    db._full.set("a", { id: "a", pinned: false, favorite: false });
    db._full.set("b", { id: "b", pinned: false, favorite: false });
    db._full.set("c", { id: "c", pinned: false, favorite: false });
    db.notes.pin.mockClear();
    db.notes.favorite.mockClear();
    db.notes.addToNotebook.mockClear();
    db.notes.removeFromNotebook.mockClear();
    db.relations.add.mockClear();
    db.relations.unlink.mockClear();
    db.transaction.mockClear();
    db.tags.add.mockClear();
    db.notebooks.add.mockClear();
  });

  it("setToggleMany spreads ids into the variadic db.notes.pin call", async () => {
    const properties = usePropertiesStore();
    useNotesStore();
    useEditorLayoutStore();
    await properties.setToggleMany("pinned", ["a", "b", "c"], true);
    expect(db.notes.pin).toHaveBeenCalledWith(true, "a", "b", "c");
    expect(db._full.get("a")!.pinned).toBe(true);
    expect(db._full.get("c")!.pinned).toBe(true);
  });

  it("addToNotebookMany spreads ids into the variadic db.notes.addToNotebook call", async () => {
    const properties = usePropertiesStore();
    useNotesStore();
    useEditorLayoutStore();
    await properties.addToNotebookMany("nb1", ["a", "b"]);
    expect(db.notes.addToNotebook).toHaveBeenCalledWith("nb1", "a", "b");
  });

  it("addTagToMany loops db.relations.add per note inside a transaction", async () => {
    const properties = usePropertiesStore();
    useNotesStore();
    useEditorLayoutStore();
    await properties.addTagToMany("t1", ["a", "b"]);
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(db.relations.add).toHaveBeenCalledTimes(2);
    expect(db.relations.add).toHaveBeenCalledWith({ id: "t1", type: "tag" }, { id: "a", type: "note" });
    expect(db.relations.add).toHaveBeenCalledWith({ id: "t1", type: "tag" }, { id: "b", type: "note" });
  });

  it("removeTagToMany loops db.relations.unlink per note inside a transaction", async () => {
    const properties = usePropertiesStore();
    useNotesStore();
    useEditorLayoutStore();
    db._rels.set("t1|a", { fromId: "t1", fromType: "tag", toId: "a", toType: "note" });
    db._rels.set("t1|b", { fromId: "t1", fromType: "tag", toId: "b", toType: "note" });
    await properties.removeTagToMany("t1", ["a", "b"]);
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(db.relations.unlink).toHaveBeenCalledTimes(2);
    expect(db._rels.has("t1|a")).toBe(false);
    expect(db._rels.has("t1|b")).toBe(false);
  });

  it("setColorMany unlinks each note's existing color + adds the new one in a transaction", async () => {
    const properties = usePropertiesStore();
    useNotesStore();
    useEditorLayoutStore();
    db._rels.set("old|a", { fromId: "old", fromType: "color", toId: "a", toType: "note" });
    await properties.setColorMany("new", ["a", "b"]);
    expect(db.transaction).toHaveBeenCalledOnce();
    // two unlinks (one per note's existing color) + two adds.
    expect(db.relations.add).toHaveBeenCalledWith({ id: "new", type: "color" }, { id: "a", type: "note" });
    expect(db.relations.add).toHaveBeenCalledWith({ id: "new", type: "color" }, { id: "b", type: "note" });
    expect(db._rels.has("old|a")).toBe(false);
    expect(db._rels.has("new|a")).toBe(true);
    expect(db._rels.has("new|b")).toBe(true);
  });

  it("clearColorMany issues a single bulk unlink for the whole id set (ids form)", async () => {
    const properties = usePropertiesStore();
    useNotesStore();
    useEditorLayoutStore();
    db._rels.set("red|a", { fromId: "red", fromType: "color", toId: "a", toType: "note" });
    db._rels.set("red|b", { fromId: "red", fromType: "color", toId: "b", toType: "note" });
    await properties.clearColorMany(["a", "b"]);
    // The bulk ids form is used (one unlink for the whole set, not per-note).
    expect(db.relations.to).toHaveBeenCalledWith({ type: "note", ids: ["a", "b"] }, "color");
    expect(db._rels.has("red|a")).toBe(false);
    expect(db._rels.has("red|b")).toBe(false);
  });

  it("createTagMany creates the tag then adds it to every note in a transaction", async () => {
    const properties = usePropertiesStore();
    useNotesStore();
    useEditorLayoutStore();
    await properties.createTagMany("urgent", ["a", "b"]);
    expect(db.tags.add).toHaveBeenCalledWith({ title: "urgent" });
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(db.relations.add).toHaveBeenCalledWith({ id: "tag-urgent", type: "tag" }, { id: "a", type: "note" });
    expect(db.relations.add).toHaveBeenCalledWith({ id: "tag-urgent", type: "tag" }, { id: "b", type: "note" });
  });

  it("createNotebookMany creates the notebook then adds all notes via the variadic call", async () => {
    const properties = usePropertiesStore();
    useNotesStore();
    useEditorLayoutStore();
    await properties.createNotebookMany("Trips", ["a", "b"]);
    expect(db.notebooks.add).toHaveBeenCalledWith({ title: "Trips" });
    expect(db.notes.addToNotebook).toHaveBeenCalledWith("nb-Trips", "a", "b");
  });

  it("every *Many method is a no-op on an empty id list", async () => {
    const properties = usePropertiesStore();
    useNotesStore();
    useEditorLayoutStore();
    await properties.setToggleMany("pinned", [], true);
    await properties.addToNotebookMany("nb1", []);
    await properties.addTagToMany("t1", []);
    await properties.setColorMany("c1", []);
    await properties.clearColorMany([]);
    await properties.createTagMany("x", []);
    await properties.createNotebookMany("y", []);
    expect(db.notes.pin).not.toHaveBeenCalled();
    expect(db.notes.addToNotebook).not.toHaveBeenCalled();
    expect(db.relations.add).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });
});