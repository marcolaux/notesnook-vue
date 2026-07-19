// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  isGroupLeaf,
  findGroupLeaf,
  allGroupIds,
  countGroups,
  getTopRightGroupId,
  splitGroupLeaf,
  removeGroupLeaf,
  pushHistory,
  navBack,
  navForward,
  type LayoutNode
} from "@/utils/editor-layout";
import { useEditorLayoutStore, type Direction } from "@/stores/editor-layout";

// Deterministic ids for the pure util tests (the store uses crypto.randomUUID).
function g(id: string): LayoutNode {
  return { id, type: "group", groupId: id };
}
function split(id: string, direction: Direction, children: LayoutNode[]): LayoutNode {
  return { id, type: "split", direction, children };
}

describe("pure tree — single group", () => {
  const root = g("root");

  it("isGroupLeaf / findGroupLeaf / allGroupIds / countGroups", () => {
    expect(isGroupLeaf(root)).toBe(true);
    expect(findGroupLeaf(root, "root")).toBe(root);
    expect(findGroupLeaf(root, "missing")).toBeUndefined();
    expect(allGroupIds(root)).toEqual(["root"]);
    expect(countGroups(root)).toBe(1);
    expect(getTopRightGroupId(root)).toBe("root");
  });
});

describe("pure tree — split", () => {
  const root = g("root");
  const splitRoot = splitGroupLeaf(root, "root", "vertical", "s1", "leaf2", "g2");

  it("replaces the group leaf with a split holding original + new group", () => {
    expect(splitRoot.type).toBe("split");
    expect(splitRoot.direction).toBe("vertical");
    expect(allGroupIds(splitRoot)).toEqual(["root", "g2"]);
    expect(countGroups(splitRoot)).toBe(2);
  });

  it("original group is first, new group is last (right/bottom)", () => {
    expect(splitRoot.children?.[0]).toEqual(g("root"));
    expect(splitRoot.children?.[1]).toEqual({ id: "leaf2", type: "group", groupId: "g2" });
  });

  it("getTopRightGroupId descends to the last child for vertical splits", () => {
    expect(getTopRightGroupId(splitRoot)).toBe("g2");
  });

  it("horizontal split → top-right is the first child's top-right", () => {
    const h = splitGroupLeaf(root, "root", "horizontal", "s1", "leaf2", "g2");
    expect(getTopRightGroupId(h)).toBe("root"); // first child for horizontal
  });

  it("does not mutate the input tree", () => {
    expect(root).toEqual(g("root"));
  });

  it("splits a nested group leaf", () => {
    const tree = split("s0", "vertical", [g("a"), split("s1", "horizontal", [g("b"), g("c")])]);
    const next = splitGroupLeaf(tree, "c", "vertical", "s2", "leaf-c2", "c2");
    expect(allGroupIds(next)).toEqual(["a", "b", "c", "c2"]);
    // the "c" leaf is now wrapped in a vertical split
    const cLeaf = findGroupLeaf(next, "c");
    expect(cLeaf).toBeDefined();
    expect(findGroupLeaf(next, "c2")).toBeDefined();
  });
});

describe("pure tree — remove + collapse", () => {
  it("removes a leaf and collapses the single-child split", () => {
    const tree = split("s0", "vertical", [g("a"), split("s1", "vertical", [g("b"), g("c")])]);
    // remove "c" → inner split has one child "b" → collapses to "b"
    const next = removeGroupLeaf(tree, "c");
    expect(allGroupIds(next)).toEqual(["a", "b"]);
    expect(next?.type).toBe("split");
    expect(next?.children?.map((c) => (isGroupLeaf(c) ? c.groupId : c.type))).toEqual(["a", "b"]);
  });

  it("removing one of two top-level groups collapses the root to the survivor", () => {
    const tree = split("s0", "vertical", [g("a"), g("b")]);
    const next = removeGroupLeaf(tree, "b");
    expect(allGroupIds(next)).toEqual(["a"]);
    expect(next).toEqual(g("a")); // root collapsed to the surviving group
  });

  it("returns null when removing the root group itself", () => {
    expect(removeGroupLeaf(g("only"), "only")).toBeNull();
  });

  it("removing a non-existent group leaves the tree unchanged (structurally)", () => {
    const tree = split("s0", "vertical", [g("a"), g("b")]);
    const next = removeGroupLeaf(tree, "missing");
    expect(allGroupIds(next!)).toEqual(["a", "b"]);
  });
});

