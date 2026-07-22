// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  filterLayoutSnapshot,
  sanitizeBounds,
  emptyContextSession,
  emptyLayoutSnapshot,
  type LayoutSnapshot,
  type LayoutNode,
  type EditorTab,
  type EditorSession,
  type WindowBounds
} from "@contracts/session-state";

// --- fixtures --------------------------------------------------------------

function group(id: string): LayoutNode {
  return { id, type: "group", groupId: id };
}
function split(id: string, direction: "vertical" | "horizontal", children: LayoutNode[]): LayoutNode {
  return { id, type: "split", direction, children };
}

function noteTab(id: string, groupId: string, noteId: string): EditorTab {
  return {
    id,
    groupId,
    kind: "note",
    noteId,
    sessionId: `s-${id}`,
    history: [noteId],
    historyIndex: 0
  };
}
function attachmentTab(id: string, groupId: string, hash: string): EditorTab {
  return {
    id,
    groupId,
    kind: "attachment",
    attachment: { hash, filename: `${hash}.png`, mime: "image/png", size: 123 },
    sessionId: `s-${id}`,
    history: [],
    historyIndex: 0
  };
}
function session(tab: EditorTab): EditorSession {
  return {
    id: tab.sessionId,
    tabId: tab.id,
    type: tab.kind === "attachment" ? "attachment" : "default",
    ...(tab.kind === "note" && tab.noteId ? { noteId: tab.noteId } : {}),
    ...(tab.kind === "attachment" ? { title: tab.attachment!.filename } : {})
  };
}

/** Two-group split: group A holds a valid note tab + an attachment tab; group B
 *  holds a note tab whose noteId will be filtered out. */
function twoGroupSnapshot(opts: { aActive?: string; bActive?: string; activeGroupId?: string } = {}): LayoutSnapshot {
  const t1 = noteTab("t1", "A", "n1"); // valid
  const t3 = attachmentTab("t3", "A", "h1"); // attachment (always kept)
  const t2 = noteTab("t2", "B", "n2"); // will be invalid
  const tabs = { t1, t2, t3 };
  return {
    layout: split("root", "vertical", [group("A"), group("B")]),
    groups: {
      A: { id: "A", activeTabId: opts.aActive ?? "t1" },
      B: { id: "B", activeTabId: opts.bActive ?? "t2" }
    },
    tabs,
    sessions: { s1: session(t1), s2: session(t2), s3: session(t3) },
    activeGroupId: opts.activeGroupId ?? "A"
  };
}

// --- filterLayoutSnapshot --------------------------------------------------

