// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  applyManualOrder,
  moveIdTo,
  isSidebarDrag,
  readSidebarPayload,
  writeSidebarPayload,
  SIDEBAR_MIME,
  type SidebarDragPayload
} from "@/utils/sidebar-order";

/** Minimal DragEvent stub: a `dataTransfer` holding a types set + a data
 *  Map (mirrors the DataTransfer contract the helpers touch). */
class FakeDataTransfer {
  types: string[] = [];
  private data = new Map<string, string>();
  effectAllowed: "none" | "copy" | "move" | "copyLink" | "copyMove" | "linkMove" | "all" = "none";
  setData(mime: string, v: string) {
    this.data.set(mime, v);
    if (!this.types.includes(mime)) this.types = [...this.types, mime];
  }
  getData(mime: string) {
    return this.data.get(mime) ?? "";
  }
}
function fakeEvent(): { e: DragEvent; dt: FakeDataTransfer } {
  const dt = new FakeDataTransfer();
  const e = { dataTransfer: dt } as unknown as DragEvent;
  return { e, dt };
}

describe("applyManualOrder", () => {
  it("returns a copy unchanged when order is empty (base sort wins)", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const out = applyManualOrder(items, []);
    expect(out.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(out).not.toBe(items); // non-mutating copy
  });

  it("reorders listed ids to the order sequence; unlisted keep input order", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    const out = applyManualOrder(items, ["c", "a"]);
    expect(out.map((x) => x.id)).toEqual(["c", "a", "b", "d"]);
  });

  it("ignores unknown ids in order (no matching item)", () => {
    const items = [{ id: "a" }, { id: "b" }];
    const out = applyManualOrder(items, ["zzz", "b", "a"]);
    expect(out.map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("is stable for unlisted items", () => {
    const items = [{ id: "x" }, { id: "y" }, { id: "z" }, { id: "w" }];
    const out = applyManualOrder(items, ["z"]);
    // z first; x, y, w keep input order.
    expect(out.map((i) => i.id)).toEqual(["z", "x", "y", "w"]);
  });

  it("does not mutate the input array", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    applyManualOrder(items, ["c", "b", "a"]);
    expect(items.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("handles a full-sequence order (DnD drop result) exactly", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const out = applyManualOrder(items, ["b", "c", "a"]);
    expect(out.map((x) => x.id)).toEqual(["b", "c", "a"]);
  });
});

describe("moveIdTo", () => {
  it("moves from before to (inserts before the target)", () => {
    expect(moveIdTo(["a", "b", "c", "d"], "d", "b", true)).toEqual(["a", "d", "b", "c"]);
  });
  it("moves from after to (inserts after the target)", () => {
    expect(moveIdTo(["a", "b", "c", "d"], "a", "c", false)).toEqual(["b", "c", "a", "d"]);
  });
  it("is a no-op copy when from === to", () => {
    expect(moveIdTo(["a", "b", "c"], "b", "b", true)).toEqual(["a", "b", "c"]);
  });
  it("is a no-op copy when from is missing", () => {
    expect(moveIdTo(["a", "b", "c"], "", "b", true)).toEqual(["a", "b", "c"]);
  });
  it("appends from to the end when to is absent", () => {
    expect(moveIdTo(["a", "b", "c"], "a", "zzz", true)).toEqual(["b", "c", "a"]);
  });
  it("does not mutate the input", () => {
    const ids = ["a", "b", "c"];
    moveIdTo(ids, "c", "a", true);
    expect(ids).toEqual(["a", "b", "c"]);
  });
  it("moving the first item before the second leaves it first (edge)", () => {
    expect(moveIdTo(["a", "b", "c"], "a", "b", true)).toEqual(["a", "b", "c"]);
  });
});

describe("sidebar DnD payload", () => {
  it("writes + reads a payload round-trip", () => {
    const { e, dt } = fakeEvent();
    const payload: SidebarDragPayload = { section: "colors", id: "c1" };
    writeSidebarPayload(e, payload);
    expect(dt.types).toContain(SIDEBAR_MIME);
    expect(dt.effectAllowed).toBe("move");
    expect(readSidebarPayload(e)).toEqual(payload);
  });

  it("isSidebarDrag checks the types list", () => {
    const { e } = fakeEvent();
    expect(isSidebarDrag(e)).toBe(false);
    writeSidebarPayload(e, { section: "notebooks", id: "n1" });
    expect(isSidebarDrag(e)).toBe(true);
  });

  it("readSidebarPayload returns null on missing/garbled data", () => {
    const empty = fakeEvent().e;
    expect(readSidebarPayload(empty)).toBeNull();
    const { e, dt } = fakeEvent();
    dt.setData(SIDEBAR_MIME, "{not json");
    expect(readSidebarPayload(e)).toBeNull();
  });
});