describe("pushHistory", () => {
  it("appends a new note, truncating the forward stack", () => {
    const r = pushHistory(["a", "b", "c"], 1, "d"); // at "b", go to "d"
    expect(r).toEqual({ history: ["a", "b", "d"], index: 2 });
  });

  it("consecutive duplicate of the current entry is a no-op", () => {
    const r = pushHistory(["a", "b"], 1, "b");
    expect(r).toEqual({ history: ["a", "b"], index: 1 });
  });

  it("first push from a single-entry history", () => {
    const r = pushHistory(["a"], 0, "b");
    expect(r).toEqual({ history: ["a", "b"], index: 1 });
  });

  it("does not mutate the input", () => {
    const h = ["a", "b"];
    pushHistory(h, 1, "c");
    expect(h).toEqual(["a", "b"]);
  });
});

describe("navBack / navForward", () => {
  const h = ["a", "b", "c"];

  it("back decrements, stops at 0", () => {
    expect(navBack(h, 2)).toBe(1);
    expect(navBack(h, 1)).toBe(0);
    expect(navBack(h, 0)).toBeNull();
  });

  it("forward increments, stops at the end", () => {
    expect(navForward(h, 0)).toBe(1);
    expect(navForward(h, 1)).toBe(2);
    expect(navForward(h, 2)).toBeNull();
  });
});

// --- store -----------------------------------------------------------------

describe("useEditorLayoutStore — init + groups", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("init creates a single root group", () => {
    const s = useEditorLayoutStore();
    s.init();
    expect(s.layout).toEqual({ id: expect.any(String), type: "group", groupId: expect.any(String) });
    expect(s.groupCount).toBe(1);
    expect(s.hasSplitLayout).toBe(false);
    expect(s.topRightGroupId).toBe(s.activeGroupId);
    expect(Object.keys(s.groups)).toHaveLength(1);
  });

  it("init is idempotent", () => {
    const s = useEditorLayoutStore();
    s.init();
    const rootBefore = s.layout;
    s.init();
    expect(s.layout).toBe(rootBefore);
  });
});

describe("useEditorLayoutStore — splits", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("splitGroup adds a new group and focuses it", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const newId = s.splitGroup("vertical");
    expect(newId).toBeTruthy();
    expect(s.groupCount).toBe(2);
    expect(s.hasSplitLayout).toBe(true);
    expect(s.activeGroupId).toBe(newId);
    expect(s.layout?.type).toBe("split");
    // top-right is the last child of a vertical split → the new group
    expect(s.topRightGroupId).toBe(newId);
    expect(Object.keys(s.groups)).toHaveLength(2);
    expect(s.groups[newId]).toBeDefined();
    // original group still present
    expect(s.groups[root]).toBeDefined();
  });

  it("closeGroup refuses the last group", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    s.closeGroup(root);
    expect(s.groupCount).toBe(1);
    expect(s.layout).not.toBeNull();
  });

  it("closeGroup removes a split group + collapses", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const g2 = s.splitGroup("vertical");
    s.closeGroup(g2);
    expect(s.groupCount).toBe(1);
    expect(s.layout?.type).toBe("group");
    expect(s.activeGroupId).toBe(root);
    expect(s.groups[g2]).toBeUndefined();
  });

  it("splitGroupAt targets an arbitrary group", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const g2 = s.splitGroup("vertical");
    const g3 = s.splitGroupAt(root, "horizontal");
    expect(s.groupCount).toBe(3);
    expect(allGroupIds(s.layout!).includes(g3)).toBe(true);
  });
});

