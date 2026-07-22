// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  clampMenuPosition,
  cycleMenuIndex,
  firstMenuIndex,
  separator,
  type MenuItem
} from "@/utils/context-menu";
import { useContextMenuStore } from "@/stores/context-menu";

function item(id: string, opts: Partial<MenuItem> = {}): MenuItem {
  return { id, label: id, ...opts };
}

describe("clampMenuPosition", () => {
  const vp = { width: 1000, height: 800 };

  it("keeps the cursor coords when the menu fits", () => {
    expect(clampMenuPosition(100, 100, 200, 300, vp)).toEqual({ top: 100, left: 100 });
  });

  it("flips left when the menu would overflow the right edge", () => {
    // cursor at x=950, menu 200 wide → would overflow; flip to x - width.
    expect(clampMenuPosition(950, 100, 200, 300, vp)).toEqual({ top: 100, left: 750 });
  });

  it("flips up when the menu would overflow the bottom edge", () => {
    expect(clampMenuPosition(100, 700, 200, 300, vp)).toEqual({ top: 400, left: 100 });
  });

  it("clamps to the margin when flipping would underflow", () => {
    // Left underflows (x - width < margin) while top fits → top stays, left clamps.
    expect(clampMenuPosition(10, 100, 200, 300, { width: 150, height: 500 })).toEqual({
      top: 100,
      left: 8
    });
    // Top underflows while left fits → left stays, top clamps.
    expect(clampMenuPosition(100, 10, 200, 300, { width: 500, height: 150 })).toEqual({
      top: 8,
      left: 100
    });
  });
});

describe("cycleMenuIndex", () => {
  const items: MenuItem[] = [
    item("a"),
    separator("s1"),
    item("b"),
    item("c", { disabled: true }),
    item("d")
  ];
  // selectable: a(0), b(2), d(4)

  it("moves down over selectable entries, wrapping at the end", () => {
    expect(cycleMenuIndex(0, items, 1)).toBe(2); // a → b
    expect(cycleMenuIndex(2, items, 1)).toBe(4); // b → d
    expect(cycleMenuIndex(4, items, 1)).toBe(0); // d → a (wrap)
  });

  it("moves up over selectable entries, wrapping at the start", () => {
    expect(cycleMenuIndex(4, items, -1)).toBe(2); // d → b
    expect(cycleMenuIndex(0, items, -1)).toBe(4); // a → d (wrap)
  });

  it("skips separators + disabled entries", () => {
    expect(cycleMenuIndex(2, items, 1)).toBe(4); // b → d (skips disabled c)
  });

  it("returns the current index unchanged when nothing is selectable", () => {
    const only = [separator("x"), item("y", { disabled: true })];
    expect(cycleMenuIndex(0, only, 1)).toBe(0);
  });
});

describe("firstMenuIndex", () => {
  it("returns the first selectable index", () => {
    expect(
      firstMenuIndex([separator("s"), item("a"), item("b", { disabled: true })])
    ).toBe(1);
  });

  it("returns 0 when nothing is selectable", () => {
    expect(firstMenuIndex([separator("s"), item("a", { disabled: true })])).toBe(0);
  });
});

describe("separator", () => {
  it("builds a divider with no label/onSelect", () => {
    const s = separator("sep-1");
    expect(s.separator).toBe(true);
    expect(s.label).toBe("");
    expect(s.onSelect).toBeUndefined();
  });
});

