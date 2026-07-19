import { defineStore } from "pinia";
import { ref, computed } from "vue";
import {
  splitGroupLeaf,
  removeGroupLeaf,
  countGroups,
  getTopRightGroupId,
  pushHistory,
  navBack,
  navForward,
  type Direction,
  type LayoutNode,
  type EditorGroup
} from "@/utils/editor-layout";

/**
 * Editor-layout store (Phase 4.1) — the recursive split/group layout tree,
 * the flat group + tab registries, per-tab back/forward history, and the
 * session registry. This is the headless foundation for the multi-tab +
 * split-pane experience; the UI (SplitPane / Tabs / KeepAlive) is Phase
 * 4.2/4.3 and stays on-site.
 *
 * Model (mirrors the upstream `@notesnook` editor-store so a later wired
 * integration stays compatible):
 *  - `layout` is a recursive `LayoutNode` tree. A `"split"` node carries a
 *    `direction` + `children`; a `"group"` leaf references an `EditorGroup`
 *    via `groupId`.
 *  - `groups` is a flat `Record<groupId, EditorGroup>` (each with an
 *    `activeTabId`). The layout tree references groups by id; tabs reference
 *    their group via `tab.groupId`.
 *  - `tabs` is a flat `Record<tabId, EditorTab>`. Each tab holds its own
 *    back/forward history (`history` + `historyIndex`) of visited note ids.
 *  - `sessions` is a flat registry keyed by session id; a tab points at its
 *    active session. Session *content* hydration (loading the note body,
 *    vault-locked / readonly / conflicted detection) is on-site — here a
 *    session is `{ id, tabId, type, noteId, title? }`.
 *
 * The store takes note ids as opaque strings and never imports the notes
 * store, so it is unit-testable in isolation.
 */

export type SessionType = "default" | "locked" | "readonly" | "deleted" | "conflicted" | "diff";

export interface EditorSession {
  id: string;
  tabId: string;
  type: SessionType;
  noteId: string;
  title?: string;
}

export interface EditorTab {
  id: string;
  groupId: string;
  noteId: string;
  sessionId: string;
  /** Visited note ids (back/forward stack). */
  history: string[];
  historyIndex: number;
  pinned?: boolean;
}

function genId(): string {
  return crypto.randomUUID();
}

