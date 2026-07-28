// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  sortCollections,
  toNotebookListItem,
  toTagListItem,
  buildTagTree,
  DEFAULT_COLLECTION_SORT_KEY,
  DEFAULT_COLLECTION_SORT_DIR
} from "@/utils/collections";
import { useCollectionsStore } from "@/stores/collections";
import type { Notebook, Tag } from "@notesnook-vue/contracts";

// `collections.ts` imports `getDatabase` from the platform bootstrap; stub it
// so the sodium/crypto/bridge graph isn't loaded for a pure store-logic test.
// The fake db is per-test controllable via `mockDb`.
type ItemRef = { type: "notebook" | "tag"; id: string };
let mockDb: {
  notebooks: {
    all: { items: () => Promise<Notebook[]> };
    roots: { items: () => Promise<Notebook[]> };
    add: (arg: Partial<Notebook>) => Promise<string>;
  };
  tags: { all: { items: () => Promise<Tag[]> }; add: (arg: Partial<Tag>) => Promise<string> };
  trash: { all: () => Promise<unknown[]> };
  notes: { archived: { ids: () => Promise<string[]> } };
  relations: {
    from: (ref: ItemRef, type: "notebook") => { resolve: () => Promise<Notebook[]> };
    add: (from: ItemRef, to: ItemRef) => Promise<void>;
  };
  // backing map for parent→child sub-notebook relations.
  _childMap: Map<string, Notebook[]>;
  // backing list for all notebooks (so createSubNotebook's all-items reload sees new ids).
  _all: Notebook[];
  _roots: Notebook[];
  // backing list for all tags (so createSubTag's reload sees the new tag).
  _tags: Tag[];
};
vi.mock("@/platform/bootstrap", () => ({
  getCurrentContext: () => "local",
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
    _all: [...NOTEBOOKS],
    _roots: [...NOTEBOOKS],
    _childMap: new Map<string, Notebook[]>(),
    _tags: [...TAGS],
    notebooks: {
      all: { items: async () => mockDb._all },
      roots: { items: async () => mockDb._roots },
      add: vi.fn(async (arg: Partial<Notebook>) => {
        const id = arg.id ?? `nb-${mockDb._all.length + 1}`;
        const created = nb({ id, title: arg.title ?? "Untitled", dateCreated: 999, dateModified: 999 });
        mockDb._all = [...mockDb._all, created];
        if (mockDb._all.length === mockDb._roots.length + 1) {
          // a freshly added notebook is a root unless linked as a child below.
        }
        return id;
      })
    },
    tags: {
      all: { items: async () => mockDb._tags },
      add: vi.fn(async (arg: Partial<Tag>) => {
        // Upsert-by-id (core's rename path): if `id` matches an existing tag,
        // update its title in place; otherwise append a new tag.
        if (arg.id && mockDb._tags.some((t) => t.id === arg.id)) {
          mockDb._tags = mockDb._tags.map((t) =>
            t.id === arg.id ? { ...t, title: arg.title ?? t.title } : t
          );
          return arg.id;
        }
        const id = arg.id ?? `t-new-${mockDb._tags.length + 1}`;
        const created = tag({ id, title: arg.title ?? "Untitled", dateCreated: 0, dateModified: 0 });
        mockDb._tags = [...mockDb._tags, created];
        return id;
      })
    },
    trash: { all: async () => [{ id: "x" }, { id: "y" }] },
    notes: { archived: { ids: async () => [] } },
    relations: {
      from: (ref: ItemRef, type: "notebook") => ({
        resolve: async () =>
          type === "notebook" ? (mockDb._childMap.get(ref.id) ?? []) : []
      }),
      add: vi.fn(async (from: ItemRef, to: ItemRef) => {
        if (from.type === "notebook" && to.type === "notebook") {
          const parent = mockDb._all.find((n) => n.id === from.id);
          const child = mockDb._all.find((n) => n.id === to.id);
          if (parent && child) {
            mockDb._childMap.set(from.id, [...(mockDb._childMap.get(from.id) ?? []), child]);
            // a linked child is no longer a root.
            mockDb._roots = mockDb._roots.filter((n) => n.id !== to.id);
          }
        }
      })
    }
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
    mockDb.notebooks = {
      all: { items: async () => Promise.reject(new Error("boom")) },
      roots: { items: async () => [] },
      add: vi.fn(async () => "nb-new")
    };
    const c = useCollectionsStore();
    await c.load();
    expect(c.notebooks).toEqual([]);
    expect(c.tags.map((t) => t.id)).toEqual(["t1", "t2", "t3"]); // others still load
  });

  it("createNotebook adds a notebook, reloads, and returns the new id", async () => {
    const c = useCollectionsStore();
    await c.load();
    const addSpy = mockDb.notebooks.add as unknown as { mock: { calls: unknown[][] } };
    const id = await c.createNotebook();
    expect(id).toBeTruthy();
    expect(addSpy.mock.calls).toHaveLength(1);
    expect(addSpy.mock.calls[0]?.[0]).toEqual({ title: "New notebook" });
    // reload ran: the new notebook is now in the all-list.
    expect(c.notebooks.map((n) => n.id)).toContain(id);
  });

  it("createNotebook never throws + returns null on db failure", async () => {
    mockDb.notebooks.add = async () => {
      throw new Error("nope");
    };
    const c = useCollectionsStore();
    await expect(c.createNotebook()).resolves.toBeNull();
  });
});

