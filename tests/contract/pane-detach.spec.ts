// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useEditorLayoutStore } from "@/stores/editor-layout";
import {
  consumePaneDropHandled,
  markPaneDropHandled,
  resetPaneDropHandled
} from "@/utils/pane-dnd";
import {
  ContextSessionSchema,
  emptyContextSession,
  emptyLayoutSnapshot,
  filterLayoutSnapshot,
  normalizeContextSession,
  type LayoutSnapshot,
  type LayoutNode,
  type EditorTab,
  type EditorSession
} from "@contracts/session-state";

// --- fixtures --------------------------------------------------------------

function group(id: string): LayoutNode {
  return { id, type: "group", groupId: id };
}
function noteTab(id: string, groupId: string, noteId: string): EditorTab {
  return { id, groupId, kind: "note", noteId, sessionId: `s-${id}`, history: [noteId], historyIndex: 0 };
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
    ...(tab.kind === "note" ? { noteId: tab.noteId } : {})
  };
}

/** A standalone single-pane snapshot (a group leaf + its tabs), as
 *  `detachGroupSnapshot` produces and `importPaneSnapshot` consumes. */
function paneSnapshot(noteIds: string[], groupId = "src"): LayoutSnapshot {
  const tabs: Record<string, EditorTab> = {};
  const sessions: Record<string, EditorSession> = {};
  for (const noteId of noteIds) {
    const tab = noteTab(`t-${noteId}`, groupId, noteId);
    tabs[tab.id] = tab;
    sessions[tab.sessionId] = session(tab);
  }
  return {
    layout: { id: "src-leaf", type: "group", groupId },
    groups: { [groupId]: { id: groupId } },
    tabs,
    sessions,
    activeGroupId: groupId
  };
}

// --- detachGroupSnapshot ---------------------------------------------------

describe("detachGroupSnapshot", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("slices a group's note + attachment tabs (skips search) + their sessions", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    s.openTab(root, "n1");
    s.openTab(root, "n2");
    s.openAttachmentTab(root, { hash: "h1", filename: "f.png", mime: "image/png", size: 1 });
    s.openSearchTab("query");
    // sanity: the root group has 4 tabs total
    expect(s.tabsOf(root)).toHaveLength(4);

    const snap = s.detachGroupSnapshot(root);
    expect(snap).not.toBeNull();
    expect(snap!.layout).toEqual({ id: expect.any(String), type: "group", groupId: root });
    expect(Object.keys(snap!.groups)).toEqual([root]);
    // search tab excluded; 3 portable tabs carried.
    const kinds = Object.values(snap!.tabs).map((t) => t.kind);
    expect(kinds).toEqual(expect.arrayContaining(["note", "note", "attachment"]));
    expect(kinds).not.toContain("search");
    expect(Object.keys(snap!.tabs)).toHaveLength(3);
    // every carried tab's session survived.
    for (const t of Object.values(snap!.tabs)) {
      expect(snap!.sessions[t.sessionId]).toBeDefined();
    }
    expect(snap!.activeGroupId).toBe(root);
    // tab ids + group id preserved verbatim.
    for (const t of Object.values(snap!.tabs)) expect(t.groupId).toBe(root);
  });

  it("returns null for an unknown group", () => {
    const s = useEditorLayoutStore();
    s.init();
    expect(s.detachGroupSnapshot("does-not-exist")).toBeNull();
  });

  it("returns null for an empty group (nothing portable to detach)", () => {
    const s = useEditorLayoutStore();
    s.init();
    expect(s.detachGroupSnapshot(s.activeGroupId)).toBeNull();
  });

  it("returns null for a search-only group", () => {
    const s = useEditorLayoutStore();
    s.init();
    s.openSearchTab("only-search");
    expect(s.detachGroupSnapshot(s.activeGroupId)).toBeNull();
  });
});

// --- importPaneSnapshot ----------------------------------------------------

