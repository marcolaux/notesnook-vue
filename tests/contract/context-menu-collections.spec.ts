// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useCollectionsStore } from "@/stores/collections";
import type { Notebook, Tag } from "@notesnook-vue/contracts";

// Fake db covering the new context-menu wrappers on the collections store:
// renameNotebook/deleteNotebook/toggleNotebookPinned/notebookNoteCount +
// renameTag/deleteTag/tagNoteCount + the inline-rename state. `notebooks.add`
// upserts by id (the rename path), `pin`/`totalNotes`/`remove` back the toggles,
// and `relations.to(...,"note").resolve()` backs the tag note count.
type Ref = { id: string; type: string };
let mockDb: {
  _nb: Map<string, Notebook>;
  _roots: string[];
  _tags: Map<string, Tag>;
  _tagNotes: Map<string, number>;
  notebooks: {
    all: { items: () => Promise<Notebook[]> };
    roots: { items: () => Promise<Notebook[]> };
    add: (arg: Partial<Notebook>) => Promise<string>;
    remove: (...ids: string[]) => Promise<void>;
    pin: (state: boolean, ...ids: string[]) => Promise<void>;
    totalNotes: (id: string) => Promise<number>;
  };
  tags: {
    all: { items: () => Promise<Tag[]> };
    add: (arg: Partial<Tag> & { title: string }) => Promise<string>;
    remove: (...ids: string[]) => Promise<void>;
  };
  trash: { all: () => Promise<unknown[]> };
  notes: { archived: { ids: () => Promise<string[]> } };
  relations: {
    from: (ref: Ref, type: string) => { resolve: () => Promise<Notebook[]> };
    add: (a: Ref, b: Ref) => Promise<void>;
    to: (ref: Ref, type: string) => { resolve: () => Promise<unknown[]> };
  };
};
vi.mock("@/platform/bootstrap", () => ({
  getDatabase: () => mockDb,
  bootstrap: vi.fn()
}));

function nb(id: string, title: string, pinned = false): Notebook {
  return { id, type: "notebook", title, description: "", dateCreated: 1, dateModified: 1, pinned } as Notebook;
}
function tag(id: string, title: string): Tag {
  return { id, type: "tag", title, dateCreated: 1, dateModified: 1 } as Tag;
}

beforeEach(() => {
  setActivePinia(createPinia());
  mockDb = {
    _nb: new Map<string, Notebook>([
      ["b1", nb("b1", "Work")],
      ["b2", nb("b2", "Personal", true)]
    ]),
    _roots: ["b1", "b2"],
    _tags: new Map<string, Tag>([
      ["t1", tag("t1", "urgent")],
      ["t2", tag("t2", "later")]
    ]),
    _tagNotes: new Map<string, number>([["t1", 3], ["t2", 0]]),
    notebooks: {
      all: { items: async () => Array.from(mockDb._nb.values()) },
      roots: { items: async () => mockDb._roots.map((id) => mockDb._nb.get(id)!).filter(Boolean) },
      add: vi.fn(async (arg: Partial<Notebook>) => {
        const id = arg.id!;
        const existing = mockDb._nb.get(id);
        mockDb._nb.set(id, { ...(existing ?? nb(id, "")), ...arg } as Notebook);
        return id;
      }),
      remove: vi.fn(async (...ids: string[]) => {
        for (const id of ids) {
          mockDb._nb.delete(id);
          mockDb._roots = mockDb._roots.filter((r) => r !== id);
        }
      }),
      pin: vi.fn(async (state: boolean, ...ids: string[]) => {
        for (const id of ids) {
          const n = mockDb._nb.get(id);
          if (n) mockDb._nb.set(id, { ...n, pinned: state });
        }
      }),
      totalNotes: vi.fn(async (id: string) => (id === "b1" ? 5 : id === "b2" ? 2 : 0))
    },
    tags: {
      all: { items: async () => Array.from(mockDb._tags.values()) },
      add: vi.fn(async (arg: Partial<Tag> & { title: string }) => {
        const id = arg.id!;
        const existing = mockDb._tags.get(id);
        mockDb._tags.set(id, { ...(existing ?? tag(id, "")), ...arg } as Tag);
        return id;
      }),
      remove: vi.fn(async (...ids: string[]) => {
        for (const id of ids) mockDb._tags.delete(id);
      })
    },
    trash: { all: async () => [] },
    notes: { archived: { ids: async () => [] } },
    relations: {
      from: () => ({ resolve: async () => [] }),
      add: vi.fn(async () => undefined),
      to: (ref: Ref, type: string) => ({
        resolve: async () => {
          if (type === "note") {
            const count = mockDb._tagNotes.get(ref.id) ?? 0;
            return Array.from({ length: count });
          }
          return [];
        }
      })
    }
  };
});