describe("sub-notebooks (nested notebooks via db.relations)", () => {
  it("buildNotebookTree nests roots + sorted children; leaves get []", async () => {
    const c = useCollectionsStore();
    c.setSortKey("title");
    c.setSortDir("asc");
    await c.load();
    mockDb._childMap.set("a", [
      nb({ id: "a2", title: "Zeta", dateCreated: 1, dateModified: 1 }),
      nb({ id: "a1", title: "Alpha", dateCreated: 2, dateModified: 2 })
    ]);
    await c.loadChildren("a");
    const tree = c.treeNotebooks;
    // roots sorted by title asc: Alpha(a), Beta(b), Gamma(c) (b pinned-first)
    expect(tree.map((n) => n.item.id)).toEqual(["b", "a", "c"]);
    const aNode = tree.find((n) => n.item.id === "a");
    expect(aNode?.children.map((n) => n.item.id)).toEqual(["a1", "a2"]); // title asc
    expect(aNode?.children[0]?.children).toEqual([]); // leaf
  });

  it("load() populates roots (top-level) + all notebooks", async () => {
    mockDb._roots = [nb({ id: "a", title: "Alpha", dateCreated: 100, dateModified: 300 })];
    mockDb._all = [
      nb({ id: "a", title: "Alpha", dateCreated: 100, dateModified: 300 }),
      nb({ id: "a1", title: "Child", dateCreated: 1, dateModified: 1 })
    ];
    const c = useCollectionsStore();
    await c.load();
    expect(c.roots.map((n) => n.id)).toEqual(["a"]);
    expect(c.notebooks.map((n) => n.id)).toEqual(["a", "a1"]);
    expect(c.notebookCount).toBe(2);
    // tree shows only roots until children are loaded.
    expect(c.treeNotebooks.map((n) => n.item.id)).toEqual(["a"]);
    expect(c.treeNotebooks[0].children).toEqual([]);
  });

  it("loadChildren reads children via db.relations.from(...).resolve()", async () => {
    const c = useCollectionsStore();
    await c.load();
    mockDb._childMap.set("a", [nb({ id: "a1", title: "Child", dateCreated: 1, dateModified: 1 })]);
    await c.loadChildren("a");
    expect(c.children["a"]?.map((n) => n.id)).toEqual(["a1"]);
  });

  it("loadChildren never throws + leaves previous children on failure", async () => {
    const c = useCollectionsStore();
    await c.load();
    mockDb._childMap.set("a", [nb({ id: "a1", title: "Child", dateCreated: 1, dateModified: 1 })]);
    await c.loadChildren("a");
    expect(c.children["a"]).toHaveLength(1);
    // force relations.from to reject
    mockDb.relations.from = () => ({ resolve: async () => Promise.reject(new Error("db down")) });
    await c.loadChildren("a");
    expect(c.children["a"]).toHaveLength(1); // previous list intact
  });

  it("toggleExpand loads children on first expand then flips", async () => {
    const c = useCollectionsStore();
    await c.load();
    mockDb._childMap.set("a", [nb({ id: "a1", title: "Child", dateCreated: 1, dateModified: 1 })]);
    expect(c.expanded.has("a")).toBe(false);
    await c.toggleExpand("a");
    expect(c.children["a"]).toBeDefined();
    expect(c.expanded.has("a")).toBe(true);
    await c.toggleExpand("a");
    expect(c.expanded.has("a")).toBe(false);
    // children already loaded — not reloaded, but still present.
    expect(c.children["a"]).toBeDefined();
  });

  it("createSubNotebook adds notebook + parent→child relation + reloads children + expands", async () => {
    const c = useCollectionsStore();
    await c.load();
    const id = await c.createSubNotebook("a");
    expect(id).toBeTruthy();
    expect(mockDb.relations.add).toHaveBeenCalledWith(
      { type: "notebook", id: "a" },
      { type: "notebook", id: id }
    );
    expect(c.children["a"]?.some((n) => n.id === id)).toBe(true);
    expect(c.expanded.has("a")).toBe(true); // auto-expanded
    expect(c.notebooks.some((n) => n.id === id)).toBe(true); // all-list refreshed
  });

  it("createSubNotebook never throws + returns null on db failure", async () => {
    const c = useCollectionsStore();
    await c.load();
    mockDb.notebooks.add = async () => {
      throw new Error("nope");
    };
    await expect(c.createSubNotebook("a")).resolves.toBeNull();
  });

  it("createSubTag adds a tag titled <parent>/New tag, reloads + expands the parent", async () => {
    const c = useCollectionsStore();
    await c.load();
    const id = await c.createSubTag("task");
    expect(id).toBeTruthy();
    expect(mockDb.tags.add).toHaveBeenCalledWith({ title: "task/New tag" });
    // the new tag is now in the loaded list + the parent is expanded.
    expect(c.tags.some((t) => t.title === "task/New tag")).toBe(true);
    expect(c.expandedTags.has("task")).toBe(true);
  });

  it("createSubTag avoids a duplicate title by appending a numeric suffix", async () => {
    const c = useCollectionsStore();
    await c.load();
    // Seed an existing `task/New tag` so the next `+` must disambiguate.
    mockDb._tags = [...mockDb._tags, tag({ id: "existing", title: "task/New tag", dateCreated: 0, dateModified: 0 })];
    await c.load();
    await c.createSubTag("task");
    expect(mockDb.tags.add).toHaveBeenCalledWith({ title: "task/New tag 2" });
    expect(c.tags.some((t) => t.title === "task/New tag 2")).toBe(true);
  });

  it("createSubTag never throws + returns null on db failure", async () => {
    const c = useCollectionsStore();
    await c.load();
    mockDb.tags.add = async () => {
      throw new Error("nope");
    };
    await expect(c.createSubTag("task")).resolves.toBeNull();
  });

  it("renameTag preserves the parent prefix (the input is seeded with the leaf)", async () => {
    // The inline-rename input shows the LAST segment (`node.label`); committing
    // reconstructs the full title from the current prefix + the typed leaf, so
    // editing `task/todo`'s `todo` → `done` writes `task/done` (not `done`).
    const c = useCollectionsStore();
    mockDb._tags = [
      tag({ id: "t_todo", title: "task/todo", dateCreated: 0, dateModified: 0 })
    ];
    await c.load();
    const ok = await c.renameTag("t_todo", "done");
    expect(ok).toBe(true);
    expect(mockDb.tags.add).toHaveBeenCalledWith({ id: "t_todo", title: "task/done" });
    expect(c.tags.find((t) => t.id === "t_todo")?.title).toBe("task/done");
  });

  it("renameTag on a top-level tag writes the leaf verbatim (no prefix)", async () => {
    const c = useCollectionsStore();
    mockDb._tags = [tag({ id: "t1", title: "work", dateCreated: 0, dateModified: 0 })];
    await c.load();
    const ok = await c.renameTag("t1", "personal");
    expect(ok).toBe(true);
    expect(mockDb.tags.add).toHaveBeenCalledWith({ id: "t1", title: "personal" });
    expect(c.tags.find((t) => t.id === "t1")?.title).toBe("personal");
  });

  it("renameTag lets a leaf with a `/` push the tag deeper", async () => {
    const c = useCollectionsStore();
    mockDb._tags = [tag({ id: "t_todo", title: "task/todo", dateCreated: 0, dateModified: 0 })];
    await c.load();
    await c.renameTag("t_todo", "todo/now");
    expect(mockDb.tags.add).toHaveBeenCalledWith({ id: "t_todo", title: "task/todo/now" });
  });

  it("createNotebook creates a root notebook + enters inline-rename", async () => {
    const c = useCollectionsStore();
    await c.load();
    const id = await c.createNotebook();
    expect(id).toBeTruthy();
    expect(c.notebooks.some((n) => n.title === "New notebook")).toBe(true);
    expect(c.renaming).toEqual({ kind: "notebook", id, text: "New notebook" });
  });

  it("createSubNotebook creates a child + expands the parent + enters rename", async () => {
    const c = useCollectionsStore();
    await c.load();
    const id = await c.createSubNotebook("a");
    expect(id).toBeTruthy();
    expect(c.expanded.has("a")).toBe(true);
    expect(c.children["a"]?.some((n) => n.id === id)).toBe(true);
    expect(c.renaming).toEqual({ kind: "notebook", id, text: "New notebook" });
  });

  it("createTag creates a top-level tag + enters inline-rename (leaf seed)", async () => {
    const c = useCollectionsStore();
    await c.load();
    const id = await c.createTag();
    expect(id).toBeTruthy();
    expect(mockDb.tags.add).toHaveBeenCalledWith({ title: "New tag" });
    expect(c.tags.some((t) => t.title === "New tag")).toBe(true);
    expect(c.renaming).toEqual({ kind: "tag", id, text: "New tag" });
  });

  it("createTag avoids a duplicate title + still enters rename", async () => {
    const c = useCollectionsStore();
    mockDb._tags = [...mockDb._tags, tag({ id: "existing", title: "New tag", dateCreated: 0, dateModified: 0 })];
    await c.load();
    const id = await c.createTag();
    expect(mockDb.tags.add).toHaveBeenCalledWith({ title: "New tag 2" });
    expect(c.renaming).toEqual({ kind: "tag", id, text: "New tag 2" });
  });

  it("createSubTag creates the child + expands the parent + enters rename (leaf seed)", async () => {
    const c = useCollectionsStore();
    await c.load();
    const id = await c.createSubTag("task");
    expect(id).toBeTruthy();
    expect(mockDb.tags.add).toHaveBeenCalledWith({ title: "task/New tag" });
    expect(c.expandedTags.has("task")).toBe(true);
    // rename seeded with the LEAF, so the user names just the segment.
    expect(c.renaming).toEqual({ kind: "tag", id, text: "New tag" });
  });
});

