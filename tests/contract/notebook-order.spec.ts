// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  sortCollections,
  buildNotebookTree,
  readNotebookOrder,
  writeNotebookOrder,
  clearNotebookOrder,
  NOTEBOOK_ORDER_KEY,
  type NotebookListItem
} from "@/utils/collections";
import { useCollectionsStore } from "@/stores/collections";
import type { Notebook } from "@notesnook-vue/contracts";

// Map-backed localStorage mock (node has none). Scoped to this file.
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}
let storage: MemStorage;

function nb(id: string, title: string, pinned = false): NotebookListItem {
  return { id, title, description: "", dateCreated: 1, dateModified: 1, pinned };
}

describe("sortCollections — manual order overlay (roots)", () => {
  it("applies order within the pinned group and within the non-pinned group", () => {
    const items = [
      nb("a", "A", true),
      nb("b", "B", true),
      nb("c", "C", false),
      nb("d", "D", false)
    ];
    // pinned-first always; within each group, manual order [b,a,d,c].
    const out = sortCollections(items, "title", "asc", ["b", "a", "d", "c"]);
    expect(out.map((x) => x.id)).toEqual(["b", "a", "d", "c"]);
  });

  it("pinned-first still wins over manual order", () => {
    const items = [nb("a", "A", false), nb("b", "B", true)];
    // manual order says a before b, but b is pinned → b floats to top.
    const out = sortCollections(items, "title", "asc", ["a", "b"]);
    expect(out.map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("unlisted items keep the column sort after listed ones", () => {
    const items = [nb("a", "A"), nb("b", "B"), nb("c", "C"), nb("d", "D")];
    // only c is listed → c first; a,b,d in title-asc after.
    const out = sortCollections(items, "title", "asc", ["c"]);
    expect(out.map((x) => x.id)).toEqual(["c", "a", "b", "d"]);
  });

  it("empty/absent order is a no-op (column sort wins)", () => {
    const items = [nb("b", "B"), nb("a", "A")];
    expect(sortCollections(items, "title", "asc", []).map((x) => x.id)).toEqual(["a", "b"]);
    expect(sortCollections(items, "title", "asc").map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("is non-mutating", () => {
    const items = [nb("a", "A"), nb("b", "B"), nb("c", "C")];
    sortCollections(items, "title", "asc", ["c", "b", "a"]);
    expect(items.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});

describe("buildNotebookTree — order applies to roots only", () => {
  it("roots follow the manual order; children keep the column sort", () => {
    const roots = [nb("r1", "Root1"), nb("r2", "Root2")];
    const childrenOf = new Map<string, NotebookListItem[]>([
      ["r1", [nb("c2", "Child2"), nb("c1", "Child1")]]
    ]);
    const tree = buildNotebookTree(roots, childrenOf, "title", "asc", ["r2", "r1"]);
    expect(tree.map((n) => n.item.id)).toEqual(["r2", "r1"]);
    // children sorted title-asc (order does NOT apply to children).
    expect(tree[1].children.map((c) => c.item.id)).toEqual(["c1", "c2"]);
  });
});

describe("localStorage notebook-order helpers", () => {
  beforeEach(() => {
    storage = new MemStorage();
    (globalThis as { localStorage?: MemStorage }).localStorage = storage;
  });

  it("readNotebookOrder returns [] on missing/unparseable storage", () => {
    expect(readNotebookOrder()).toEqual([]);
    storage.setItem(NOTEBOOK_ORDER_KEY, "{not json");
    expect(readNotebookOrder()).toEqual([]);
    storage.setItem(NOTEBOOK_ORDER_KEY, "[1,2,3]"); // non-string entries
    expect(readNotebookOrder()).toEqual([]);
  });

  it("writeNotebookOrder + readNotebookOrder round-trip", () => {
    writeNotebookOrder(["a", "b", "c"]);
    expect(readNotebookOrder()).toEqual(["a", "b", "c"]);
  });

  it("clearNotebookOrder removes the key", () => {
    writeNotebookOrder(["a", "b"]);
    clearNotebookOrder();
    expect(readNotebookOrder()).toEqual([]);
  });
});

// --- store integration ------------------------------------------------------
type Ref = { id: string; type: string };
let mockDb: {
  _nb: Map<string, Notebook>;
  _roots: string[];
  notebooks: {
    all: { items: () => Promise<Notebook[]> };
    roots: { items: () => Promise<Notebook[]> };
    add: (arg: Partial<Notebook>) => Promise<string>;
    remove: (...ids: string[]) => Promise<void>;
    pin: (state: boolean, ...ids: string[]) => Promise<void>;
    totalNotes: (id: string) => Promise<number>;
  };
  tags: {
    all: { items: () => Promise<Notebook[]> };
    add: (arg: Partial<Notebook> & { title: string }) => Promise<string>;
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

function fullNb(id: string, title: string, pinned = false): Notebook {
  return { id, type: "notebook", title, description: "", dateCreated: 1, dateModified: 1, pinned } as Notebook;
}

describe("useCollectionsStore — notebook manual order", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    storage = new MemStorage();
    (globalThis as { localStorage?: MemStorage }).localStorage = storage;
    mockDb = {
      _nb: new Map<string, Notebook>([
        ["n1", fullNb("n1", "Work")],
        ["n2", fullNb("n2", "Personal", true)],
        ["n3", fullNb("n3", "Ideas")]
      ]),
      _roots: ["n1", "n2", "n3"],
      notebooks: {
        all: { items: async () => Array.from(mockDb._nb.values()) },
        roots: { items: async () => mockDb._roots.map((id) => mockDb._nb.get(id)!) },
        add: vi.fn(),
        remove: vi.fn(),
        pin: vi.fn(),
        totalNotes: vi.fn(async () => 0)
      },
      tags: { all: { items: async () => [] }, add: vi.fn(), remove: vi.fn() },
      trash: { all: async () => [] },
      notes: { archived: { ids: async () => [] } },
      relations: {
        from: () => ({ resolve: async () => [] }),
        add: vi.fn(),
        to: () => ({ resolve: async () => [] })
      }
    };
  });

  it("load reads the stored order; treeNotebooks roots follow it (pinned-first)", async () => {
    writeNotebookOrder(["n3", "n1", "n2"]);
    const s = useCollectionsStore();
    await s.load();
    expect(s.notebookOrder).toEqual(["n3", "n1", "n2"]);
    // n2 is pinned → floats to top; among non-pinned, manual order [n3, n1].
    expect(s.treeNotebooks.map((n) => n.item.id)).toEqual(["n2", "n3", "n1"]);
  });

  it("no stored order → column sort (pinned-first + key/dir)", async () => {
    const s = useCollectionsStore();
    await s.load();
    expect(s.notebookOrder).toEqual([]);
    // default sort dateModified desc, all equal → stable-ish; n2 pinned first.
    const ids = s.treeNotebooks.map((n) => n.item.id);
    expect(ids[0]).toBe("n2");
  });

  it("moveNotebookTo reorders roots + persists to localStorage", async () => {
    const s = useCollectionsStore();
    await s.load();
    s.moveNotebookTo("n3", "n1", true); // n3 before n1
    expect(s.notebookOrder).toEqual(["n2", "n3", "n1"]);
    expect(readNotebookOrder()).toEqual(["n2", "n3", "n1"]);
    // n2 pinned → first; then manual [n3, n1].
    expect(s.treeNotebooks.map((n) => n.item.id)).toEqual(["n2", "n3", "n1"]);
  });

  it("moveNotebookTo with before=false inserts after the target", async () => {
    const s = useCollectionsStore();
    await s.load();
    s.moveNotebookTo("n3", "n1", false); // n3 after n1
    // displayed order before move: n2(pinned), n1, n3 → after: n2, n1, n3 (no visible change for n3)
    expect(s.notebookOrder).toEqual(["n2", "n1", "n3"]);
  });

  it("moveNotebookTo is a no-op when from === to", async () => {
    const s = useCollectionsStore();
    await s.load();
    s.moveNotebookTo("n1", "n1", true);
    expect(s.notebookOrder).toEqual([]);
  });

  it("resetNotebookOrder clears the persisted order", async () => {
    writeNotebookOrder(["n3", "n1", "n2"]);
    const s = useCollectionsStore();
    await s.load();
    expect(s.notebookOrder).toEqual(["n3", "n1", "n2"]);
    s.resetNotebookOrder();
    expect(s.notebookOrder).toEqual([]);
    expect(readNotebookOrder()).toEqual([]);
  });
});