describe("useContextMenuStore", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("starts closed + empty", () => {
    const m = useContextMenuStore();
    expect(m.open).toBe(false);
    expect(m.items).toEqual([]);
    expect(m.selectableItems).toEqual([]);
  });

  it("show opens the menu at coords + resets active to first selectable", () => {
    const m = useContextMenuStore();
    const entries = [separator("s"), item("a"), item("b")];
    m.show(entries, 120, 200);
    expect(m.open).toBe(true);
    expect(m.x).toBe(120);
    expect(m.y).toBe(200);
    expect(m.items.map((i) => i.id)).toEqual(["s", "a", "b"]);
    expect(m.activeIndex).toBe(1); // first selectable
  });

  it("move wraps + skips separators/disabled", () => {
    const m = useContextMenuStore();
    m.show([item("a"), separator("s"), item("b"), item("c", { disabled: true })], 0, 0);
    // selectable: a(0), b(2)
    m.move(1);
    expect(m.activeIndex).toBe(2);
    m.move(1);
    expect(m.activeIndex).toBe(0); // wrap
    m.move(-1);
    expect(m.activeIndex).toBe(2); // wrap back
  });

  it("setActiveIndex clamps to the list", () => {
    const m = useContextMenuStore();
    m.show([item("a"), item("b")], 0, 0);
    m.setActiveIndex(99);
    expect(m.activeIndex).toBe(1);
    m.setActiveIndex(-5);
    expect(m.activeIndex).toBe(0);
  });

  it("execute runs the active entry's onSelect + closes", async () => {
    const m = useContextMenuStore();
    let clicked = "";
    m.show(
      [item("a", { onSelect: () => (clicked = "a") }), item("b", { onSelect: () => (clicked = "b") })],
      0,
      0
    );
    m.setActiveIndex(1);
    await m.execute();
    expect(clicked).toBe("b");
    expect(m.open).toBe(false);
  });

  it("execute on a separator/disabled active row is a no-op but still closes", async () => {
    const m = useContextMenuStore();
    let clicked = false;
    m.show([separator("s"), item("a", { disabled: true, onSelect: () => (clicked = true) })], 0, 0);
    m.setActiveIndex(1); // disabled a
    await m.execute();
    expect(clicked).toBe(false);
    expect(m.open).toBe(false);
  });

  it("close sets open=false", () => {
    const m = useContextMenuStore();
    m.show([item("a")], 0, 0);
    m.close();
    expect(m.open).toBe(false);
  });
});

