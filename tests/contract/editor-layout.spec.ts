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
  setSplitChildSizes,
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

  it("position:'before' puts the fresh group FIRST (left/top)", () => {
    const before = splitGroupLeaf(root, "root", "vertical", "s1", "leaf2", "g2", "before");
    expect(before.type).toBe("split");
    expect(before.children?.[0]).toEqual({ id: "leaf2", type: "group", groupId: "g2" });
    expect(before.children?.[1]).toEqual(g("root"));
    expect(allGroupIds(before)).toEqual(["g2", "root"]);
  });

  it("position defaults to 'after' (original first, fresh last)", () => {
    const after = splitGroupLeaf(root, "root", "vertical", "s1", "leaf2", "g2");
    expect(after.children?.[0]).toEqual(g("root"));
    expect(after.children?.[1]).toEqual({ id: "leaf2", type: "group", groupId: "g2" });
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

  it("openTab targets a specific group even when it is not the active one", () => {
    // Reproduces the cross-window drop bug: a tab dropped onto a non-focused
    // pane's centre must open in THAT pane, not the active group. `openNoteAt`
    // resolves the pane under the cursor and calls `openTab(groupId, …)` — this
    // pins that the tab lands in the passed group even when another group is
    // active.
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const g2 = s.splitGroup("vertical"); // g2 is the new right pane (active)
    s.setActiveGroup(root); // make the LEFT pane active (not the drop target)
    const id = s.openTab(g2, "dropped"); // open in the RIGHT pane explicitly
    expect(s.tabs[id].groupId).toBe(g2);
    expect(s.groups[g2].activeTabId).toBe(id);
    expect(s.activeGroupId).toBe(g2); // opening activated the target pane
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

  it("moveTab then reorderTab inserts the moved tab at a chosen index (cross-pane drop)", () => {
    // Mirrors NoteTabs' cross-pane drop: moveTab into the target group, then
    // reorderTab to the drop position (toIndex = final index after removal).
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const g2 = s.splitGroup("vertical");
    const x = s.openTab(root, "x");
    // Target group g2 already has tabs b, c, d open.
    const b = s.openTab(g2, "b");
    s.openTab(g2, "c");
    s.openTab(g2, "d");
    // Activate the source so moveTab's activate lands on x in g2.
    s.setActiveGroup(root);
    s.moveTab(x, g2);
    expect(s.tabs[x].groupId).toBe(g2);
    expect(s.activeGroupId).toBe(g2);
    // Now insert x at index 1 (between b and c) — toIndex is the desired final
    // index after x is removed from g2's list.
    s.reorderTab(g2, x, 1);
    expect(s.tabsOf(g2).map((t) => t.noteId)).toEqual(["b", "x", "c", "d"]);
    expect(s.tabs[b].groupId).toBe(g2);
  });

  it("reorderTab moves a tab to a new position within its group", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const a = s.openTab(root, "a");
    const b = s.openTab(root, "b");
    const c = s.openTab(root, "c");
    expect(s.tabsOf(root).map((t) => t.id)).toEqual([a, b, c]);
    // Move "a" to the end (toIndex = 2 in the after-removal list of [b, c]).
    s.reorderTab(root, a, 2);
    expect(s.tabsOf(root).map((t) => t.id)).toEqual([b, c, a]);
  });

  it("reorderTab moves a tab left (toward the start)", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const a = s.openTab(root, "a");
    const b = s.openTab(root, "b");
    const c = s.openTab(root, "c");
    // Move "c" to position 0.
    s.reorderTab(root, c, 0);
    expect(s.tabsOf(root).map((t) => t.id)).toEqual([c, a, b]);
  });

  it("reorderTab clamps an out-of-range toIndex", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const a = s.openTab(root, "a");
    const b = s.openTab(root, "b");
    // toIndex 99 → clamps to the end (after-removal list length = 1).
    s.reorderTab(root, a, 99);
    expect(s.tabsOf(root).map((t) => t.id)).toEqual([b, a]);
  });

  it("reorderTab is a no-op when the position is unchanged", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const a = s.openTab(root, "a");
    const b = s.openTab(root, "b");
    const before = s.tabs;
    // Move "a" to position 0 (where it already is).
    s.reorderTab(root, a, 0);
    expect(s.tabsOf(root).map((t) => t.id)).toEqual([a, b]);
    // The record reference is unchanged (the rebuild was skipped).
    expect(s.tabs).toBe(before);
  });

  it("reorderTab leaves other groups' tabs in place", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const g2 = s.splitGroup("vertical");
    s.setActiveGroup(root);
    const a = s.openTab(root, "a");
    const b = s.openTab(root, "b");
    s.setActiveGroup(g2);
    const c = s.openTab(g2, "c");
    const d = s.openTab(g2, "d");
    // Reorder within g2; root's tabs must stay [a, b].
    s.reorderTab(g2, d, 0);
    expect(s.tabsOf(g2).map((t) => t.id)).toEqual([d, c]);
    expect(s.tabsOf(root).map((t) => t.id)).toEqual([a, b]);
  });

  it("reorderTab ignores an unknown group/tab", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const a = s.openTab(root, "a");
    const before = s.tabs;
    s.reorderTab("nope", a, 0);
    s.reorderTab(root, "nope", 0);
    expect(s.tabs).toBe(before);
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

  it("closeAllTabs drops every tab + session but keeps the groups/layout", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const g2 = s.splitGroup("vertical");
    const a = s.openTab(root, "a");
    const b = s.openTab(g2, "b");
    const aSession = s.tabs[a].sessionId;
    const bSession = s.tabs[b].sessionId;
    s.closeAllTabs();
    // All tabs + their sessions gone.
    expect(s.tabs[a]).toBeUndefined();
    expect(s.tabs[b]).toBeUndefined();
    expect(s.sessions[aSession]).toBeUndefined();
    expect(s.sessions[bSession]).toBeUndefined();
    // Groups + the split layout are preserved (an empty group can host a new tab).
    expect(s.groupCount).toBe(2);
    expect(s.groups[root]).toBeDefined();
    expect(s.groups[g2]).toBeDefined();
    // No group has an active tab anymore.
    expect(s.groups[root].activeTabId).toBeUndefined();
    expect(s.groups[g2].activeTabId).toBeUndefined();
    expect(s.activeTab).toBeNull();
  });

  it("closeAllTabs on an uninitialised store just creates the root group", () => {
    const s = useEditorLayoutStore();
    s.closeAllTabs();
    expect(s.layout).not.toBeNull();
    expect(s.groupCount).toBe(1);
    expect(Object.keys(s.tabs)).toHaveLength(0);
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

  it("openSearchTab creates a kind:search tab carrying the query (dedup-by-query)", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const id = s.openSearchTab("foo bar");
    expect(id).toBeTruthy();
    const tab = s.tabs[id];
    expect(tab.kind).toBe("search");
    expect(tab.searchQuery).toBe("foo bar");
    expect(tab.noteId).toBeUndefined();
    expect(tab.history).toEqual([]);
    expect(s.groups[root].activeTabId).toBe(id);
    // Reopening the same query reuses the tab (no duplicate).
    expect(s.openSearchTab("foo bar")).toBe(id);
    expect(Object.values(s.tabs).filter((t) => t.kind === "search")).toHaveLength(1);
    // A different query makes a new search tab.
    const id2 = s.openSearchTab("baz");
    expect(id2).not.toBe(id);
    expect(s.tabForSearch("baz")?.id).toBe(id2);
  });

  it("closeTab on a search tab drops its session", () => {
    const s = useEditorLayoutStore();
    s.init();
    const id = s.openSearchTab("q");
    const session = s.tabs[id].sessionId;
    s.closeTab(id);
    expect(s.tabs[id]).toBeUndefined();
    expect(s.sessions[session]).toBeUndefined();
  });
});