describe("useEditorLayoutStore — tabs", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("openTab creates a tab with single-entry history", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const id = s.openTab(root, "note-a");
    expect(id).toBeTruthy();
    expect(Object.keys(s.tabs)).toHaveLength(1);
    const tab = s.tabs[id];
    expect(tab.noteId).toBe("note-a");
    expect(tab.groupId).toBe(root);
    expect(tab.history).toEqual(["note-a"]);
    expect(tab.historyIndex).toBe(0);
    expect(s.groups[root].activeTabId).toBe(id);
    expect(s.sessions[tab.sessionId]).toMatchObject({ noteId: "note-a", type: "default" });
  });

  it("openTab reuses an existing tab for the note (activating its group)", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const g2 = s.splitGroup("vertical");
    const id1 = s.openTab(root, "note-a");
    s.setActiveGroup(g2);
    const id2 = s.openTab(g2, "note-a");
    expect(id2).toBe(id1);
    expect(Object.keys(s.tabs)).toHaveLength(1);
    // opening re-activates the tab's original group
    expect(s.activeGroupId).toBe(root);
  });

  it("navigateTab pushes history + changes the note", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const id = s.openTab(root, "a");
    s.navigateTab(id, "b");
    const tab = s.tabs[id];
    expect(tab.noteId).toBe("b");
    expect(tab.history).toEqual(["a", "b"]);
    expect(tab.historyIndex).toBe(1);
    expect(s.canGoBack(id)).toBe(true);
    expect(s.canGoForward(id)).toBe(false);
  });

  it("goBack/goForward move through history", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const id = s.openTab(root, "a");
    s.navigateTab(id, "b");
    s.navigateTab(id, "c");
    expect(s.tabs[id].history).toEqual(["a", "b", "c"]);
    expect(s.goBack(id)).toBe(true);
    expect(s.tabs[id].noteId).toBe("b");
    expect(s.goForward(id)).toBe(true);
    expect(s.tabs[id].noteId).toBe("c");
    expect(s.goForward(id)).toBe(false);
    expect(s.goBack(id)).toBe(true);
    expect(s.goBack(id)).toBe(true);
    expect(s.tabs[id].noteId).toBe("a");
    expect(s.goBack(id)).toBe(false); // at earliest
  });

  it("navigateTab truncates the forward stack (browser semantics)", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const id = s.openTab(root, "a");
    s.navigateTab(id, "b");
    s.navigateTab(id, "c");
    s.goBack(id); // at "b"
    s.navigateTab(id, "d"); // should drop "c"
    expect(s.tabs[id].history).toEqual(["a", "b", "d"]);
    expect(s.canGoForward(id)).toBe(false);
  });

  it("navigateTab consecutive duplicate is a no-op", () => {
    const s = useEditorLayoutStore();
    s.init();
    const id = s.openTab(s.activeGroupId, "a");
    s.navigateTab(id, "a");
    expect(s.tabs[id].history).toEqual(["a"]);
    expect(s.tabs[id].historyIndex).toBe(0);
  });

  it("activateTab sets the group's active tab + focuses the group", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const g2 = s.splitGroup("vertical");
    const a = s.openTab(root, "a");
    const b = s.openTab(g2, "b");
    s.activateTab(a);
    expect(s.activeGroupId).toBe(root);
    expect(s.groups[root].activeTabId).toBe(a);
    s.activateTab(b);
    expect(s.activeGroupId).toBe(g2);
    expect(s.groups[g2].activeTabId).toBe(b);
  });

  it("moveTab relocates a tab to another group", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const g2 = s.splitGroup("vertical");
    const a = s.openTab(root, "a");
    s.moveTab(a, g2);
    expect(s.tabs[a].groupId).toBe(g2);
    expect(s.activeGroupId).toBe(g2);
  });

  it("closeTab removes the tab + its sessions, keeps the group", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const a = s.openTab(root, "a");
    const b = s.openTab(root, "b");
    const aSession = s.tabs[a].sessionId;
    s.closeTab(a);
    expect(s.tabs[a]).toBeUndefined();
    expect(s.sessions[aSession]).toBeUndefined();
    expect(s.groups[root].activeTabId).toBe(b); // neighbour activated
  });

  it("closeGroup drops the group's tabs + their sessions", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const g2 = s.splitGroup("vertical");
    const a = s.openTab(g2, "a");
    const aSession = s.tabs[a].sessionId;
    s.closeGroup(g2);
    expect(s.tabs[a]).toBeUndefined();
    expect(s.sessions[aSession]).toBeUndefined();
    expect(s.groups[g2]).toBeUndefined();
    expect(s.groupCount).toBe(1);
  });

  it("registerSession is idempotent on (tabId, noteId, type)", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const id = s.openTab(root, "a");
    const first = s.tabs[id].sessionId;
    // goBack after navigating reuses the "a" session
    s.navigateTab(id, "b");
    s.goBack(id);
    expect(s.tabs[id].noteId).toBe("a");
    expect(s.tabs[id].sessionId).toBe(first);
  });
});

describe("useEditorLayoutStore — computed views", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("activeTab + tabsOf reflect the active group", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const g2 = s.splitGroup("vertical");
    const a = s.openTab(root, "a");
    const b = s.openTab(g2, "b");
    expect(s.activeTab?.id).toBe(b); // split focused g2
    expect(s.tabsOf(root).map((t) => t.id)).toEqual([a]);
    expect(s.tabsOf(g2).map((t) => t.id)).toEqual([b]);
    s.activateTab(a);
    expect(s.activeTab?.id).toBe(a);
  });

  it("topRightGroupId follows nested splits", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const g2 = s.splitGroup("vertical"); // root + g2 side-by-side, g2 right
    s.setActiveGroup(root);
    s.splitGroup("horizontal"); // split root horizontally
    // top-right of a vertical root split is its last child (g2, rightmost)
    expect(s.topRightGroupId).toBe(g2);
  });
});