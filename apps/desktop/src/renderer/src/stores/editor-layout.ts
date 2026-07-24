import { defineStore } from "pinia";
import { ref, computed } from "vue";
import {
  splitGroupLeaf,
  removeGroupLeaf,
  countGroups,
  getTopRightGroupId,
  allGroupIds,
  pushHistory,
  navBack,
  navForward,
  setSplitChildSizes,
  type Direction,
  type LayoutNode,
  type EditorGroup
} from "@/utils/editor-layout";
import type { LayoutSnapshot } from "@contracts/session-state";
import { useConfigStore, type TocMode } from "@/stores/config";

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

export type SessionType =
  | "default"
  | "locked"
  | "readonly"
  | "deleted"
  | "conflicted"
  | "diff"
  | "attachment";

/**
 * Payload carried by an attachment-preview tab. The `hash` is the durable link
 * to the stored blob (same key used by `db.attachments.read`); the rest is
 * cached metadata for the tab title + preview header.
 */
export interface AttachmentTabAttrs {
  hash: string;
  filename: string;
  mime: string;
  size: number;
}

export interface EditorSession {
  id: string;
  tabId: string;
  type: SessionType;
  /** Undefined for attachment sessions (no note). */
  noteId?: string;
  title?: string;
}

export interface EditorTab {
  id: string;
  groupId: string;
  /** Discriminates note tabs (the default, pre-existing kind), attachment preview
   *  tabs, and global-search results tabs. Note tabs carry `noteId`; attachment
   *  tabs carry `attachment`; search tabs carry `searchQuery`. */
  kind: "note" | "attachment" | "search";
  /** Present on note tabs; undefined on attachment/search tabs. */
  noteId?: string;
  /** Present on attachment tabs; undefined on note/search tabs. */
  attachment?: AttachmentTabAttrs;
  /** Present on search tabs; undefined on note/attachment tabs. The query that
   *  produced this results tab (used by `SearchResultsPane` to read the cached
   *  result set). */
  searchQuery?: string;
  sessionId: string;
  /** Visited note ids (back/forward stack). Empty for attachment/search tabs. */
  history: string[];
  historyIndex: number;
  pinned?: boolean;
  /** Per-tab note-history timeline sidebar visibility (note tabs only). */
  historyVisible?: boolean;
  /** Per-tab ToC/Minimap right-sidebar visibility (note tabs only). */
  tocVisible?: boolean;
  /** Per-tab ToC/Minimap mode: `"toc"` (heading outline) or `"minimap"`
   *  (VS-Code-style scaled content). Defaults to `"toc"` when first toggled
   *  on. Note tabs only. */
  tocMode?: "toc" | "minimap";
  /** Per-tab scroll position (scrollTop in pixels). */
  scrollTop?: number;
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
  const noteScrollPositions = ref<Record<string, number>>({});
  // Client-only persisted preferences (the ToC/Minimap last-used mode).
  const config = useConfigStore();

  // --- initialisation -------------------------------------------------------

  /** Create the root group. Idempotent — a no-op once initialised. */
  function init(): void {
    if (layout.value !== null) return;
    const rootId = genId();
    layout.value = { id: rootId, type: "group", groupId: rootId };
    groups.value = { [rootId]: { id: rootId } };
    activeGroupId.value = rootId;
  }

  /**
   * Restore a persisted layout snapshot (session restore). Directly assigns
   * the five refs rather than replaying `openTab`/`splitGroupAt` — replay would
   * regenerate tab/session ids, drop sash `size` ratios, and fire focus churn.
   * The snapshot's note ids MUST already be validated against the current
   * account's DB by the caller (see `platform/session-restore.ts` →
   * `filterLayoutSnapshot`) — the store stays note-id-agnostic (opaque
   * strings) and never imports the notes store.
   *
   * An empty/invalid snapshot (`layout: null` or no groups) falls through to
   * `init()` so a fresh boot or an "everything-was-deleted" restore lands on a
   * clean empty root pane.
   */
  function hydrate(snapshot: LayoutSnapshot): void {
    if (
      !snapshot ||
      snapshot.layout === null ||
      Object.keys(snapshot.groups).length === 0
    ) {
      layout.value = null;
      init();
      return;
    }
    layout.value = snapshot.layout;
    groups.value = { ...snapshot.groups };
    tabs.value = { ...snapshot.tabs };
    sessions.value = { ...snapshot.sessions };
    activeGroupId.value = snapshot.activeGroupId;
  }