describe("buildTagTree", () => {
  // Tags with a `/` in the title nest by prefix; a prefix with no real tag of
  // its own becomes a grouping-only node (`tag: null`).
  const tags = [
    toTagListItem(tag({ id: "t_todo", title: "task/todo", dateCreated: 10, dateModified: 30 })),
    toTagListItem(tag({ id: "t_done", title: "task/done", dateCreated: 20, dateModified: 20 })),
    toTagListItem(tag({ id: "t_inbox", title: "inbox", dateCreated: 30, dateModified: 10 })),
    toTagListItem(tag({ id: "t_deep", title: "task/todo/now", dateCreated: 40, dateModified: 5 }))
  ];

  it("nests slash titles under a grouping-only parent and leaves flat tags as roots", () => {
    const tree = buildTagTree(tags, "title", "asc");
    // Top-level nodes: "inbox" (leaf) and "task" (grouping-only parent).
    const top = tree.map((n) => n.path);
    expect(top).toEqual(["inbox", "task"]); // title asc
    const inbox = tree.find((n) => n.path === "inbox")!;
    expect(inbox.tag?.id).toBe("t_inbox");
    expect(inbox.children).toEqual([]);
    const task = tree.find((n) => n.path === "task")!;
    expect(task.tag).toBeNull(); // no real "task" tag → grouping-only
    expect(task.children.map((c) => c.path)).toEqual(["task/done", "task/todo"]); // asc
  });

  it("nests deeper paths recursively (task › todo › now)", () => {
    const tree = buildTagTree(tags, "title", "asc");
    const todo = tree.find((n) => n.path === "task")!.children.find((c) => c.path === "task/todo")!;
    expect(todo.tag?.id).toBe("t_todo");
    expect(todo.children.map((c) => c.path)).toEqual(["task/todo/now"]);
    expect(todo.children[0].tag?.id).toBe("t_deep");
  });

  it("a real tag at a parent path carries its tag AND its children", () => {
    const withRoot = [
      ...tags,
      toTagListItem(tag({ id: "t_task", title: "task", dateCreated: 1, dateModified: 99 }))
    ];
    const tree = buildTagTree(withRoot, "title", "asc");
    const task = tree.find((n) => n.path === "task")!;
    expect(task.tag?.id).toBe("t_task"); // real parent
    expect(task.children.map((c) => c.path)).toEqual(["task/done", "task/todo"]);
  });

  it("a grouping-only node derives its dateModified from the most-recent descendant", () => {
    const tree = buildTagTree(tags, "dateModified", "desc");
    const task = tree.find((n) => n.path === "task")!;
    // descendants: todo(30), done(20), now(5) → max 30
    expect(task.dateModified).toBe(30);
    expect(task.tag).toBeNull();
  });
});