describe("useEditorLayoutStore — drag-to-split + empty-pane collapse", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("dropTabToSplit 'right' splits the target vertically and moves the tab into the new right pane", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const g2 = s.splitGroup("vertical");
    s.setActiveGroup(root);
    const a = s.openTab(root, "a");
    s.openTab(root, "x"); // keep root non-empty so it doesn't collapse on the move
    // g2 starts empty (draft). Drop root's tab `a` onto g2's RIGHT edge.
    s.dropTabToSplit(g2, a, "right");
    const newGroup = s.tabs[a].groupId;
    expect(s.groupCount).toBe(3); // root, g2, newGroup
    expect(newGroup).not.toBe(g2);
    expect(newGroup).not.toBe(root);
    expect(s.groups[newGroup]).toBeDefined();
    // The new pane is g2's RIGHT sibling (after) → in pre-order g2 comes before newGroup.
    expect(allGroupIds(s.layout!).indexOf(g2)).toBeLessThan(allGroupIds(s.layout!).indexOf(newGroup));
    // The new pane is the active, focused group (the tab was activated there).
    expect(s.activeGroupId).toBe(newGroup);
    expect(s.groups[newGroup].activeTabId).toBe(a);
  });

  it("dropTabToSplit 'left' places the new pane to the LEFT of the target (position 'before')", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const g2 = s.splitGroup("vertical");
    s.setActiveGroup(root);
    const a = s.openTab(root, "a");
    s.openTab(root, "x"); // keep root non-empty
    s.dropTabToSplit(g2, a, "left");
    const newGroup = s.tabs[a].groupId;
    expect(s.groupCount).toBe(3);
    expect(s.groups[g2]).toBeDefined();
    // The new pane is g2's LEFT sibling (before) → in pre-order newGroup comes before g2.
    expect(allGroupIds(s.layout!).indexOf(newGroup)).toBeLessThan(allGroupIds(s.layout!).indexOf(g2));
  });

  it("dropTabToSplit 'bottom' produces a horizontal (stacked) split", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const a = s.openTab(root, "a");
    s.openTab(root, "x"); // keep root non-empty so the split survives the move
    s.dropTabToSplit(root, a, "bottom");
    const top = s.layout!;
    expect(top.type).toBe("split");
    expect(top.direction).toBe("horizontal");
    expect(s.groupCount).toBe(2);
  });

  it("dropTabToSplit moves the only tab of a pane to an edge → tears it into its own pane (no empty pane left)", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const a = s.openTab(root, "a"); // root has only this tab
    s.dropTabToSplit(root, a, "right");
    // Source (root) emptied + collapsed → the new pane replaces it; tree is a single group.
    expect(s.groupCount).toBe(1);
    expect(s.tabs[a].groupId).toBeDefined();
    expect(s.groups[root]).toBeUndefined();
  });

  it("closing the last tab of a pane removes the pane (split collapses)", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const g2 = s.splitGroup("vertical");
    const a = s.openTab(g2, "a"); // g2's only tab
    s.closeTab(a);
    expect(s.tabs[a]).toBeUndefined();
    expect(s.groups[g2]).toBeUndefined();
    expect(s.groupCount).toBe(1);
  });

  it("closing a tab when the pane still has others keeps the pane", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const a = s.openTab(root, "a");
    const b = s.openTab(root, "b");
    s.closeTab(a);
    // Root still has b → stays (groupCount unchanged — root was the only group).
    expect(s.groups[root]).toBeDefined();
    expect(s.groups[root].activeTabId).toBe(b);
    expect(Object.keys(s.tabs)).toHaveLength(1);
  });

  it("closing the last tab of the only pane keeps the pane (no collapse to zero)", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const a = s.openTab(root, "a");
    s.closeTab(a);
    expect(s.groupCount).toBe(1);
    expect(s.groups[root]).toBeDefined();
    expect(s.activeTab).toBeNull();
  });

  it("moveTab of the last tab out of a pane collapses the source pane", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const g2 = s.splitGroup("vertical");
    s.setActiveGroup(g2);
    const a = s.openTab(g2, "a"); // g2's only tab
    s.moveTab(a, root);
    expect(s.tabs[a].groupId).toBe(root);
    // g2 emptied by the move → collapsed.
    expect(s.groups[g2]).toBeUndefined();
    expect(s.groupCount).toBe(1);
  });

  it("moveTab of the source's ACTIVE tab reassigns the source to the next tab (no stale ref)", () => {
    // Reproduces the on-site bug: two tabs in a pane, move the active one out to
    // create a new pane — the source pane must switch to the remaining tab and
    // NOT keep a stale activeTabId pointing at the moved tab (which would
    // render the moved note in BOTH panes).
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const a = s.openTab(root, "a");
    const b = s.openTab(root, "b"); // root now has [a, b], b active
    expect(s.groups[root].activeTabId).toBe(b);
    // Move the ACTIVE tab `b` out into a freshly split pane.
    const g2 = s.splitGroup("vertical"); // splits root → new pane g2 (active)
    s.setActiveGroup(root);
    s.moveTab(b, g2);
    // Source pane switches to the remaining sibling `a`.
    expect(s.groups[root].activeTabId).toBe(a);
    expect(s.tabs[a].groupId).toBe(root);
    // The moved tab is active in the destination, not dangling in the source.
    expect(s.tabs[b].groupId).toBe(g2);
    expect(s.groups[g2].activeTabId).toBe(b);
    expect(s.activeGroupId).toBe(g2);
  });
});