  // --- sessions -------------------------------------------------------------

  /**
   * Register (or reuse) a session for `(tabId, noteId, type)`. Idempotent on
   * that triple so back/forward restores the prior session object rather than
   * spawning duplicates. Returns the session id.
   */
  function registerSession(args: {
    tabId: string;
    /** Undefined for attachment sessions. */
    noteId?: string;
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
        ...(args.noteId !== undefined ? { noteId: args.noteId } : {}),
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

  /** Split an arbitrary group; returns the new group id (and focuses it).
   *  `position` controls which side the fresh sibling lands on (`"after"` =
   *  right/bottom, `"before"` = left/top) — used by the drag-to-split drop zones. */
  function splitGroupAt(
    groupId: string,
    direction: Direction = "vertical",
    position: "before" | "after" = "after"
  ): string {
    if (layout.value === null || !groups.value[groupId]) return "";
    const newGroupId = genId();
    layout.value = splitGroupLeaf(
      layout.value,
      groupId,
      direction,
      genId(), // split node id
      genId(), // new group-leaf layout id
      newGroupId,
      position
    );
    groups.value = { ...groups.value, [newGroupId]: { id: newGroupId } };
    activeGroupId.value = newGroupId;
    return newGroupId;
  }

  /**
   * Drop a tab onto an editor pane's edge zone: split the target group in the
   * zone's direction (the new sibling on the zone's side) and move the dragged
   * tab into the new sibling. `zone` is the pane edge the cursor was in
   * (`left`/`right` → a vertical split; `top`/`bottom` → horizontal); the new
   * sibling is placed on the zone's side (`before` for left/top, `after` for
   * right/bottom). If the move empties the source group it collapses (handled
   * by `moveTab`), so dragging the only tab of a pane to an edge tears it into
   * its own pane without leaving an empty pane behind.
   */
  function dropTabToSplit(
    targetGroupId: string,
    tabId: string,
    zone: "left" | "right" | "top" | "bottom"
  ): void {
    if (layout.value === null || !groups.value[targetGroupId]) return;
    const tab = tabs.value[tabId];
    if (!tab) return;
    const vertical = zone === "left" || zone === "right";
    const position: "before" | "after" =
      zone === "right" || zone === "bottom" ? "after" : "before";
    const newGroupId = splitGroupAt(
      targetGroupId,
      vertical ? "vertical" : "horizontal",
      position
    );
    if (!newGroupId) return;
    moveTab(tabId, newGroupId);
  }

  /**
   * Open `noteId` split off from `targetGroupId` in `zone`'s direction — the
   * cross-window counterpart to {@link dropTabToSplit}: split the target group
   * (new sibling on the zone's side) and open the note as a new tab in that
   * sibling. Used by the cross-window `app:open-note-at` handler when a tab
   * dragged from another window is released over this window's editor body
   * edge. If the note is already a tab in this window, just activate it (no
   * split). Falls back to a plain {@link openNote} (active group) when the
   * target group can't be split.
   */
  function openNoteSplit(
    targetGroupId: string,
    noteId: string,
    zone: "left" | "right" | "top" | "bottom"
  ): string {
    if (layout.value === null) return "";
    // Reuse an existing tab for the note if one is already open in this window
    // (openTab reuses across groups) — activating it is better than splitting.
    const existing = tabForNote(noteId);
    if (existing) {
      activateTab(existing.id);
      return existing.id;
    }
    if (!groups.value[targetGroupId]) return openNote(noteId);
    const vertical = zone === "left" || zone === "right";
    const position: "before" | "after" =
      zone === "right" || zone === "bottom" ? "after" : "before";
    const newGroupId = splitGroupAt(
      targetGroupId,
      vertical ? "vertical" : "horizontal",
      position
    );
    if (!newGroupId) return openNote(noteId);
    return openTab(newGroupId, noteId);
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
    collapseGroup(groupId);
  }

  /**
   * Remove a group leaf from the layout tree + the `groups` registry, collapsing
   * the single-child split left behind, and re-home the active group if it was
   * the one removed. Assumes the group's tabs have already been dropped (by
   * `closeGroup` or `closeTab`); does NOT touch `tabs`/`sessions`. Re-initialises
   * a fresh root only when the removed leaf WAS the root (the last group —
   * callers guard against this).
   */
  function collapseGroup(groupId: string): void {
    if (layout.value === null) return;
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
      activeGroupId.value = getTopRightGroupId(next) ?? Object.keys(nextGroups)[0] ?? "";
    }
  }

  /**
   * Collapse a group when it has no tabs left AND other panes remain. Used by
   * `closeTab` (closing the last tab of a pane removes the pane) and `moveTab`
   * (moving the last tab out of a pane removes the pane), so empty panes never
   * linger — the split collapses cleanly. The last pane is always kept (an
   * empty root pane hosts the draft editor / new tabs).
   */
  function collapseGroupIfEmpty(groupId: string): void {
    if (layout.value === null) return;
    if (countGroups(layout.value) <= 1) return;
    if (tabsOf(groupId).length !== 0) return;
    collapseGroup(groupId);
  }

  /**
   * Persist a sash drag: set the `size` ratio on the two adjacent children
   * `[childIndex]` / `[childIndex+1]` of the split node `splitId`. `fraction`
   * is the first child's share (clamped to `[0.05, 0.95]` by the pure util).
   * No-op when the split id is unknown (the tree may have changed mid-drag).
   */
  function resizeSplitChildren(splitId: string, childIndex: number, fraction: number): void {
    if (layout.value === null) return;
    layout.value = setSplitChildSizes(layout.value, splitId, childIndex, fraction);
  }

  // --- tabs -----------------------------------------------------------------

  /** Existing note tab (in any group) showing `noteId`, or undefined.
   *  Scoped to `kind === "note"` so attachment tabs never collide. */
  function tabForNote(noteId: string): EditorTab | undefined {
    return Object.values(tabs.value).find((t) => t.kind === "note" && t.noteId === noteId);
  }

  /** Existing attachment tab (in any group) previewing `hash`, or undefined. */
  function tabForAttachment(hash: string): EditorTab | undefined {
    return Object.values(tabs.value).find(
      (t) => t.kind === "attachment" && t.attachment?.hash === hash
    );
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
      [tabId]: { id: tabId, groupId, kind: "note", noteId, sessionId, history: [noteId], historyIndex: 0 }
    };
    groups.value = { ...groups.value, [groupId]: { ...groups.value[groupId], activeTabId: tabId } };
    activeGroupId.value = groupId;
    return tabId;
  }