describe("useContextMenuStore — submenus (v2)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  /** A submenu spec whose `build` returns a static list (records the query it
   *  was called with so the search tests can assert it). */
  function staticSubmenu(items: MenuItem[]) {
    const calls: string[] = [];
    return {
      calls,
      spec: { build: (q: string) => (calls.push(q), items) }
    };
  }

  it("openSubmenu builds the submenu via spec.build(\"\") + seeds active", () => {
    const m = useContextMenuStore();
    const { spec } = staticSubmenu([item("sa"), item("sb")]);
    m.show([{ ...item("parent"), submenu: spec }], 0, 0);
    m.openSubmenu(0);
    expect(m.submenu).not.toBeNull();
    expect(m.submenu!.items.map((i) => i.id)).toEqual(["sa", "sb"]);
    expect(m.submenu!.activeIndex).toBe(0);
    expect(m.submenu!.query).toBe("");
  });

  it("openSubmenu on a plain root row closes any open submenu", () => {
    const m = useContextMenuStore();
    const { spec } = staticSubmenu([item("sa")]);
    m.show([{ ...item("parent"), submenu: spec }, item("plain")], 0, 0);
    m.openSubmenu(0);
    expect(m.submenu).not.toBeNull();
    m.openSubmenu(1); // plain row → no submenu
    expect(m.submenu).toBeNull();
  });

  it("closeSubmenu clears the submenu but leaves the root open", () => {
    const m = useContextMenuStore();
    const { spec } = staticSubmenu([item("sa")]);
    m.show([{ ...item("parent"), submenu: spec }], 0, 0);
    m.openSubmenu(0);
    m.closeSubmenu();
    expect(m.submenu).toBeNull();
    expect(m.open).toBe(true);
  });

  it("setQuery rebuilds the submenu via build(query) + resets active", () => {
    const m = useContextMenuStore();
    let q = "";
    const spec = { search: { placeholder: "x" }, build: (query: string) => ((q = query), [item("only")]) };
    m.show([{ ...item("parent"), submenu: spec }], 0, 0);
    m.openSubmenu(0);
    m.setQuery("foo");
    expect(q).toBe("foo");
    expect(m.submenu!.query).toBe("foo");
    expect(m.submenu!.items.map((i) => i.id)).toEqual(["only"]);
  });

  it("setQuery is a no-op when the submenu has no search field", () => {
    const m = useContextMenuStore();
    const { spec, calls } = staticSubmenu([item("sa")]);
    m.show([{ ...item("parent"), submenu: spec }], 0, 0);
    m.openSubmenu(0);
    calls.length = 0;
    m.setQuery("foo");
    expect(calls).toEqual([]); // not rebuilt
    expect(m.submenu!.query).toBe("");
  });

  it("execute on a submenu leaf runs onSelect + closes (no keepOpen)", async () => {
    const m = useContextMenuStore();
    let ran = "";
    const spec = { build: () => [item("go", { onSelect: () => (ran = "go") })] };
    m.show([{ ...item("parent"), submenu: spec }], 0, 0);
    m.openSubmenu(0);
    await m.execute();
    expect(ran).toBe("go");
    expect(m.open).toBe(false);
    expect(m.submenu).toBeNull();
  });

  it("execute on a keepOpen submenu leaf runs onSelect + stays open + rebuilds", async () => {
    const m = useContextMenuStore();
    let toggled = false;
    // build returns a checked toggle that flips on each call — proves refreshSubmenu rebuilds
    const spec = {
      build: () => [{ ...item("toggle"), checked: toggled, keepOpen: true, onSelect: () => (toggled = !toggled) }]
    };
    m.show([{ ...item("parent"), submenu: spec }], 0, 0);
    m.openSubmenu(0);
    expect(m.submenu!.items[0]!.checked).toBe(false);
    await m.execute();
    expect(m.open).toBe(true); // kept open
    expect(m.submenu).not.toBeNull();
    expect(m.submenu!.items[0]!.checked).toBe(true); // rebuilt with new state
  });

  it("execute on a root submenu-parent opens the submenu (does not close)", async () => {
    const m = useContextMenuStore();
    const { spec } = staticSubmenu([item("sa")]);
    m.show([{ ...item("parent"), submenu: spec }], 0, 0);
    m.setActiveIndex(0);
    await m.execute();
    expect(m.submenu).not.toBeNull();
    expect(m.open).toBe(true);
  });

  it("move operates on the submenu when one is open, else the root", () => {
    const m = useContextMenuStore();
    const { spec } = staticSubmenu([item("sa"), item("sb")]);
    m.show([{ ...item("parent"), submenu: spec }, item("other")], 0, 0);
    // root move
    m.move(1);
    expect(m.activeIndex).toBe(1);
    m.openSubmenu(0); // active is now parent (0) — open its submenu
    // submenu move
    m.move(1);
    expect(m.submenu!.activeIndex).toBe(1);
  });

  it("refreshSubmenu rebuilds with the current query + clamps active", () => {
    const m = useContextMenuStore();
    let n = 1;
    const spec = { search: { placeholder: "x" }, build: () => Array.from({ length: n }, (_, i) => item(`s${i}`)) };
    m.show([{ ...item("parent"), submenu: spec }], 0, 0);
    m.openSubmenu(0);
    m.submenu!.activeIndex = 3;
    n = 2; // shrink the rebuilt list
    m.refreshSubmenu();
    expect(m.submenu!.items.length).toBe(2);
    expect(m.submenu!.activeIndex).toBe(1); // clamped from 3 to 1
  });

  it("hoverRoot sets the root active + opens the matching submenu", () => {
    const m = useContextMenuStore();
    const { spec } = staticSubmenu([item("sa")]);
    m.show([{ ...item("parent"), submenu: spec }, item("plain")], 0, 0);
    m.hoverRoot(0);
    expect(m.activeIndex).toBe(0);
    expect(m.submenu).not.toBeNull();
    m.hoverRoot(1); // plain row → submenu closed
    expect(m.submenu).toBeNull();
  });

  it("submenuItems computed mirrors the open submenu items", () => {
    const m = useContextMenuStore();
    const { spec } = staticSubmenu([item("sa"), item("sb")]);
    m.show([{ ...item("parent"), submenu: spec }], 0, 0);
    expect(m.submenuItems).toEqual([]);
    m.openSubmenu(0);
    expect(m.submenuItems.map((i) => i.id)).toEqual(["sa", "sb"]);
  });
});