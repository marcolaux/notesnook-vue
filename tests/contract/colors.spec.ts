// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  buildColorInput,
  sortColorsByTitle,
  toColorListItem,
  type ColorInput
} from "@/utils/colors";
import { useColorsStore } from "@/stores/colors";
import type { Color } from "@notesnook-vue/contracts";

// In-memory fake db.colors: a Map<id, Color> backs `all.items()` / `color(id)`;
// `find(code)` resolves by colorCode; `add` upserts (find existing by id or
// colorCode, update; else create) and throws on a missing title/colorCode like
// core; `remove` deletes; `count(id)` returns a seeded note-count per color.
let clock = 1_000_000;
const now = () => clock;

function fakeColor(p: Partial<Color> & Pick<Color, "id" | "title" | "colorCode">): Color {
  return {
    id: p.id,
    type: "color",
    dateCreated: p.dateCreated ?? now(),
    dateModified: p.dateModified ?? now(),
    title: p.title,
    colorCode: p.colorCode
  } as Color;
}

const db = {
  colors: {
    _store: new Map<string, Color>(),
    _counts: new Map<string, number>(),
    all: { items: vi.fn(async () => Array.from(db.colors._store.values())) },
    color: vi.fn(async (id: string) => db.colors._store.get(id)),
    find: vi.fn(async (code: string) => {
      for (const c of db.colors._store.values()) if (c.colorCode === code) return c;
      return undefined;
    }),
    add: vi.fn(async (input: Partial<Color>) => {
      const old = input.id
        ? db.colors._store.get(input.id)
        : input.colorCode
          ? await db.colors.find(input.colorCode)
          : undefined;
      if (!input.title && !old?.title) throw new Error("Title is required.");
      if (!input.colorCode && !old?.colorCode) throw new Error("Color code is required.");
      if (old) {
        Object.assign(old, {
          title: input.title ?? old.title,
          colorCode: input.colorCode ?? old.colorCode,
          dateModified: now()
        });
        return old.id;
      }
      const id = (input.id as string) || `c${db.colors._store.size + 1}`;
      db.colors._store.set(
        id,
        fakeColor({
          id,
          title: input.title ?? "",
          colorCode: input.colorCode ?? "",
          dateCreated: input.dateCreated
        })
      );
      return id;
    }),
    remove: vi.fn(async (...ids: string[]) => {
      for (const id of ids) db.colors._store.delete(id);
    }),
    count: vi.fn(async (id: string) => db.colors._counts.get(id) ?? 0)
  },
  // Upstream `db.settings` sidebar-order accessors for the colors section
  // (synced). Backed by an in-memory array; `getSideBarOrder` returns [] by
  // default (matching upstream's seeded default).
  settings: {
    _colorOrder: [] as string[],
    getSideBarOrder: vi.fn((section: string) =>
      section === "colors" ? db.settings._colorOrder : []
    ),
    setSideBarOrder: vi.fn(async (section: string, ids: string[]) => {
      if (section === "colors") db.settings._colorOrder = ids;
      return "id";
    })
  }
};
vi.mock("@/platform/bootstrap", () => ({
  getDatabase: () => db,
  bootstrap: vi.fn()
}));