describe("filterLayoutSnapshot", () => {
  it("drops note tabs whose noteId is invalid, keeps valid + attachment tabs", () => {
    const out = filterLayoutSnapshot(twoGroupSnapshot(), ["n1"]);
    expect(Object.keys(out.tabs).sort()).toEqual(["t1", "t3"]);
    expect(out.tabs["t1"]!.noteId).toBe("n1");
    expect(out.tabs["t3"]!.kind).toBe("attachment");
  });

  it("drops sessions belonging to dropped tabs", () => {
    const out = filterLayoutSnapshot(twoGroupSnapshot(), ["n1"]);
    // s2 belonged to t2 (dropped); s1 + s3 remain.
    expect(Object.keys(out.sessions).sort()).toEqual(["s1", "s3"]);
  });

  it("collapses the now-empty group and the single-child split", () => {
    const out = filterLayoutSnapshot(twoGroupSnapshot(), ["n1"]);
    // Group B had only t2 (dropped) → empty → pruned. The split then had one
    // child (A) → collapses to that group leaf.
    expect(out.layout).toEqual(group("A"));
  });

  it("keeps a split when both groups still have tabs", () => {
    const snap: LayoutSnapshot = {
      layout: split("root", "vertical", [group("A"), group("B")]),
      groups: { A: { id: "A" }, B: { id: "B" } },
      tabs: { t1: noteTab("t1", "A", "n1"), t2: noteTab("t2", "B", "n3") },
      sessions: { s1: session(noteTab("t1", "A", "n1")), s2: session(noteTab("t2", "B", "n3")) },
      activeGroupId: "A"
    };
    const out = filterLayoutSnapshot(snap, ["n1", "n3"]);
    expect(out.layout).toEqual(split("root", "vertical", [group("A"), group("B")]));
    expect(Object.keys(out.tabs).sort()).toEqual(["t1", "t2"]);
  });

  it("fixes activeGroupId when it pointed at a pruned group", () => {
    const out = filterLayoutSnapshot(twoGroupSnapshot({ activeGroupId: "B" }), ["n1"]);
    expect(out.activeGroupId).toBe("A");
  });

  it("fixes a group's activeTabId when it pointed at a dropped tab", () => {
    const snap = twoGroupSnapshot({ aActive: "tX" }); // A's active is a non-existent tab
    const out = filterLayoutSnapshot(snap, ["n1"]);
    // A still has t1 + t3; activeTabId should resolve to a remaining tab.
    expect(out.groups["A"]!.activeTabId).toBe("t1");
  });

  it("keeps the snapshot alive via attachment tabs even with no valid note ids", () => {
    const out = filterLayoutSnapshot(twoGroupSnapshot(), []); // no valid note ids
    // t1 dropped (n1 not in []), t2 dropped, t3 (attachment) kept → group A survives.
    expect(Object.keys(out.tabs)).toEqual(["t3"]);
    expect(out.layout).toEqual(group("A"));
    expect(out.activeGroupId).toBe("A");
  });

  it("returns an empty snapshot when nothing valid remains", () => {
    const snap: LayoutSnapshot = {
      layout: group("A"),
      groups: { A: { id: "A" } },
      tabs: { t1: noteTab("t1", "A", "n1") },
      sessions: { s1: session(noteTab("t1", "A", "n1")) },
      activeGroupId: "A"
    };
    const out = filterLayoutSnapshot(snap, []); // n1 invalid, no attachments
    expect(out.layout).toBeNull();
    expect(out.tabs).toEqual({});
    expect(out.sessions).toEqual({});
  });

  it("returns an empty snapshot when the input layout is null", () => {
    const out = filterLayoutSnapshot(emptyLayoutSnapshot(), ["n1"]);
    expect(out.layout).toBeNull();
  });
});

// --- sanitizeBounds --------------------------------------------------------

describe("sanitizeBounds", () => {
  it("rounds finite bounds and preserves maximized/fullscreen", () => {
    const out = sanitizeBounds({ x: 10.4, y: 20.6, width: 1000, height: 700, maximized: true, fullscreen: true });
    expect(out).toEqual({ x: 10, y: 21, width: 1000, height: 700, maximized: true, fullscreen: true });
  });

  it("returns undefined when width/height are below the minimum", () => {
    expect(sanitizeBounds({ x: 0, y: 0, width: 100, height: 100, maximized: false })).toBeUndefined();
  });

  it("returns undefined for non-finite dimensions", () => {
    expect(
      sanitizeBounds({ x: 0, y: 0, width: Number.NaN, height: 700, maximized: false })
    ).toBeUndefined();
  });

  it("defaults x/y to 0 when non-finite (OS repositions on screen)", () => {
    const out = sanitizeBounds({ x: Number.NaN, y: Number.NEGATIVE_INFINITY, width: 1000, height: 700, maximized: false });
    expect(out).toEqual({ x: 0, y: 0, width: 1000, height: 700, maximized: false });
  });

  it("returns undefined for undefined input", () => {
    expect(sanitizeBounds(undefined)).toBeUndefined();
  });

  it("omits fullscreen when not set", () => {
    const out = sanitizeBounds({ x: 0, y: 0, width: 1000, height: 700, maximized: false });
    expect(out).toEqual({ x: 0, y: 0, width: 1000, height: 700, maximized: false });
    expect("fullscreen" in (out as WindowBounds)).toBe(false);
  });
});

// --- emptyContextSession ---------------------------------------------------

describe("emptyContextSession", () => {
  it("has a null layout, no note windows, and no main bounds", () => {
    const e = emptyContextSession();
    expect(e.mainWindowOpenTabs.layout).toBeNull();
    expect(e.mainWindowOpenTabs.tabs).toEqual({});
    expect(e.noteWindows).toEqual([]);
    expect(e.mainBounds).toBeUndefined();
  });
});