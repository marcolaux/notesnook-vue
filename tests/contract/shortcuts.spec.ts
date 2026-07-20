// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  buildShortcutInput,
  sortShortcutsByCreated,
  toResolvedShortcut,
  SHORTCUT_ITEM_TYPES,
  type ShortcutInput
} from "@/utils/shortcuts";
import { useShortcutsStore } from "@/stores/shortcuts";
import type { Shortcut, Notebook, Tag } from "@notesnook-vue/contracts";

// In-memory fake db.shortcuts: a Map<itemId, Shortcut> backs the sync `all` /
// `shortcut(id)` / `exists(id)`; `add` upserts by itemId (id = itemId, throws
// without itemId/itemType like core); `remove` soft-deletes; `resolved(type)`
// returns the matching Notebook[]/Tag[] in shortcut dateCreated order, backed
// by `db.notebooks.all.items(ids)` + `db.tags.all.items(ids)`.
let clock = 1_000_000;
const now = () => clock;

function fakeShortcut(p: { itemId: string; itemType: "notebook" | "tag"; dateCreated?: number }): Shortcut {
  return {
    id: p.itemId,
    type: "shortcut",
    dateCreated: p.dateCreated ?? now(),
    dateModified: p.dateCreated ?? now(),
    itemId: p.itemId,
    itemType: p.itemType,
    sortIndex: -1
  } as Shortcut;
}
function fakeNotebook(id: string, title: string): Notebook {
  return { id, type: "notebook", title, dateCreated: 1, dateModified: 1 } as Notebook;
}
function fakeTag(id: string, title: string): Tag {
  return { id, type: "tag", title, dateCreated: 1, dateModified: 1 } as Tag;
}

const db = {
  _notebooks: new Map<string, Notebook>(),
  _tags: new Map<string, Tag>(),
  shortcuts: {
    _store: new Map<string, Shortcut>(),
    get all(): Shortcut[] {
      return Array.from(db.shortcuts._store.values());
    },
    shortcut: vi.fn((id: string) => db.shortcuts._store.get(id)),
    exists: vi.fn((id: string) => db.shortcuts._store.has(id)),
    add: vi.fn(async (input: Partial<Shortcut>) => {
      if (!input) return;
      if (input.remote) throw new Error("Please use db.shortcuts.merge to merge remote shortcuts.");
      if (input.itemId && input.itemType && !SHORTCUT_ITEM_TYPES.includes(input.itemType as never))
        throw new Error("Cannot create a shortcut for this type of item.");
      const old = input.itemId
        ? db.shortcuts._store.get(input.itemId)
        : input.id
          ? db.shortcuts._store.get(input.id)
          : undefined;
      const merged = { ...(old ?? {}), ...input };
      if (!merged.itemId || !merged.itemType)
        throw new Error("Cannot create a shortcut without an item.");
      const id = merged.itemId;
      db.shortcuts._store.set(
        id,
        fakeShortcut({
          itemId: merged.itemId,
          itemType: merged.itemType as "notebook" | "tag",
          dateCreated: old?.dateCreated ?? now()
        })
      );
      return id;
    }),
    remove: vi.fn(async (...ids: string[]) => {
      for (const id of ids) db.shortcuts._store.delete(id);
    }),
    resolved: vi.fn(async (type: "all" | "notebooks" | "tags" = "all") => {
      const nbIds: string[] = [];
      const tagIds: string[] = [];
      for (const s of db.shortcuts.all.sort((a, b) => a.dateCreated - b.dateCreated)) {
        if ((type === "all" || type === "notebooks") && s.itemType === "notebook") nbIds.push(s.itemId);
        else if ((type === "all" || type === "tags") && s.itemType === "tag") tagIds.push(s.itemId);
      }
      const notebooks = nbIds.map((id) => db._notebooks.get(id)).filter(Boolean) as Notebook[];
      const tags = tagIds.map((id) => db._tags.get(id)).filter(Boolean) as Tag[];
      // resolved() yields items in shortcut dateCreated order; for "all" push
      // the notebook or tag that matches each shortcut.
      const out: Array<Notebook | Tag> = [];
      for (const s of db.shortcuts.all.sort((a, b) => a.dateCreated - b.dateCreated)) {
        if (type === "all" || type === "notebooks") {
          const nb = notebooks.find((n) => n.id === s.itemId);
          if (nb && s.itemType === "notebook") out.push(nb);
        }
        if (type === "all" || type === "tags") {
          const tg = tags.find((t) => t.id === s.itemId);
          if (tg && s.itemType === "tag") out.push(tg);
        }
      }
      return out;
    })
  },
  notebooks: {
    all: {
      items: vi.fn(async (ids?: string[]): Promise<Notebook[]> => {
        if (ids) return ids.map((id) => db._notebooks.get(id)).filter(Boolean) as Notebook[];
        return Array.from(db._notebooks.values());
      })
    }
  },
  tags: {
    all: {
      items: vi.fn(async (ids?: string[]): Promise<Tag[]> => {
        if (ids) return ids.map((id) => db._tags.get(id)).filter(Boolean) as Tag[];
        return Array.from(db._tags.values());
      })
    }
  }
};
vi.mock("@/platform/bootstrap", () => ({
  getDatabase: () => db,
  bootstrap: vi.fn()
}));

