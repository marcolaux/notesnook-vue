// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useNotesStore } from "@/stores/notes";
import type { NoteListItem } from "@/stores/notes";

// `notes.ts` imports `getDatabase` from the platform bootstrap; stub it so the
// sodium/crypto/bridge graph isn't loaded. The fake db is per-test controllable.
let mockDb: {
  notebooks: { notes: (id: string) => Promise<string[]> };
  relations: {
    to: (ref: unknown, type: unknown) => { resolve: () => Promise<{ id: string }[]> };
    from: (ref: unknown, type: unknown) => { resolve: () => Promise<{ id: string }[]> };
  };
};
vi.mock("@/platform/bootstrap", () => ({
  getDatabase: () => mockDb,
  bootstrap: vi.fn()
}));

function item(p: Partial<NoteListItem> & Pick<NoteListItem, "id" | "title">): NoteListItem {
  return {
    id: p.id,
    title: p.title,
    headline: p.headline ?? "",
    dateCreated: p.dateCreated ?? 0,
    dateEdited: p.dateEdited ?? p.dateCreated ?? 0,
    tags: p.tags ?? [],
    pinned: p.pinned ?? false,
    favorite: p.favorite ?? false
  };
}

const ALL: NoteListItem[] = [
  item({ id: "a", title: "Alpha", dateCreated: 100, dateEdited: 400 }),
  item({ id: "b", title: "Beta", dateCreated: 200, dateEdited: 300 }),
  item({ id: "c", title: "Gamma", dateCreated: 300, dateEdited: 200 }),
  item({ id: "d", title: "Delta", dateCreated: 400, dateEdited: 100 })
];

beforeEach(() => {
  setActivePinia(createPinia());
  mockDb = {
    notebooks: { notes: async () => [] },
    relations: {
      to: () => ({ resolve: async () => [] }),
      from: () => ({ resolve: async () => [] })
    }
  };
});

describe("notes store — collection filter", () => {
  it("filterByCollection('notebook') resolves noteIds via db.notebooks.notes", async () => {
    mockDb.notebooks.notes = async (id) => (id === "nb1" ? ["a", "b"] : []);
    const notes = useNotesStore();
    notes.items = ALL;
    await notes.filterByCollection("notebook", "nb1");
    expect(notes.collectionFilter).toEqual({
      type: "notebook",
      id: "nb1",
      noteIds: new Set(["a", "b"])
    });
  });

  it("filterByCollection('tag') resolves notes via db.relations.from().resolve()", async () => {
    // Tag→note relations are stored `from=tag, to=note`, so notes are resolved
    // from the tag's **from** side (not `.to`, which would look for tags on the
    // to side and always return empty).
    mockDb.relations.from = (ref: any, type: any) => {
      expect(type).toBe("note");
      expect(ref).toEqual({ type: "tag", id: "t1" });
      return { resolve: async () => [{ id: "c" }, { id: "d" }] };
    };
    const notes = useNotesStore();
    notes.items = ALL;
    await notes.filterByCollection("tag", "t1");
    expect(notes.collectionFilter).toEqual({
      type: "tag",
      id: "t1",
      noteIds: new Set(["c", "d"])
    });
  });

  it("filterByCollection('color') resolves notes via db.relations.from(color,'note')", async () => {
    // Color→note relations are stored `from=color, to=note` (same direction as
    // tag→note — see properties.setColor), so notes are resolved from the
    // color's `from` side.
    mockDb.relations.from = (ref: any, type: any) => {
      expect(type).toBe("note");
      expect(ref).toEqual({ type: "color", id: "red" });
      return { resolve: async () => [{ id: "a" }, { id: "d" }] };
    };
    const notes = useNotesStore();
    notes.items = ALL;
    await notes.filterByCollection("color", "red");
    expect(notes.collectionFilter).toEqual({
      type: "color",
      id: "red",
      noteIds: new Set(["a", "d"])
    });
  });

  it("visibleItems is restricted to the collection (and still sorted)", async () => {
    mockDb.notebooks.notes = async () => ["a", "b"];
    const notes = useNotesStore();
    notes.items = ALL;
    await notes.filterByCollection("notebook", "nb1");
    // default sort = dateEdited desc → b(300) before a(400)? desc → a(400), b(300)
    expect(notes.visibleItems.map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("the query filter still applies within the collection subset", async () => {
    mockDb.notebooks.notes = async () => ["a", "b"];
    const notes = useNotesStore();
    notes.items = ALL;
    await notes.filterByCollection("notebook", "nb1");
    notes.setQuery("beta");
    expect(notes.visibleItems.map((n) => n.id)).toEqual(["b"]);
  });

  it("clearCollectionFilter restores all notes", async () => {
    mockDb.notebooks.notes = async () => ["a", "b"];
    const notes = useNotesStore();
    notes.items = ALL;
    await notes.filterByCollection("notebook", "nb1");
    expect(notes.visibleItems.map((n) => n.id)).toEqual(["a", "b"]);
    notes.clearCollectionFilter();
    expect(notes.collectionFilter).toBeNull();
    // all four, dateEdited desc: a(400), b(300), c(200), d(100)
    expect(notes.visibleItems.map((n) => n.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("notes outside the collection are hidden even if they match the query", async () => {
    mockDb.notebooks.notes = async () => ["a"];
    const notes = useNotesStore();
    notes.items = ALL;
    await notes.filterByCollection("notebook", "nb1");
    notes.setQuery("a"); // would match Alpha(a) and Gamma? no — 'a' matches title substring
    // "a" matches Alpha, Gamma ("amma" has 'a'? plain filter is case-insensitive substring
    // over title+headline+tags → Alpha matches, Gamma contains 'a' too). But only 'a' is in
    // the collection, so only Alpha shows.
    expect(notes.visibleItems.map((n) => n.id)).toEqual(["a"]);
  });

  it("a notebook with no notes yields an empty list", async () => {
    mockDb.notebooks.notes = async () => [];
    const notes = useNotesStore();
    notes.items = ALL;
    await notes.filterByCollection("notebook", "empty");
    expect(notes.visibleItems).toEqual([]);
  });
});