  /**
   * Open an attachment-preview tab in a group: reuse an existing tab for the
   * attachment hash (activating its group) if one exists; otherwise create a
   * new tab in `groupId`. Returns the tab id. Mirrors {@link openTab} for
   * attachment previews.
   */
  function openAttachmentTab(groupId: string, attrs: AttachmentTabAttrs): string {
    if (!groups.value[groupId]) return "";
    const existing = tabForAttachment(attrs.hash);
    if (existing) {
      activateTab(existing.id);
      return existing.id;
    }
    const tabId = genId();
    const sessionId = registerSession({
      tabId,
      type: "attachment",
      title: attrs.filename
    });
    tabs.value = {
      ...tabs.value,
      [tabId]: {
        id: tabId,
        groupId,
        kind: "attachment",
        attachment: attrs,
        sessionId,
        history: [],
        historyIndex: 0
      }
    };
    groups.value = { ...groups.value, [groupId]: { ...groups.value[groupId], activeTabId: tabId } };
    activeGroupId.value = groupId;
    return tabId;
  }

  /** Existing search-results tab (in any group) for `query`, or undefined. */
  function tabForSearch(query: string): EditorTab | undefined {
    return Object.values(tabs.value).find(
      (t) => t.kind === "search" && t.searchQuery === query
    );
  }