describe("useEditorLayoutStore — openNoteSplit (cross-window drop zone)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("openNoteSplit 'right' splits the target vertically + opens the note in the new right sibling", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const a = s.openTab(root, "a"); // keep root occupied so the split survives
    const id = s.openNoteSplit(root, "droppedNote", "right");
    expect(id).toBeTruthy();
    // A new tab for the dropped note exists in a NEW group (not root).
    const newGroup = s.tabs[id].groupId;
    expect(newGroup).not.toBe(root);
    expect(s.groups[newGroup]).toBeDefined();
    expect(s.tabs[id].noteId).toBe("droppedNote");
    expect(s.groups[newGroup].activeTabId).toBe(id);
    // The original tab stayed in root; groupCount grew by 1.
    expect(s.tabs[a].groupId).toBe(root);
    expect(s.groupCount).toBe(2);
  });

  it("openNoteSplit 'left' places the new pane to the LEFT of the target", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    s.openTab(root, "a");
    const id = s.openNoteSplit(root, "n", "left");
    const newGroup = s.tabs[id].groupId;
    expect(allGroupIds(s.layout!).indexOf(newGroup)).toBeLessThan(
      allGroupIds(s.layout!).indexOf(root)
    );
  });

  it("openNoteSplit 'top' produces a horizontal (stacked) split", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    s.openTab(root, "a");
    s.openNoteSplit(root, "n", "top");
    expect(s.layout!.type).toBe("split");
    expect(s.layout!.direction).toBe("horizontal");
  });

  it("openNoteSplit reuses an existing tab for the note instead of splitting", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const g2 = s.splitGroup("vertical");
    s.setActiveGroup(g2);
    const existing = s.openTab(g2, "already-open");
    const before = s.groupCount;
    const id = s.openNoteSplit(root, "already-open", "right");
    // No new group, no new tab — the existing tab is just activated.
    expect(id).toBe(existing);
    expect(s.groupCount).toBe(before);
    expect(s.activeGroupId).toBe(g2);
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

describe("setSplitChildSizes (pure)", () => {
  function twoWaySplit(): LayoutNode {
    // root split with two group leaves
    return {
      id: "s1",
      type: "split",
      direction: "vertical",
      children: [
        { id: "l1", type: "group", groupId: "g1" },
        { id: "l2", type: "group", groupId: "g2" }
      ]
    };
  }

  it("sets size on the two adjacent children (fraction + 1-fraction)", () => {
    const next = setSplitChildSizes(twoWaySplit(), "s1", 0, 0.3);
    expect(next.children![0]!.size).toBe(0.3);
    expect(next.children![1]!.size).toBeCloseTo(0.7);
  });

  it("clamps the fraction to [0.05, 0.95]", () => {
    const tooSmall = setSplitChildSizes(twoWaySplit(), "s1", 0, 0);
    expect(tooSmall.children![0]!.size).toBe(0.05);
    expect(tooSmall.children![1]!.size).toBeCloseTo(0.95);
    const tooBig = setSplitChildSizes(twoWaySplit(), "s1", 0, 1);
    expect(tooBig.children![0]!.size).toBe(0.95);
    expect(tooBig.children![1]!.size).toBeCloseTo(0.05);
  });

  it("does not mutate the input tree", () => {
    const root = twoWaySplit();
    setSplitChildSizes(root, "s1", 0, 0.4);
    expect(root.children![0]!.size).toBeUndefined();
  });

  it("is a no-op (same reference) for an unknown split id", () => {
    const root = twoWaySplit();
    expect(setSplitChildSizes(root, "nope", 0, 0.5)).toBe(root);
  });

  it("is a no-op (same reference) for an out-of-range child index", () => {
    const root = twoWaySplit();
    expect(setSplitChildSizes(root, "s1", 1, 0.5)).toBe(root); // only index 0 is valid
  });

  it("targets a nested split", () => {
    const root: LayoutNode = {
      id: "outer",
      type: "split",
      direction: "vertical",
      children: [
        twoWaySplit(),
        { id: "l3", type: "group", groupId: "g3" }
      ]
    };
    const next = setSplitChildSizes(root, "s1", 0, 0.25);
    expect(next.children![0]!.children![0]!.size).toBe(0.25);
    expect(next.children![0]!.children![1]!.size).toBeCloseTo(0.75);
    // The outer split's other child is untouched.
    expect(next.children![1]!.groupId).toBe("g3");
  });
});

describe("useEditorLayoutStore — resize / focus-next / cycle-tab", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("resizeSplitChildren writes sizes on the two adjacent children", () => {
    const s = useEditorLayoutStore();
    s.init();
    s.splitGroup("vertical");
    const splitNode = s.layout!;
    const splitId = splitNode.id;
    s.resizeSplitChildren(splitId, 0, 0.4);
    const children = (s.layout as LayoutNode).children!;
    expect(children[0]!.size).toBe(0.4);
    expect(children[1]!.size).toBeCloseTo(0.6);
  });

  it("focusNextGroup cycles through the groups in tree order, wrapping", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const g2 = s.splitGroup("vertical"); // active = g2
    const g3 = s.splitGroup("vertical"); // active = g3 (g2 split → g3 right of g2)
    // Tree order: root, g2, g3 (pre-order). Active is g3.
    s.setActiveGroup(root);
    s.focusNextGroup();
    expect(s.activeGroupId).toBe(g2);
    s.focusNextGroup();
    expect(s.activeGroupId).toBe(g3);
    s.focusNextGroup();
    expect(s.activeGroupId).toBe(root); // wrapped
  });

  it("focusNextGroup is a no-op with fewer than 2 groups", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    s.focusNextGroup();
    expect(s.activeGroupId).toBe(root);
  });

  it("cycleTab cycles the active group's tabs, wrapping", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const t1 = s.openTab(root, "a");
    s.openTab(root, "b");
    s.openTab(root, "c");
    s.activateTab(t1);
    expect(s.activeTab?.noteId).toBe("a");
    s.cycleTab(1);
    expect(s.activeTab?.noteId).toBe("b");
    s.cycleTab(1);
    expect(s.activeTab?.noteId).toBe("c");
    s.cycleTab(1);
    expect(s.activeTab?.noteId).toBe("a"); // wrapped
    s.cycleTab(-1);
    expect(s.activeTab?.noteId).toBe("c"); // wrapped back
  });

  it("cycleTab is a no-op with fewer than 2 tabs", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const t1 = s.openTab(root, "a");
    s.activateTab(t1);
    s.cycleTab(1);
    expect(s.activeTab?.noteId).toBe("a");
  });
});