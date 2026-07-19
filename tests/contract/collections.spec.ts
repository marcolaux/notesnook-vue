// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  sortCollections,
  toNotebookListItem,
  toTagListItem,
  DEFAULT_COLLECTION_SORT_KEY,
  DEFAULT_COLLECTION_SORT_DIR
} from "@/utils/collections";
import { useCollectionsStore } from "@/stores/collections";
import type { Notebook, Tag } from "@notesnook-vue/contracts";

// `collections.ts` imports `getDatabase` from the platform bootstrap; stub it
// so the sodium/crypto/bridge graph isn't loaded for a pure store-logic test.
// The fake db is per-test controllable via `mockDb`.
let mockDb: {
  notebooks: { all: { items: () => Promise<Notebook[]> } };
  tags: { all: { items: () => Promise<Tag[]> } };
  trash: { all: () => Promise<unknown[]> };
};
vi.mock("@/platform/bootstrap", () => ({
  getDatabase: () => mockDb,
  bootstrap: vi.fn()
}));

function nb(p: Partial<Notebook> & Pick<Notebook, "id" | "title">): Notebook {
  return {
    id: p.id,
    type: "notebook",
    title: p.title,
    description: p.description,
    dateCreated: p.dateCreated ?? 0,
    dateModified: p.dateModified ?? 0,
    dateDeleted: null,
    pinned: p.pinned ?? false,
    itemType: null,
    deletedBy: null
  } as Notebook;
}

function tag(p: Partial<Tag> & Pick<Tag, "id" | "title">): Tag {
  return {
    id: p.id,
    type: "tag",
    title: p.title,
    dateCreated: p.dateCreated ?? 0,
    dateModified: p.dateModified ?? 0,
    dateDeleted: null
  } as Tag;
}

const NOTEBOOKS: Notebook[] = [
  nb({ id: "a", title: "Alpha", dateCreated: 100, dateModified: 300 }),
  nb({ id: "b", title: "Beta", dateCreated: 200, dateModified: 200, pinned: true }),
  nb({ id: "c", title: "Gamma", dateCreated: 300, dateModified: 100 })
];

const TAGS: Tag[] = [
  tag({ id: "t1", title: "work", dateCreated: 10, dateModified: 30 }),
  tag({ id: "t2", title: "home", dateCreated: 20, dateModified: 20 }),
  tag({ id: "t3", title: "Personal", dateCreated: 30, dateModified: 10 })
];

beforeEach(() => {
  setActivePinia(createPinia());
  mockDb = {
    notebooks: { all: { items: async () => NOTEBOOKS } },
    tags: { all: { items: async () => TAGS } },
    trash: { all: async () => [{ id: "x" }, { id: "y" }] }
  };
});

describe("sortCollections", () => {
  it("default sort key/dir are dateModified/desc", () => {
    expect(DEFAULT_COLLECTION_SORT_KEY).toBe("dateModified");
    expect(DEFAULT_COLLECTION_SORT_DIR).toBe("desc");
  });

  it("pinned-first regardless of sort key/direction", () => {
    // b is pinned → on top in both directions; below it the comparator runs.
    expect(sortCollections(NOTEBOOKS, "dateModified", "asc").map((n) => n.id)).toEqual([
      "b",
      "c",
      "a"
    ]); // b pinned, then dateModified asc: c(100), a(300)
    expect(sortCollections(NOTEBOOKS, "title", "desc").map((n) => n.id)).toEqual([
      "b",
      "c",
      "a"
    ]); // b pinned, then title desc: Gamma(c), Alpha(a)
  });

  it("sorts by dateModified asc/desc within the unpinned group", () => {
    expect(sortCollections(NOTEBOOKS, "dateModified", "asc").map((n) => n.id)).toEqual([
      "b",
      "c",
      "a"
    ]); // pinned b, then c(100) < a(300)
    expect(sortCollections(NOTEBOOKS, "dateModified", "desc").map((n) => n.id)).toEqual([
      "b",
      "a",
      "c"
    ]); // pinned b, then a(300) > c(100)
  });

  it("sorts by dateCreated", () => {
    // dateCreated: a=100, b=200(pinned), c=300 → asc (pinned first, then a, c)
    expect(sortCollections(NOTEBOOKS, "dateCreated", "asc").map((n) => n.id)).toEqual([
      "b",
      "a",
      "c"
    ]);
  });

  it("sorts by title (locale-aware, case-insensitive, numeric)", () => {
    // pinned b, then Alpha(a) < Gamma(c)
    expect(sortCollections(NOTEBOOKS, "title", "asc").map((n) => n.id)).toEqual([
      "b",
      "a",
      "c"
    ]);
  });

  it("does not mutate the input", () => {
    const copy = [...NOTEBOOKS].map((n) => ({ ...n }));
    sortCollections(NOTEBOOKS, "dateModified", "desc");
    expect(NOTEBOOKS.map((n) => n.id)).toEqual(copy.map((n) => n.id));
  });

  it("is a no-op for pinned-first when items have no pinned (tags)", () => {
    // tags: work(t1), home(t2), Personal(t3) — sensitivity:base is
    // case-insensitive, so asc → home, Personal, work.
    expect(sortCollections(TAGS, "title", "asc").map((t) => t.id)).toEqual([
      "t2",
      "t3",
      "t1"
    ]);
  });
});