describe("collections store — context-menu wrappers", () => {
  beforeEach(async () => {
    const c = useCollectionsStore();
    await c.load(); // seed notebooks/tags from the fake db
  });

  it("renameNotebook upserts by id + reloads the sidebar title", async () => {
    const c = useCollectionsStore();
    const ok = await c.renameNotebook("b1", "Work 2026");
    expect(ok).toBe(true);
    expect(mockDb.notebooks.add).toHaveBeenCalledWith({ id: "b1", title: "Work 2026" });
    expect(c.notebooks.find((n) => n.id === "b1")?.title).toBe("Work 2026");
  });

  it("renameNotebook rejects an empty title", async () => {
    const c = useCollectionsStore();
    const ok = await c.renameNotebook("b1", "   ");
    expect(ok).toBe(false);
    expect(mockDb.notebooks.add).not.toHaveBeenCalled();
  });

  it("deleteNotebook removes by id + clears expand/children state + reloads", async () => {
    const c = useCollectionsStore();
    c.expanded.add("b1"); // pretend it was expanded
    const ok = await c.deleteNotebook("b1");
    expect(ok).toBe(true);
    expect(mockDb.notebooks.remove).toHaveBeenCalledWith("b1");
    expect(c.expanded.has("b1")).toBe(false);
    expect(c.notebooks.find((n) => n.id === "b1")).toBeUndefined();
  });

  it("toggleNotebookPinned flips the pinned flag via db.notebooks.pin", async () => {
    const c = useCollectionsStore();
    expect(c.notebooks.find((n) => n.id === "b1")?.pinned).toBe(false);
    await c.toggleNotebookPinned("b1");
    expect(mockDb.notebooks.pin).toHaveBeenCalledWith(true, "b1");
    expect(c.notebooks.find((n) => n.id === "b1")?.pinned).toBe(true);
    await c.toggleNotebookPinned("b1");
    expect(mockDb.notebooks.pin).toHaveBeenLastCalledWith(false, "b1");
    expect(c.notebooks.find((n) => n.id === "b1")?.pinned).toBe(false);
  });

  it("notebookNoteCount reads db.notebooks.totalNotes (0 on failure)", async () => {
    const c = useCollectionsStore();
    expect(await c.notebookNoteCount("b1")).toBe(5);
    expect(await c.notebookNoteCount("b2")).toBe(2);
    expect(await c.notebookNoteCount("")).toBe(0);
  });

  it("renameTag upserts by id + reloads the tags list", async () => {
    const c = useCollectionsStore();
    const ok = await c.renameTag("t1", "urgent-2026");
    expect(ok).toBe(true);
    expect(mockDb.tags.add).toHaveBeenCalledWith({ id: "t1", title: "urgent-2026" });
    expect(c.tags.find((t) => t.id === "t1")?.title).toBe("urgent-2026");
  });

  it("deleteTag removes by id + reloads", async () => {
    const c = useCollectionsStore();
    const ok = await c.deleteTag("t1");
    expect(ok).toBe(true);
    expect(mockDb.tags.remove).toHaveBeenCalledWith("t1");
    expect(c.tags.find((t) => t.id === "t1")).toBeUndefined();
  });

  it("tagNoteCount reads the tag→note relation count (0 on failure)", async () => {
    const c = useCollectionsStore();
    expect(await c.tagNoteCount("t1")).toBe(3);
    expect(await c.tagNoteCount("t2")).toBe(0);
    expect(await c.tagNoteCount("")).toBe(0);
  });
});

describe("collections store — inline-rename state", () => {
  it("startRename seeds editing state; setRenameText updates it", () => {
    const c = useCollectionsStore();
    expect(c.renaming).toBeNull();
    c.startRename("notebook", "b1", "Work");
    expect(c.renaming).toEqual({ kind: "notebook", id: "b1", text: "Work" });
    c.setRenameText("Work 2");
    expect(c.renaming?.text).toBe("Work 2");
  });

  it("commitRename calls the matching rename wrapper + clears state", async () => {
    const c = useCollectionsStore();
    c.startRename("notebook", "b1", "Work");
    c.setRenameText("Work 2026");
    await c.commitRename();
    expect(mockDb.notebooks.add).toHaveBeenCalledWith({ id: "b1", title: "Work 2026" });
    expect(c.renaming).toBeNull();
  });

  it("commitRename routes a tag rename through renameTag", async () => {
    const c = useCollectionsStore();
    c.startRename("tag", "t1", "urgent");
    c.setRenameText("urgent-now");
    await c.commitRename();
    expect(mockDb.tags.add).toHaveBeenCalledWith({ id: "t1", title: "urgent-now" });
    expect(c.renaming).toBeNull();
  });

  it("commitRename with an empty/blank text just clears state (no rename call)", async () => {
    const c = useCollectionsStore();
    c.startRename("notebook", "b1", "Work");
    c.setRenameText("   ");
    await c.commitRename();
    expect(mockDb.notebooks.add).not.toHaveBeenCalled();
    expect(c.renaming).toBeNull();
  });

  it("cancelRename clears the editing state without renaming", async () => {
    const c = useCollectionsStore();
    c.startRename("notebook", "b1", "Work");
    c.cancelRename();
    expect(c.renaming).toBeNull();
    expect(mockDb.notebooks.add).not.toHaveBeenCalled();
  });

  it("commitRename is a no-op when nothing is being renamed", async () => {
    const c = useCollectionsStore();
    await expect(c.commitRename()).resolves.toBeUndefined();
    expect(c.renaming).toBeNull();
  });
});