describe("pure helpers", () => {
  it("SHORTCUT_ITEM_TYPES is the notebook+tag subset", () => {
    expect(SHORTCUT_ITEM_TYPES).toEqual(["notebook", "tag"]);
  });

  it("buildShortcutInput strips undefined keys (exactOptional-safe)", () => {
    const input: ShortcutInput = { itemId: "n1", itemType: "notebook", id: undefined };
    expect(buildShortcutInput(input)).toEqual({ itemId: "n1", itemType: "notebook" });
  });

  it("buildShortcutInput applies no defaults (core owns them)", () => {
    const out = buildShortcutInput({ itemId: "n1", itemType: "tag" });
    expect("dateCreated" in out).toBe(false);
  });

  it("toResolvedShortcut maps a notebook vs tag via the type discriminator", () => {
    expect(toResolvedShortcut(fakeNotebook("n1", "Work"))).toEqual({ id: "n1", title: "Work", type: "notebook" });
    expect(toResolvedShortcut(fakeTag("t1", "urgent"))).toEqual({ id: "t1", title: "urgent", type: "tag" });
    expect(toResolvedShortcut(fakeNotebook("n2", "")).title).toBe("Untitled");
  });

  it("sortShortcutsByCreated is dateCreated-ascending, non-mutating", () => {
    const a = fakeShortcut({ itemId: "a", itemType: "tag", dateCreated: 30 });
    const b = fakeShortcut({ itemId: "b", itemType: "tag", dateCreated: 10 });
    const c = fakeShortcut({ itemId: "c", itemType: "tag", dateCreated: 20 });
    const arr = [a, b, c];
    expect(sortShortcutsByCreated(arr).map((s) => s.itemId)).toEqual(["b", "c", "a"]);
    expect(arr.map((s) => s.itemId)).toEqual(["a", "b", "c"]);
  });
});