describe("mappers", () => {
  it("toNotebookListItem maps the slim shape + defaults", () => {
    const item = toNotebookListItem(
      nb({ id: "x", title: "X", description: "d", pinned: true, dateModified: 9 })
    );
    expect(item).toEqual({
      id: "x",
      title: "X",
      description: "d",
      dateCreated: 0,
      dateModified: 9,
      pinned: true
    });
  });

  it("toNotebookListItem falls back to Untitled + empty description", () => {
    const item = toNotebookListItem(nb({ id: "x", title: "" }));
    expect(item.title).toBe("Untitled");
    expect(item.description).toBe("");
  });

  it("toTagListItem maps the slim shape", () => {
    const item = toTagListItem(tag({ id: "t", title: "work", dateCreated: 5, dateModified: 7 }));
    expect(item).toEqual({ id: "t", title: "work", dateCreated: 5, dateModified: 7 });
  });
});

describe("collections store", () => {
  it("load() fetches notebooks, tags and trash count in parallel", async () => {
    const c = useCollectionsStore();
    await c.load();
    expect(c.notebooks.map((n) => n.id)).toEqual(["a", "b", "c"]);
    expect(c.tags.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
    expect(c.trashCount).toBe(2);
  });

  it("sortedNotebooks is pinned-first + dateEdited desc by default", () => {
    const c = useCollectionsStore();
    // set raw (unsorted) order directly to test the computed
    c.notebooks = NOTEBOOKS.map(toNotebookListItem);
    expect(c.sortedNotebooks.map((n) => n.id)).toEqual(["b", "a", "c"]);
  });

  it("sortedTags follows the sort key/dir", () => {
    const c = useCollectionsStore();
    c.tags = TAGS.map(toTagListItem);
    c.setSortKey("title");
    c.setSortDir("asc");
    // sensitivity:base case-insensitive asc: home, Personal, work
    expect(c.sortedTags.map((t) => t.id)).toEqual(["t2", "t3", "t1"]);
  });

  it("toggleSection flips collapse state per section", () => {
    const c = useCollectionsStore();
    expect(c.collapsed.notebooks).toBe(false);
    c.toggleSection("notebooks");
    expect(c.collapsed.notebooks).toBe(true);
    expect(c.collapsed.tags).toBe(false); // independent
    c.toggleSection("tags");
    expect(c.collapsed.tags).toBe(true);
  });

  it("select / clearSelection manage the selected collection", () => {
    const c = useCollectionsStore();
    expect(c.selected).toBeNull();
    c.select("notebook", "a");
    expect(c.selected).toEqual({ type: "notebook", id: "a" });
    c.select("tag", "t1");
    expect(c.selected).toEqual({ type: "tag", id: "t1" });
    c.clearSelection();
    expect(c.selected).toBeNull();
  });

  it("load tolerates a thrown collection fetch (defensive .catch)", async () => {
    mockDb.notebooks = { all: { items: async () => Promise.reject(new Error("boom")) } };
    const c = useCollectionsStore();
    await c.load();
    expect(c.notebooks).toEqual([]);
    expect(c.tags.map((t) => t.id)).toEqual(["t1", "t2", "t3"]); // others still load
  });
});