  /**
   * Open a global-search results tab for `query` in the active group: reuse an
   * existing results tab for the same query (activating its group) if one
   * exists; otherwise create a new `kind: "search"` tab. Mirrors {@link openTab}
   * / {@link openAttachmentTab} but for the results-tab surface. The tab carries
   * `searchQuery` (no `noteId`); `SearchResultsPane` reads the cached result set
   * for it from the search store. Returns the tab id.
   */
  function openSearchTab(query: string): string {
    if (layout.value === null) init();
    const groupId = activeGroupId.value;
    if (!groups.value[groupId]) return "";
    const existing = tabForSearch(query);
    if (existing) {
      activateTab(existing.id);
      return existing.id;
    }
    const tabId = genId();
    const sessionId = registerSession({ tabId, type: "default" });
    tabs.value = {
      ...tabs.value,
      [tabId]: {
        id: tabId,
        groupId,
        kind: "search",
        searchQuery: query,
        sessionId,
        history: [],
        historyIndex: 0
      }
    };
    groups.value = { ...groups.value, [groupId]: { ...groups.value[groupId], activeTabId: tabId } };
    activeGroupId.value = groupId;
    return tabId;
  }

  /**
   * Open an attachment preview split off from `targetGroupId` in `zone`'s
   * direction — the attachment-preview counterpart to {@link openNoteSplit}:
   * split the target group (new sibling on the zone's side) and open the
   * attachment as a new tab in that sibling. If the attachment is already a tab
   * in this window, just activate it (no split). Falls back to opening in the
   * active group when the target group can't be split.
   */
  function openAttachmentSplit(
    targetGroupId: string,
    attrs: AttachmentTabAttrs,
    zone: "left" | "right" | "top" | "bottom"
  ): string {
    if (layout.value === null) return "";
    const existing = tabForAttachment(attrs.hash);
    if (existing) {
      activateTab(existing.id);
      return existing.id;
    }
    if (!groups.value[targetGroupId]) {
      if (layout.value === null) init();
      return openAttachmentTab(activeGroupId.value, attrs);
    }
    const vertical = zone === "left" || zone === "right";
    const position: "before" | "after" = zone === "right" || zone === "bottom" ? "after" : "before";
    const newGroupId = splitGroupAt(
      targetGroupId,
      vertical ? "vertical" : "horizontal",
      position
    );
    if (!newGroupId) return openAttachmentTab(activeGroupId.value, attrs);
    return openAttachmentTab(newGroupId, attrs);
  }

  /** Navigate an existing note tab to `noteId`, pushing onto its back/forward
   *  history. No-op for attachment tabs (they have no note history). */
  function navigateTab(tabId: string, noteId: string): void {
    const tab = tabs.value[tabId];
    if (!tab || tab.kind !== "note") return;
    const { history, index } = pushHistory(tab.history, tab.historyIndex, noteId);
    const sessionId = registerSession({ tabId, noteId });
    tabs.value = {
      ...tabs.value,
      [tabId]: { ...tab, history, historyIndex: index, noteId, sessionId }
    };
  }