describe("useShortcutsStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    clock = 1_000_000;
    db.shortcuts._store.clear();
    db._notebooks.clear();
    db._tags.clear();
    db.shortcuts.shortcut.mockClear();
    db.shortcuts.exists.mockClear();
    db.shortcuts.add.mockClear();
    db.shortcuts.remove.mockClear();
    db.shortcuts.resolved.mockClear();
  });

  it("starts empty", () => {
    const s = useShortcutsStore();
    expect(s.items).toEqual([]);
    expect(s.resolved).toEqual([]);
    expect(s.shortcutIds.size).toBe(0);
    expect(s.lastError).toBeNull();
    expect(s.busy).toBe(false);
  });

  it("refresh loads raw shortcuts + resolved notebooks/tags in dateCreated order", async () => {
    db._notebooks.set("n1", fakeNotebook("n1", "Work"));
    db._tags.set("t1", fakeTag("t1", "urgent"));
    clock = 100;
    await db.shortcuts.add({ itemId: "n1", itemType: "notebook" });
    clock = 200;
    await db.shortcuts.add({ itemId: "t1", itemType: "tag" });
    db.shortcuts.add.mockClear();
    const s = useShortcutsStore();
    await s.refresh();
    expect(s.items.map((x) => x.itemId)).toEqual(["n1", "t1"]);
    expect(s.resolved).toEqual([
      { id: "n1", title: "Work", type: "notebook" },
      { id: "t1", title: "urgent", type: "tag" }
    ]);
    expect(s.shortcutIds.has("n1")).toBe(true);
    expect(s.loading).toBe(false);
  });

  it("add pins a notebook + reloads + returns the id (= itemId)", async () => {
    db._notebooks.set("n1", fakeNotebook("n1", "Work"));
    const s = useShortcutsStore();
    const id = await s.add("n1", "notebook");
    expect(db.shortcuts.add).toHaveBeenCalledWith(expect.objectContaining({ itemId: "n1", itemType: "notebook" }));
    expect(id).toBe("n1");
    expect(s.shortcutIds.has("n1")).toBe(true);
    expect(s.resolved.map((r) => r.id)).toContain("n1");
    expect(s.lastError).toBeNull();
  });

  it("add returns null + sets lastError when core rejects (no itemId)", async () => {
    db.shortcuts.add.mockRejectedValueOnce(new Error("Cannot create a shortcut without an item."));
    const s = useShortcutsStore();
    const id = await s.add("ghost", "notebook");
    expect(id).toBeNull();
    expect(s.lastError).toContain("without an item");
    expect(s.busy).toBe(false);
  });

  it("remove unpins by item id + reloads", async () => {
    db._notebooks.set("n1", fakeNotebook("n1", "Work"));
    const s = useShortcutsStore();
    await s.add("n1", "notebook");
    expect(s.shortcutIds.has("n1")).toBe(true);
    await s.remove("n1");
    expect(db.shortcuts.remove).toHaveBeenCalledWith("n1");
    expect(s.shortcutIds.has("n1")).toBe(false);
  });

  it("remove never throws + sets lastError when core rejects", async () => {
    db.shortcuts.remove.mockRejectedValueOnce(new Error("boom"));
    const s = useShortcutsStore();
    await s.remove("n1");
    expect(s.lastError).toBe("boom");
    expect(s.busy).toBe(false);
  });

  it("toggle pins when not a shortcut, unpins when it is", async () => {
    db._notebooks.set("n1", fakeNotebook("n1", "Work"));
    const s = useShortcutsStore();
    await s.toggle("n1", "notebook");
    expect(s.shortcutIds.has("n1")).toBe(true);
    expect(db.shortcuts.add).toHaveBeenCalled();
    db.shortcuts.add.mockClear();
    await s.toggle("n1", "notebook");
    expect(s.shortcutIds.has("n1")).toBe(false);
    expect(db.shortcuts.remove).toHaveBeenCalledWith("n1");
  });

  it("isShortcut is a sync membership check", async () => {
    db._tags.set("t1", fakeTag("t1", "x"));
    const s = useShortcutsStore();
    expect(s.isShortcut("t1")).toBe(false);
    await s.add("t1", "tag");
    expect(s.isShortcut("t1")).toBe(true);
  });

  it("refresh never throws + leaves previous state intact on failure", async () => {
    db._notebooks.set("n1", fakeNotebook("n1", "Work"));
    const s = useShortcutsStore();
    await s.add("n1", "notebook");
    expect(s.items).toHaveLength(1);
    db.shortcuts.resolved.mockRejectedValueOnce(new Error("db down"));
    await s.refresh();
    // raw `all` still loaded; resolved left as-is (previous value)
    expect(s.items).toHaveLength(1);
    expect(s.loading).toBe(false);
  });
});