describe("pure helpers", () => {
  it("buildColorInput strips undefined keys (exactOptional-safe)", () => {
    const input: ColorInput = { title: "Red", colorCode: "#f00", id: undefined };
    const out = buildColorInput(input);
    expect(out).toEqual({ title: "Red", colorCode: "#f00" });
    expect("id" in out).toBe(false);
  });

  it("buildColorInput carries an id-only patch", () => {
    expect(buildColorInput({ id: "c1" })).toEqual({ id: "c1" });
  });

  it("buildColorInput applies no defaults (core owns them)", () => {
    const out = buildColorInput({ title: "x", colorCode: "#000" });
    expect("dateCreated" in out).toBe(false);
  });

  it("toColorListItem maps with an Untitled fallback", () => {
    const c = fakeColor({ id: "c1", title: "", colorCode: "#f00" });
    expect(toColorListItem(c)).toEqual({ id: "c1", title: "Untitled", colorCode: "#f00" });
  });

  it("sortColorsByTitle is title-ascending, case-insensitive, non-mutating", () => {
    const a = fakeColor({ id: "a", title: "Banana", colorCode: "#1" });
    const b = fakeColor({ id: "b", title: "apple", colorCode: "#2" });
    const c = fakeColor({ id: "c", title: "Cherry", colorCode: "#3" });
    const arr = [a, b, c];
    const sorted = sortColorsByTitle(arr);
    expect(sorted.map((x) => x.id)).toEqual(["b", "a", "c"]);
    expect(arr.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});

describe("useColorsStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    clock = 1_000_000;
    db.colors._store.clear();
    db.colors._counts.clear();
    db.colors.all.items.mockClear();
    db.colors.color.mockClear();
    db.colors.find.mockClear();
    db.colors.add.mockClear();
    db.colors.remove.mockClear();
    db.colors.count.mockClear();
    db.settings._colorOrder = [];
    db.settings.getSideBarOrder.mockClear();
    db.settings.setSideBarOrder.mockClear();
  });

  it("starts empty", () => {
    const s = useColorsStore();
    expect(s.items).toEqual([]);
    expect(s.count).toBe(0);
    expect(s.lastError).toBeNull();
    expect(s.busy).toBe(false);
  });

  it("refresh loads all colors title-ascending", async () => {
    db.colors._store.set("a", fakeColor({ id: "a", title: "Banana", colorCode: "#1" }));
    db.colors._store.set("b", fakeColor({ id: "b", title: "apple", colorCode: "#2" }));
    const s = useColorsStore();
    await s.refresh();
    expect(db.colors.all.items).toHaveBeenCalled();
    expect(s.items.map((c) => c.id)).toEqual(["b", "a"]);
    expect(s.loading).toBe(false);
  });

  it("add creates a color + reloads + returns the id", async () => {
    const s = useColorsStore();
    const id = await s.add({ title: "Grape", colorCode: "#80f" });
    expect(db.colors.add).toHaveBeenCalled();
    expect(typeof id).toBe("string");
    expect(s.items.map((c) => c.title)).toContain("Grape");
    expect(s.lastError).toBeNull();
    expect(s.busy).toBe(false);
  });

  it("add returns null + sets lastError when core rejects (missing colorCode)", async () => {
    db.colors.add.mockRejectedValueOnce(new Error("Color code is required."));
    const s = useColorsStore();
    const id = await s.add({ title: "NoCode" });
    expect(id).toBeNull();
    expect(s.lastError).toContain("Color code");
    expect(s.busy).toBe(false);
  });

  it("add upserts an existing color by colorCode (no duplicate)", async () => {
    db.colors._store.set("c1", fakeColor({ id: "c1", title: "Red", colorCode: "#f00" }));
    const s = useColorsStore();
    await s.refresh();
    expect(s.count).toBe(1);
    await s.add({ colorCode: "#f00", title: "Crimson" });
    expect(s.count).toBe(1);
    expect(s.items[0].title).toBe("Crimson");
  });

  it("remove no-ops on empty + reloads otherwise", async () => {
    const s = useColorsStore();
    await s.remove([]);
    expect(db.colors.remove).not.toHaveBeenCalled();
    db.colors._store.set("a", fakeColor({ id: "a", title: "A", colorCode: "#1" }));
    await s.refresh();
    await s.remove(["a"]);
    expect(db.colors.remove).toHaveBeenCalledWith("a");
    expect(s.items.map((c) => c.id)).not.toContain("a");
  });

  it("remove never throws + sets lastError when core rejects", async () => {
    db.colors.remove.mockRejectedValueOnce(new Error("boom"));
    const s = useColorsStore();
    await s.remove(["a"]);
    expect(s.lastError).toBe("boom");
    expect(s.busy).toBe(false);
  });

  it("noteCount returns the seeded count, 0 on a miss", async () => {
    db.colors._store.set("a", fakeColor({ id: "a", title: "A", colorCode: "#1" }));
    db.colors._counts.set("a", 7);
    const s = useColorsStore();
    expect(await s.noteCount("a")).toBe(7);
    expect(await s.noteCount("ghost")).toBe(0);
    expect(db.colors.count).toHaveBeenCalledWith("a");
  });

  it("noteCount never throws + returns 0 on failure", async () => {
    db.colors.count.mockRejectedValueOnce(new Error("db down"));
    const s = useColorsStore();
    expect(await s.noteCount("a")).toBe(0);
  });

  it("refresh never throws + leaves the previous list intact on failure", async () => {
    db.colors._store.set("a", fakeColor({ id: "a", title: "A", colorCode: "#1" }));
    const s = useColorsStore();
    await s.refresh();
    expect(s.items).toHaveLength(1);
    db.colors.all.items.mockRejectedValueOnce(new Error("db down"));
    await s.refresh();
    expect(s.items).toHaveLength(1);
    expect(s.loading).toBe(false);
  });

  it("renameColor upserts by id (preserves colorCode) + reloads", async () => {
    db.colors._store.set("c1", fakeColor({ id: "c1", title: "Red", colorCode: "#f00" }));
    const s = useColorsStore();
    await s.refresh();
    const ok = await s.renameColor("c1", "Crimson");
    expect(ok).toBe(true);
    expect(db.colors.add).toHaveBeenCalledWith({ id: "c1", title: "Crimson" });
    expect(s.items[0].title).toBe("Crimson");
    expect(s.items[0].colorCode).toBe("#f00"); // preserved
  });

  it("renameColor trims the title + returns false on empty", async () => {
    db.colors._store.set("c1", fakeColor({ id: "c1", title: "Red", colorCode: "#f00" }));
    const s = useColorsStore();
    await s.refresh();
    expect(await s.renameColor("c1", "   ")).toBe(false);
    expect(await s.renameColor("", "x")).toBe(false);
    expect(db.colors.add).not.toHaveBeenCalled();
  });

  it("renameColor never throws + sets lastError on failure", async () => {
    db.colors._store.set("c1", fakeColor({ id: "c1", title: "Red", colorCode: "#f00" }));
    db.colors.add.mockRejectedValueOnce(new Error("boom"));
    const s = useColorsStore();
    await s.refresh();
    expect(await s.renameColor("c1", "Crimson")).toBe(false);
    expect(s.lastError).toBe("boom");
    expect(s.busy).toBe(false);
  });

  it("refresh reads + applies the stored sideBarOrder:colors", async () => {
    db.colors._store.set("a", fakeColor({ id: "a", title: "Banana", colorCode: "#1" }));
    db.colors._store.set("b", fakeColor({ id: "b", title: "apple", colorCode: "#2" }));
    db.colors._store.set("c", fakeColor({ id: "c", title: "Cherry", colorCode: "#3" }));
    db.settings._colorOrder = ["a", "b", "c"]; // override title order
    const s = useColorsStore();
    await s.refresh();
    expect(db.settings.getSideBarOrder).toHaveBeenCalledWith("colors");
    expect(s.order).toEqual(["a", "b", "c"]);
    // a + b listed in order; c unlisted → appended after (title tiebreak).
    expect(s.items.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("refresh defaults to title sort when no stored order", async () => {
    db.colors._store.set("a", fakeColor({ id: "a", title: "Banana", colorCode: "#1" }));
    db.colors._store.set("b", fakeColor({ id: "b", title: "apple", colorCode: "#2" }));
    const s = useColorsStore();
    await s.refresh();
    expect(s.order).toEqual([]);
    expect(s.items.map((x) => x.id)).toEqual(["b", "a"]); // title-ascending
  });

  it("setOrder persists + re-applies the full sequence", async () => {
    db.colors._store.set("a", fakeColor({ id: "a", title: "Banana", colorCode: "#1" }));
    db.colors._store.set("b", fakeColor({ id: "b", title: "apple", colorCode: "#2" }));
    db.colors._store.set("c", fakeColor({ id: "c", title: "Cherry", colorCode: "#3" }));
    const s = useColorsStore();
    await s.refresh();
    // title order: b, a, c → reorder to c, a, b
    await s.setOrder(["c", "a", "b"]);
    expect(db.settings.setSideBarOrder).toHaveBeenCalledWith("colors", ["c", "a", "b"]);
    expect(s.order).toEqual(["c", "a", "b"]);
    expect(s.items.map((x) => x.id)).toEqual(["c", "a", "b"]);
  });

  it("setOrder([]) resets to the title sort", async () => {
    db.colors._store.set("a", fakeColor({ id: "a", title: "Banana", colorCode: "#1" }));
    db.colors._store.set("b", fakeColor({ id: "b", title: "apple", colorCode: "#2" }));
    const s = useColorsStore();
    await s.refresh();
    await s.setOrder(["a", "b"]);
    expect(s.items.map((x) => x.id)).toEqual(["a", "b"]);
    await s.setOrder([]);
    expect(db.settings.setSideBarOrder).toHaveBeenLastCalledWith("colors", []);
    expect(s.order).toEqual([]);
    expect(s.items.map((x) => x.id)).toEqual(["b", "a"]); // title-ascending
  });

  it("moveBefore reorders + persists the resulting sequence", async () => {
    db.colors._store.set("a", fakeColor({ id: "a", title: "Banana", colorCode: "#1" }));
    db.colors._store.set("b", fakeColor({ id: "b", title: "apple", colorCode: "#2" }));
    db.colors._store.set("c", fakeColor({ id: "c", title: "Cherry", colorCode: "#3" }));
    const s = useColorsStore();
    await s.refresh(); // b, a, c
    // move c before a
    await s.moveBefore("c", "a", true);
    expect(s.items.map((x) => x.id)).toEqual(["b", "c", "a"]);
    expect(db.settings.setSideBarOrder).toHaveBeenLastCalledWith("colors", ["b", "c", "a"]);
  });

  it("moveBefore is a no-op when from === to", async () => {
    db.colors._store.set("a", fakeColor({ id: "a", title: "A", colorCode: "#1" }));
    const s = useColorsStore();
    await s.refresh();
    await s.moveBefore("a", "a", true);
    expect(db.settings.setSideBarOrder).not.toHaveBeenCalled();
  });
});