  /** Close a tab. Its sessions are dropped. The group's active tab moves to a
   *  neighbour when the active tab closes. When this close empties the group and
   *  other panes remain, the group is removed (the pane collapses) — so closing
   *  the last tab of a pane removes the pane. The last pane is always kept (it
   *  hosts the draft editor / new tabs). */
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
    collapseGroupIfEmpty(tab.groupId);
  }

  /**
   * Close every tab across all groups, dropping their sessions. The layout tree
   * + groups are kept (an empty group can host a new tab); each group's
   * `activeTabId` is cleared. Used on an account/context switch — open tabs
   * reference note ids from the *previous* context's database, which either
   * don't exist or point at different notes in the new context, so keeping
   * them would show stale/wrong content. Search/sort prefs live in the notes
   * store and are not reset here.
   */
  function closeAllTabs(): void {
    if (layout.value === null) {
      init();
      return;
    }
    tabs.value = {};
    sessions.value = {};
    // Strip every group's active tab (keep the groups themselves).
    const nextGroups: Record<string, EditorGroup> = {};
    for (const [id, g] of Object.entries(groups.value)) {
      nextGroups[id] = { id: g.id };
    }
    groups.value = nextGroups;
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

  /** Toggle the per-tab note-history timeline sidebar on a note tab. No-op for
   *  attachment tabs or unknown ids. */
  function toggleHistory(tabId: string): void {
    const tab = tabs.value[tabId];
    if (!tab || tab.kind !== "note") return;
    tabs.value = { ...tabs.value, [tabId]: { ...tab, historyVisible: !tab.historyVisible } };
  }

  /** Toggle the per-tab ToC/Minimap right sidebar on a note tab. Seeds the
   *  mode to the last-used one (persisted in the client-only config store) on
   *  first open, and leaves it set when hidden so the choice persists across
   *  hide/show within a tab. No-op for attachment/search tabs or unknown ids. */
  function toggleToc(tabId: string): void {
    const tab = tabs.value[tabId];
    if (!tab || tab.kind !== "note") return;
    const next = !tab.tocVisible;
    const patch: { tocVisible: boolean; tocMode?: TocMode } = { tocVisible: next };
    if (next && !tab.tocMode) patch.tocMode = config.tocMode;
    tabs.value = { ...tabs.value, [tabId]: { ...tab, ...patch } };
  }

  /** Switch the per-tab ToC/Minimap mode + persist it as the last-used default
   *  (so the next tab to open its sidebar starts in this mode). No-op for
   *  non-note tabs / unknown ids. */
  function setTocMode(tabId: string, mode: TocMode): void {
    const tab = tabs.value[tabId];
    if (!tab || tab.kind !== "note") return;
    tabs.value = { ...tabs.value, [tabId]: { ...tab, tocMode: mode } };
    config.setTocMode(mode);
  }

  /** Focus the next group in tree (pre-order) order, wrapping. No-op with <2
   *  groups. Used by the "Focus next pane" command. */
  function focusNextGroup(): void {
    if (layout.value === null) return;
    const ids = allGroupIds(layout.value);
    if (ids.length < 2) return;
    const idx = ids.indexOf(activeGroupId.value);
    const next = idx < 0 ? ids[0]! : ids[(idx + 1) % ids.length]!;
    activeGroupId.value = next;
  }

  /** Move a tab to a different group (and activate it there). When the move
   *  empties the source group and other panes remain, the source group is
   *  removed (the pane collapses) — so moving the last tab out of a pane
   *  removes the pane (and dragging a pane's only tab to a split edge tears it
   *  into its own pane without leaving an empty pane behind).
   *
   *  When the moved tab WAS the source group's active tab, the source group's
   *  `activeTabId` is reassigned to a remaining sibling (cleared when none
   *  remain) — otherwise the source pane would keep a stale reference to the
   *  now-moved tab and render its note's content in BOTH panes (and never switch
   *  to the next tab). */
  function moveTab(tabId: string, toGroupId: string): void {
    const tab = tabs.value[tabId];
    if (!tab || !groups.value[toGroupId] || tab.groupId === toGroupId) return;
    const fromGroupId = tab.groupId;
    tabs.value = { ...tabs.value, [tabId]: { ...tab, groupId: toGroupId } };
    // Reassign the SOURCE group's active tab if it was the moved tab, so the
    // source pane switches to a remaining sibling instead of clinging to the
    // moved tab (which now renders in the destination pane).
    const fromGroup = groups.value[fromGroupId];
    if (fromGroup?.activeTabId === tabId) {
      const next = Object.values(tabs.value).find(
        (t) => t.groupId === fromGroupId && t.id !== tabId
      );
      groups.value = {
        ...groups.value,
        [fromGroupId]: { id: fromGroupId, ...(next ? { activeTabId: next.id } : {}) }
      };
    }
    activateTab(tabId); // activate in the DESTINATION group + focus it
    collapseGroupIfEmpty(fromGroupId);
  }

  /**
   * Reorder a tab within its group to `toIndex` (the index in the group's tab
   * list AFTER the tab is removed — i.e. the desired final position, clamped to
   * `[0, groupSize-1]`). Tab order is the insertion order of the `tabs` record
   * (`tabsOf` uses `Object.values`), so reordering rebuilds the record with the
   * group's tabs in the new sequence while leaving other groups' tabs in place.
   * No-op (skips the rebuild) when the resulting order is unchanged.
   */
  function reorderTab(groupId: string, tabId: string, toIndex: number): void {
    if (!groups.value[groupId]) return;
    const groupTabs = tabsOf(groupId);
    const fromIdx = groupTabs.findIndex((t) => t.id === tabId);
    if (fromIdx < 0) return;
    const moved = groupTabs[fromIdx]!;
    const arr = groupTabs.filter((t) => t.id !== tabId); // after removal
    const clamped = Math.max(0, Math.min(toIndex, arr.length));
    arr.splice(clamped, 0, moved);
    // Skip the rebuild (and the reactivity churn) if the order is unchanged.
    if (arr.every((t, i) => t.id === groupTabs[i]?.id)) return;
    const next: Record<string, EditorTab> = {};
    let gi = 0;
    for (const [id, t] of Object.entries(tabs.value)) {
      if (t.groupId === groupId) {
        const replacement = arr[gi++]!;
        next[replacement.id] = replacement;
      } else {
        next[id] = t;
      }
    }
    tabs.value = next;
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

  /** Cycle the active group's active tab by `dir` (+1 next, −1 prev), wrapping.
   *  No-op when the active group has fewer than 2 tabs. */
  function cycleTab(dir: 1 | -1): void {
    const g = groups.value[activeGroupId.value];
    const id = g?.activeTabId;
    if (!id) return;
    const siblings = tabsOf(activeGroupId.value);
    if (siblings.length < 2) return;
    const idx = siblings.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const next = siblings[(idx + dir + siblings.length) % siblings.length]!;
    activateTab(next.id);
  }

  /** Tabs in a group, in insertion order. */
  function tabsOf(groupId: string): EditorTab[] {
    return Object.values(tabs.value).filter((t) => t.groupId === groupId);
  }

  /** Save scroll position for a tab and/or note. */
  function saveScrollPosition(
    tabId: string | undefined,
    noteId: string | undefined,
    scrollTop: number
  ): void {
    if (scrollTop < 0) return;
    if (noteId) {
      noteScrollPositions.value[noteId] = scrollTop;
    }
    if (tabId && tabs.value[tabId]) {
      tabs.value[tabId] = {
        ...tabs.value[tabId],
        scrollTop
      };
    }
  }

  /** Retrieve saved scroll position for a tab or note (falls back to 0). */
  function getScrollPosition(tabId: string | undefined, noteId: string | undefined): number {
    if (tabId && tabs.value[tabId]?.scrollTop !== undefined) {
      return tabs.value[tabId].scrollTop!;
    }
    if (noteId && noteScrollPositions.value[noteId] !== undefined) {
      return noteScrollPositions.value[noteId];
    }
    return 0;
  }

  return {
    layout,
    groups,
    tabs,
    sessions,
    activeGroupId,
    noteScrollPositions,
    groupCount,
    topRightGroupId,
    hasSplitLayout,
    activeTab,
    activeNoteId,
    init,
    hydrate,
    registerSession,
    splitGroup,
    splitGroupAt,
    dropTabToSplit,
    openNoteSplit,
    tabForNote,
    tabForAttachment,
    tabForSearch,
    closeGroup,
    resizeSplitChildren,
    openNote,
    openTab,
    openSearchTab,
    openAttachmentTab,
    openAttachmentSplit,
    navigateTab,
    closeTab,
    closeAllTabs,
    closeActiveTab,
    cycleTab,
    activateTab,
    setActiveGroup,
    toggleHistory,
    toggleToc,
    setTocMode,
    focusNextGroup,
    moveTab,
    reorderTab,
    canGoBack,
    canGoForward,
    goBack,
    goForward,
    tabsOf,
    saveScrollPosition,
    getScrollPosition
  };
});