describe("importPaneSnapshot", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("edge zone splits the target + opens the pane's tabs in the new sibling", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    s.openTab(root, "n1");
    const snap = paneSnapshot(["nA", "nB"]);

    s.importPaneSnapshot(snap, root, "right");
    expect(s.groupCount).toBe(2);
    // n1 stayed in the root group; nA + nB landed together in the new sibling.
    expect(s.tabForNote("n1")?.groupId).toBe(root);
    const newGroup = s.tabForNote("nA")?.groupId;
    expect(newGroup).toBeDefined();
    expect(newGroup).not.toBe(root);
    expect(s.tabForNote("nB")?.groupId).toBe(newGroup);
    expect(s.tabsOf(newGroup!)).toHaveLength(2);
  });

  it("centre zone imports into the target group without splitting", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    s.openTab(root, "n1");
    const snap = paneSnapshot(["nA"]);

    s.importPaneSnapshot(snap, root, "center");
    expect(s.groupCount).toBe(1);
    expect(s.tabForNote("n1")?.groupId).toBe(root);
    expect(s.tabForNote("nA")?.groupId).toBe(root);
  });

  it("falls back to the active group when the target group is unknown (centre)", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const snap = paneSnapshot(["nA"]);

    s.importPaneSnapshot(snap, "nope", "center");
    expect(s.groupCount).toBe(1);
    expect(s.tabForNote("nA")?.groupId).toBe(root);
  });

  it("skips search tabs in the snapshot (not portable)", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    const searchTab: EditorTab = {
      id: "t-q",
      groupId: "src",
      kind: "search",
      searchQuery: "q",
      sessionId: "s-q",
      history: [],
      historyIndex: 0
    };
    const snap: LayoutSnapshot = {
      layout: group("src"),
      groups: { src: { id: "src" } },
      tabs: { "t-q": searchTab },
      sessions: { "s-q": { id: "s-q", tabId: "t-q", type: "default" } },
      activeGroupId: "src"
    };
    s.importPaneSnapshot(snap, root, "center");
    expect(s.groupCount).toBe(1);
    // nothing opened (search tab skipped, no new group created by a centre import)
    expect(Object.keys(s.tabs)).toHaveLength(0);
  });
});

// --- closeGroup force (detach the only pane) -------------------------------

describe("closeGroup — force flag", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("refuses the last group without force (no-op)", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    s.openTab(root, "n1");
    s.closeGroup(root);
    expect(s.groupCount).toBe(1);
    expect(s.tabForNote("n1")).toBeDefined();
  });

  it("force-closes the last group → re-inits an empty root pane", () => {
    const s = useEditorLayoutStore();
    s.init();
    const root = s.activeGroupId;
    s.openTab(root, "n1");
    s.closeGroup(root, true);
    expect(s.groupCount).toBe(1);
    expect(s.tabForNote("n1")).toBeUndefined();
    expect(s.layout).toEqual({ id: expect.any(String), type: "group", groupId: expect.any(String) });
  });
});

// --- pane-dnd handled flag -------------------------------------------------

describe("pane-dnd handled flag", () => {
  it("mark → consume returns true once, then false; reset clears", () => {
    resetPaneDropHandled();
    expect(consumePaneDropHandled()).toBe(false);
    markPaneDropHandled();
    expect(consumePaneDropHandled()).toBe(true);
    expect(consumePaneDropHandled()).toBe(false); // consumed → resets
    markPaneDropHandled();
    resetPaneDropHandled();
    expect(consumePaneDropHandled()).toBe(false);
  });
});

// --- session-state: pane windows -------------------------------------------

describe("session-state — pane windows", () => {
  it("ContextSessionSchema accepts a session with paneWindows", () => {
    const snap = paneSnapshot(["nA"]);
    const session = {
      ...emptyContextSession(),
      paneWindows: [{ paneId: "p1", bounds: { x: 0, y: 0, width: 1280, height: 800, maximized: false }, layout: snap }]
    };
    const res = ContextSessionSchema.safeParse(session);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.paneWindows).toHaveLength(1);
      expect(res.data.paneWindows[0].paneId).toBe("p1");
    }
  });

  it("normalizeContextSession defaults missing arrays to []", () => {
    // An old session file written before paneWindows existed.
    const old = { mainWindowOpenTabs: emptyLayoutSnapshot(), noteWindows: [] } as unknown as {
      mainWindowOpenTabs: LayoutSnapshot;
      noteWindows: unknown[];
      paneWindows?: unknown;
    };
    const normalized = normalizeContextSession(old as never);
    expect(normalized.paneWindows).toEqual([]);
    expect(normalized.noteWindows).toEqual([]);
  });

  it("filterLayoutSnapshot prunes a pane snapshot whose notes were all deleted", () => {
    const snap = paneSnapshot(["nA", "nB"]);
    const out = filterLayoutSnapshot(snap, []); // no valid note ids
    expect(out.layout).toBeNull();
  });

  it("filterLayoutSnapshot keeps a pane snapshot with valid notes", () => {
    const snap = paneSnapshot(["nA", "nB"]);
    const out = filterLayoutSnapshot(snap, ["nA", "nB"]);
    expect(out.layout).not.toBeNull();
    expect(Object.keys(out.tabs)).toHaveLength(2);
  });
});