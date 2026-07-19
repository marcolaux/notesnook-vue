// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useTrashStore } from "@/stores/trash";

// In-memory fake db.trash: a map of trash items backs all()/restore/delete/clear.
type FakeTrash = {
  id: string;
  itemType: "note" | "notebook";
  title?: string;
  headline?: string;
  dateDeleted: number;
  dateEdited?: number;
};

const db = {
  trash: {
    _store: new Map<string, FakeTrash>(),
    all: vi.fn(async () => Array.from(db.trash._store.values())),
    restore: vi.fn(async (...ids: string[]) => {
      for (const id of ids) db.trash._store.delete(id);
    }),
    delete: vi.fn(async (...ids: string[]) => {
      for (const id of ids) db.trash._store.delete(id);
    }),
    clear: vi.fn(async () => {
      db.trash._store.clear();
    })
  }
};
vi.mock("@/platform/bootstrap", () => ({
  getDatabase: () => db,
  bootstrap: vi.fn()
}));

function trash(p: Partial<FakeTrash> & Pick<FakeTrash, "id" | "itemType">): FakeTrash {
  return {
    id: p.id,
    itemType: p.itemType,
    title: p.title,
    headline: p.headline,
    dateDeleted: p.dateDeleted ?? 1000,
    dateEdited: p.dateEdited
  };
}

describe("useTrashStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    db.trash._store.clear();
    db.trash.all.mockClear();
    db.trash.restore.mockClear();
    db.trash.delete.mockClear();
    db.trash.clear.mockClear();
  });

  it("starts empty", () => {
    const t = useTrashStore();
    expect(t.items).toEqual([]);
    expect(t.count).toBe(0);
    expect(t.noteItems).toEqual([]);
  });

  it("load maps trash items with the type discriminator + defaults", async () => {
    db.trash._store.set("a", trash({ id: "a", itemType: "note", title: "A", headline: "h", dateDeleted: 5000, dateEdited: 4000 }));
    db.trash._store.set("b", trash({ id: "b", itemType: "notebook", title: "B", dateDeleted: 3000 }));
    const t = useTrashStore();
    await t.load();
    expect(t.items).toHaveLength(2);
    expect(t.items.find((i) => i.id === "a")).toEqual({
      id: "a", type: "note", title: "A", headline: "h", dateDeleted: 5000, dateEdited: 4000
    });
    expect(t.items.find((i) => i.id === "b")).toEqual({
      id: "b", type: "notebook", title: "B", headline: "", dateDeleted: 3000, dateEdited: 3000
    });
  });

  it("untitled fallback + noteItems filters to notes", async () => {
    db.trash._store.set("a", trash({ id: "a", itemType: "note", dateDeleted: 1 }));
    db.trash._store.set("b", trash({ id: "b", itemType: "notebook", title: "NB", dateDeleted: 2 }));
    const t = useTrashStore();
    await t.load();
    expect(t.items.find((i) => i.id === "a")?.title).toBe("Untitled");
    expect(t.noteItems.map((i) => i.id)).toEqual(["a"]);
    expect(t.count).toBe(2);
  });

  it("restore removes items by id + reloads", async () => {
    db.trash._store.set("a", trash({ id: "a", itemType: "note", title: "A", dateDeleted: 1 }));
    db.trash._store.set("b", trash({ id: "b", itemType: "note", title: "B", dateDeleted: 2 }));
    const t = useTrashStore();
    await t.load();
    await t.restore(["a"]);
    expect(db.trash.restore).toHaveBeenCalledWith("a");
    expect(t.items.map((i) => i.id)).toEqual(["b"]);
  });

  it("remove permanently deletes by id + reloads", async () => {
    db.trash._store.set("a", trash({ id: "a", itemType: "note", dateDeleted: 1 }));
    const t = useTrashStore();
    await t.load();
    await t.remove(["a"]);
    expect(db.trash.delete).toHaveBeenCalledWith("a");
    expect(t.items).toEqual([]);
  });

  it("clear empties the trash + reloads", async () => {
    db.trash._store.set("a", trash({ id: "a", itemType: "note", dateDeleted: 1 }));
    db.trash._store.set("b", trash({ id: "b", itemType: "notebook", dateDeleted: 2 }));
    const t = useTrashStore();
    await t.load();
    await t.clear();
    expect(db.trash.clear).toHaveBeenCalled();
    expect(t.items).toEqual([]);
    expect(t.count).toBe(0);
  });

  it("restore/remove with no ids is a no-op (no db call)", async () => {
    const t = useTrashStore();
    await t.restore([]);
    await t.remove([]);
    expect(db.trash.restore).not.toHaveBeenCalled();
    expect(db.trash.delete).not.toHaveBeenCalled();
  });

  it("load failure leaves the previous list intact (never throws)", async () => {
    db.trash._store.set("a", trash({ id: "a", itemType: "note", title: "A", dateDeleted: 1 }));
    const t = useTrashStore();
    await t.load();
    expect(t.count).toBe(1);
    const allSpy = db.trash.all;
    allSpy.mockRejectedValueOnce(new Error("boom"));
    await t.load();
    expect(t.count).toBe(1); // unchanged
    allSpy.mockRestore();
  });
});