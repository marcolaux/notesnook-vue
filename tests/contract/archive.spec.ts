// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useArchiveStore } from "@/stores/archive";

/** A minimal Note shape — the store only reads id/title/headline/dateEdited/
 *  dateCreated, so a partial fixture is enough. */
type FakeNote = {
  id: string;
  title: string;
  headline?: string;
  dateEdited: number;
  dateCreated: number;
  archived?: boolean;
};

const db = {
  notes: {
    /** In-memory archived set (what `db.notes.archived.items()` returns). */
    _archived: new Map<string, FakeNote>(),
    archived: {
      items: vi.fn(async () => Array.from(db.notes._archived.values())),
      ids: vi.fn(async () => Array.from(db.notes._archived.keys()))
    },
    archive: vi.fn(async (state: boolean, ...ids: string[]) => {
      for (const id of ids) {
        if (state) {
          // Simulate the core moving a note into the archived selector.
          if (!db.notes._archived.has(id)) {
            db.notes._archived.set(id, {
              id,
              title: "Archived",
              dateEdited: 1,
              dateCreated: 1
            });
          }
        } else {
          db.notes._archived.delete(id);
        }
      }
    }),
    moveToTrash: vi.fn(async (...ids: string[]) => {
      for (const id of ids) db.notes._archived.delete(id);
    })
  }
};

vi.mock("@/platform/bootstrap", () => ({
  getCurrentContext: () => "local",
  getDatabase: () => db,
  bootstrap: vi.fn()
}));

function note(p: Partial<FakeNote> & Pick<FakeNote, "id">): FakeNote {
  return {
    id: p.id,
    title: p.title ?? "Untitled",
    headline: p.headline,
    dateEdited: p.dateEdited ?? 1000,
    dateCreated: p.dateCreated ?? 900
  };
}

describe("useArchiveStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    db.notes._archived.clear();
    db.notes.archived.items.mockClear();
    db.notes.archived.ids.mockClear();
    db.notes.archive.mockClear();
    db.notes.moveToTrash.mockClear();
  });

  it("starts empty", () => {
    const a = useArchiveStore();
    expect(a.items).toEqual([]);
    expect(a.count).toBe(0);
  });

  it("load maps archived notes with the Untitled fallback + defaults", async () => {
    db.notes._archived.set("a", note({ id: "a", title: "A", headline: "h", dateEdited: 5000, dateCreated: 4000 }));
    db.notes._archived.set("b", note({ id: "b", /* no title → Untitled */ dateEdited: 3000 }));
    const a = useArchiveStore();
    await a.load();
    expect(a.items).toHaveLength(2);
    expect(a.items.find((i) => i.id === "a")).toEqual({
      id: "a", title: "A", headline: "h", dateEdited: 5000, dateCreated: 4000
    });
    expect(a.items.find((i) => i.id === "b")).toEqual({
      id: "b", title: "Untitled", headline: "", dateEdited: 3000, dateCreated: 900
    });
    expect(a.count).toBe(2);
  });

  it("unarchive calls db.notes.archive(false, ...ids) + reloads", async () => {
    db.notes._archived.set("a", note({ id: "a", title: "A" }));
    db.notes._archived.set("b", note({ id: "b", title: "B" }));
    const a = useArchiveStore();
    await a.load();
    await a.unarchive(["a"]);
    expect(db.notes.archive).toHaveBeenCalledWith(false, "a");
    expect(a.items.map((i) => i.id)).toEqual(["b"]);
  });

  it("moveToTrash calls db.notes.moveToTrash(...ids) + reloads", async () => {
    db.notes._archived.set("a", note({ id: "a", title: "A" }));
    const a = useArchiveStore();
    await a.load();
    await a.moveToTrash(["a"]);
    expect(db.notes.moveToTrash).toHaveBeenCalledWith("a");
    expect(a.items).toEqual([]);
    expect(a.count).toBe(0);
  });

  it("unarchive / moveToTrash with no ids is a no-op (no db call)", async () => {
    const a = useArchiveStore();
    await a.unarchive([]);
    await a.moveToTrash([]);
    expect(db.notes.archive).not.toHaveBeenCalled();
    expect(db.notes.moveToTrash).not.toHaveBeenCalled();
  });

  it("load failure leaves the previous list intact (never throws)", async () => {
    db.notes._archived.set("a", note({ id: "a", title: "A" }));
    const a = useArchiveStore();
    await a.load();
    expect(a.count).toBe(1);
    const itemsSpy = db.notes.archived.items;
    itemsSpy.mockRejectedValueOnce(new Error("boom"));
    await a.load();
    expect(a.count).toBe(1); // unchanged
    itemsSpy.mockRestore();
  });

  it("unarchive failure never throws (logs + leaves list intact)", async () => {
    db.notes._archived.set("a", note({ id: "a", title: "A" }));
    const a = useArchiveStore();
    await a.load();
    db.notes.archive.mockRejectedValueOnce(new Error("boom"));
    await expect(a.unarchive(["a"])).resolves.toBeUndefined();
    expect(a.count).toBe(1); // reload never ran, previous list intact
  });
});