export const useEditorLayoutStore = defineStore("editor-layout", () => {
  const layout = ref<LayoutNode | null>(null);
  const groups = ref<Record<string, EditorGroup>>({});
  const tabs = ref<Record<string, EditorTab>>({});
  const sessions = ref<Record<string, EditorSession>>({});
  const activeGroupId = ref<string>("");

  // --- initialisation -------------------------------------------------------

  /** Create the root group. Idempotent — a no-op once initialised. */
  function init(): void {
    if (layout.value !== null) return;
    const rootId = genId();
    layout.value = { id: rootId, type: "group", groupId: rootId };
    groups.value = { [rootId]: { id: rootId } };
    activeGroupId.value = rootId;
  }

  // --- sessions -------------------------------------------------------------

  /**
   * Register (or reuse) a session for `(tabId, noteId, type)`. Idempotent on
   * that triple so back/forward restores the prior session object rather than
   * spawning duplicates. Returns the session id.
   */
  function registerSession(args: {
    tabId: string;
    noteId: string;
    type?: SessionType;
    title?: string;
    force?: boolean;
  }): string {
    const type: SessionType = args.type ?? "default";
    const existing = Object.values(sessions.value).find(
      (s) => s.tabId === args.tabId && s.noteId === args.noteId && s.type === type
    );
    if (existing && !args.force) return existing.id;
    const id = genId();
    sessions.value = {
      ...sessions.value,
      [id]: {
        id,
        tabId: args.tabId,
        type,
        noteId: args.noteId,
        ...(args.title !== undefined ? { title: args.title } : {})
      }
    };
    return id;
  }

  // --- splits ---------------------------------------------------------------

  /** Split the active group in `direction`, inserting a fresh sibling group to
   * its right/bottom. Returns the new group id (and focuses it). */
  function splitGroup(direction: Direction = "vertical"): string {
    return splitGroupAt(activeGroupId.value, direction);
  }

  /**
   * Open `noteId` in the active group (reuse-or-create), initialising the
   * root group first if the store hasn't been {@link init}ed yet. This is the
   * single-pane entry point the notes-store facade and the NotesList use; the
   * explicit-`groupId` {@link openTab} is for future multi-pane callers.
   */
  function openNote(noteId: string): string {
    if (layout.value === null) init();
    return openTab(activeGroupId.value, noteId);
  }

  /** Split an arbitrary group; returns the new group id (and focuses it). */
  function splitGroupAt(groupId: string, direction: Direction = "vertical"): string {
    if (layout.value === null || !groups.value[groupId]) return "";
    const newGroupId = genId();
    layout.value = splitGroupLeaf(
      layout.value,
      groupId,
      direction,
      genId(), // split node id
      genId(), // new group-leaf layout id
      newGroupId
    );
    groups.value = { ...groups.value, [newGroupId]: { id: newGroupId } };
    activeGroupId.value = newGroupId;
    return newGroupId;
  }

  /**
   * Close a group: drop its tabs + their sessions, remove the leaf, and
   * collapse any single-child split left behind. Refuses the last group.
   */
  function closeGroup(groupId: string): void {
    if (layout.value === null) return;
    if (countGroups(layout.value) <= 1) return; // never close the last group
    // Drop tabs owned by the group (and their sessions).
    const doomedTabs = Object.values(tabs.value).filter((t) => t.groupId === groupId);
    for (const t of doomedTabs) {
      const filtered = Object.fromEntries(
        Object.entries(sessions.value).filter(([, s]) => s.tabId !== t.id)
      );
      sessions.value = filtered;
      const nextTabs = { ...tabs.value };
      delete nextTabs[t.id];
      tabs.value = nextTabs;
    }
    const next = removeGroupLeaf(layout.value, groupId);
    if (next === null) {
      init(); // root group removed (shouldn't happen — last group refused)
      return;
    }
    layout.value = next;
    const nextGroups = { ...groups.value };
    delete nextGroups[groupId];
    groups.value = nextGroups;
    if (activeGroupId.value === groupId) {
      const ids = getTopRightGroupId(next) ?? Object.keys(nextGroups)[0] ?? "";
      activeGroupId.value = ids;
    }
  }

  // --- tabs -----------------------------------------------------------------

  /** Existing tab (in any group) showing `noteId`, or undefined. */
  function tabForNote(noteId: string): EditorTab | undefined {
    return Object.values(tabs.value).find((t) => t.noteId === noteId);
  }

  /**
   * Open `noteId` in a group: reuse an existing tab for the note (activating
   * its group) if one exists; otherwise create a new tab in `groupId`.
   * Returns the tab id. Opening never pushes in-tab history — that's
   * `navigateTab`.
   */
  function openTab(groupId: string, noteId: string): string {
    if (!groups.value[groupId]) return "";
    const existing = tabForNote(noteId);
    if (existing) {
      activateTab(existing.id);
      return existing.id;
    }
    const tabId = genId();
    const sessionId = registerSession({ tabId, noteId });
    tabs.value = {
      ...tabs.value,
      [tabId]: { id: tabId, groupId, noteId, sessionId, history: [noteId], historyIndex: 0 }
    };
    groups.value = { ...groups.value, [groupId]: { ...groups.value[groupId], activeTabId: tabId } };
    activeGroupId.value = groupId;
    return tabId;
  }

  /** Navigate an existing tab to `noteId`, pushing onto its back/forward history. */
  function navigateTab(tabId: string, noteId: string): void {
    const tab = tabs.value[tabId];
    if (!tab) return;
    const { history, index } = pushHistory(tab.history, tab.historyIndex, noteId);
    const sessionId = registerSession({ tabId, noteId });
    tabs.value = {
      ...tabs.value,
      [tabId]: { ...tab, history, historyIndex: index, noteId, sessionId }
    };
  }

  /** Close a tab. Its sessions are dropped; the group is left in place (an
   * empty group can host a new tab). The group's active tab moves to a
   * neighbour when the active tab closes. */
  function closeTab(tabId: string): void {
    const tab = tabs.value[tabId];
    if (!tab) return;
    const group = groups.value[tab.groupId];
    // Pick a neighbour in the same group to activate if this was active.
    let nextActive = group?.activeTabId;
    if (group?.activeTabId === tabId) {
      const siblings = Object.values(tabs.value).filter(
        (t) => t.groupId === tab.groupId && t.id !== tabId
      );
      nextActive = siblings[0]?.id;
    }
    sessions.value = Object.fromEntries(
      Object.entries(sessions.value).filter(([, s]) => s.tabId !== tabId)
    );
    const nextTabs = { ...tabs.value };
    delete nextTabs[tabId];
    tabs.value = nextTabs;
    if (group) {
      groups.value = {
        ...groups.value,
        [group.id]: { id: group.id, ...(nextActive !== undefined ? { activeTabId: nextActive } : {}) }
      };
    }
  }

  /** Activate a tab: set its group's `activeTabId` + focus the group. */
  function activateTab(tabId: string): void {
    const tab = tabs.value[tabId];
    if (!tab) return;
    const group = groups.value[tab.groupId];
    if (group) {
      groups.value = { ...groups.value, [group.id]: { ...group, activeTabId: tabId } };
    }
    activeGroupId.value = tab.groupId;
  }

  /** Focus a group (no tab change). */
  function setActiveGroup(groupId: string): void {
    if (groups.value[groupId]) activeGroupId.value = groupId;
  }

  /** Move a tab to a different group (and activate it there). */
  function moveTab(tabId: string, toGroupId: string): void {
    const tab = tabs.value[tabId];
    if (!tab || !groups.value[toGroupId] || tab.groupId === toGroupId) return;
    tabs.value = { ...tabs.value, [tabId]: { ...tab, groupId: toGroupId } };
    activateTab(tabId);
  }

  // --- history --------------------------------------------------------------

  function canGoBack(tabId: string): boolean {
    const tab = tabs.value[tabId];
    return !!tab && navBack(tab.history, tab.historyIndex) !== null;
  }

  function canGoForward(tabId: string): boolean {
    const tab = tabs.value[tabId];
    return !!tab && navForward(tab.history, tab.historyIndex) !== null;
  }

  /** Step a tab's history back; restores the prior note. No-op at the
   * earliest entry. Returns true on a successful step. */
  function goBack(tabId: string): boolean {
    const tab = tabs.value[tabId];
    if (!tab) return false;
    const i = navBack(tab.history, tab.historyIndex);
    if (i === null) return false;
    const noteId = tab.history[i]!;
    const sessionId = registerSession({ tabId, noteId });
    tabs.value = { ...tabs.value, [tabId]: { ...tab, historyIndex: i, noteId, sessionId } };
    return true;
  }

  /** Step a tab's history forward; returns true on a successful step. */
  function goForward(tabId: string): boolean {
    const tab = tabs.value[tabId];
    if (!tab) return false;
    const i = navForward(tab.history, tab.historyIndex);
    if (i === null) return false;
    const noteId = tab.history[i]!;
    const sessionId = registerSession({ tabId, noteId });
    tabs.value = { ...tabs.value, [tabId]: { ...tab, historyIndex: i, noteId, sessionId } };
    return true;
  }

  // --- computed views -------------------------------------------------------

  const groupCount = computed(() => (layout.value ? countGroups(layout.value) : 0));
  const topRightGroupId = computed(() => (layout.value ? getTopRightGroupId(layout.value) : undefined));
  const hasSplitLayout = computed(() => groupCount.value > 1);
  const activeTab = computed(() => {
    const g = groups.value[activeGroupId.value];
    const id = g?.activeTabId;
    return id ? tabs.value[id] ?? null : null;
  });

  /** The note id of the active tab (or `null` when no tab is open). The
   * notes-store facade reads this to derive `activeNote`. */
  const activeNoteId = computed<string | null>(() => activeTab.value?.noteId ?? null);

  /** Close the active tab (no-op when none is open). */
  function closeActiveTab(): void {
    const id = activeTab.value?.id;
    if (id) closeTab(id);
  }

  /** Tabs in a group, in insertion order. */
  function tabsOf(groupId: string): EditorTab[] {
    return Object.values(tabs.value).filter((t) => t.groupId === groupId);
  }

  return {
    layout,
    groups,
    tabs,
    sessions,
    activeGroupId,
    groupCount,
    topRightGroupId,
    hasSplitLayout,
    activeTab,
    activeNoteId,
    init,
    registerSession,
    splitGroup,
    splitGroupAt,
    closeGroup,
    openNote,
    openTab,
    navigateTab,
    closeTab,
    closeActiveTab,
    activateTab,
    setActiveGroup,
    moveTab,
    canGoBack,
    canGoForward,
    goBack,
    goForward,
    tabsOf
  };
});