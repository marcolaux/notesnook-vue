/**
 * Pure editor-layout tree + per-tab history logic (Phase 4.1) — the recursive
 * split/group layout model and back/forward navigation, kept framework-agnostic
 * so it is unit-tested in isolation (see `tests/contract/editor-layout.spec.ts`).
 * The Pinia store (`stores/editor-layout.ts`) composes these into reactive
 * state; the UI integration (SplitPane / Tabs / KeepAlive) is Phase 4.2/4.3.
 *
 * The model mirrors the upstream `@notesnook` editor-store contract so a later
 * wired integration stays compatible:
 *  - `LayoutNode`: a recursive tree. A `"split"` node has a `direction` +
 *    `children`; a `"group"` node is a leaf referencing an `EditorGroup` via
 *    `groupId` (and optionally a `size` for persisted split ratios).
 *  - `EditorGroup`: `id` + optional `activeTabId`.
 *
 * Split semantics (from upstream `getTopRightGroupId`):
 *  - `direction: "vertical"` lays children side-by-side (sash is vertical);
 *    the rightmost child is the *last* child.
 *  - `direction: "horizontal"` stacks children vertically; the topmost child
 *    is the *first* child.
 */

export type Direction = "vertical" | "horizontal";

export interface LayoutNode {
  id: string;
  type: "group" | "split";
  direction?: Direction;
  children?: LayoutNode[];
  /** Present on `"group"` leaves — references an `EditorGroup` by id. */
  groupId?: string;
  /** Persisted split ratio (Fraction of the parent split). */
  size?: number | string;
}

export interface EditorGroup {
  id: string;
  activeTabId?: string;
}

/** A group leaf: `type === "group"` (with a `groupId`). */
export function isGroupLeaf(node: LayoutNode): node is LayoutNode & { type: "group"; groupId: string } {
  return node.type === "group" && typeof node.groupId === "string";
}

/** Find the group leaf referencing `groupId`, if present. */
export function findGroupLeaf(node: LayoutNode, groupId: string): LayoutNode | undefined {
  if (isGroupLeaf(node) && node.groupId === groupId) return node;
  if (node.type === "split") {
    for (const child of node.children ?? []) {
      const found = findGroupLeaf(child, groupId);
      if (found) return found;
    }
  }
  return undefined;
}

/** All group-leaf `groupId`s, in tree (pre-order) order. */
export function allGroupIds(node: LayoutNode): string[] {
  const out: string[] = [];
  const walk = (n: LayoutNode): void => {
    if (isGroupLeaf(n)) out.push(n.groupId);
    else if (n.type === "split") for (const c of n.children ?? []) walk(c);
  };
  walk(node);
  return out;
}

/** Number of group leaves in the tree. */
export function countGroups(node: LayoutNode): number {
  return allGroupIds(node).length;
}

/**
 * The group id at the top-right corner of the layout. This is the only group
 * whose tab bar should reserve space for window controls (so they aren't
 * duplicated in every split pane). Mirrors upstream `getTopRightGroupId`.
 */
export function getTopRightGroupId(node: LayoutNode): string | undefined {
  if (node.type === "group") return node.groupId;
  if (node.type === "split" && node.children?.length) {
    const children = node.children;
    const idx = node.direction === "horizontal" ? 0 : children.length - 1;
    const next = children[idx];
    return next ? getTopRightGroupId(next) : undefined;
  }
  return undefined;
}

/**
 * Replace the group leaf referencing `groupId` with a new split node holding
 * the original group (first) and a fresh group (second, right/bottom). Returns
 * a new tree; the input is not mutated. The new split's `id` and the new
 * group's layout `id` + `groupId` are passed in so the util stays deterministic
 * (no `Math.random`).
 */
export function splitGroupLeaf(
  root: LayoutNode,
  groupId: string,
  direction: Direction,
  splitId: string,
  newLeafId: string,
  newGroupId: string
): LayoutNode {
  const walk = (node: LayoutNode): LayoutNode => {
    if (isGroupLeaf(node) && node.groupId === groupId) {
      return {
        id: splitId,
        type: "split",
        direction,
        children: [
          { ...node },
          { id: newLeafId, type: "group", groupId: newGroupId }
        ]
      };
    }
    if (node.type === "split") {
      return { ...node, children: (node.children ?? []).map(walk) };
    }
    return node;
  };
  return walk(root);
}

/**
 * Remove the group leaf referencing `groupId`. Splits that drop to a single
 * remaining child collapse to that child; splits that empty entirely are
 * removed (the parent re-collapses). Returns the new root, or `null` when the
 * removed leaf *was* the root (the store must re-initialise a fresh root).
 */
export function removeGroupLeaf(root: LayoutNode, groupId: string): LayoutNode | null {
  const walk = (node: LayoutNode): LayoutNode | null => {
    if (isGroupLeaf(node)) return node.groupId === groupId ? null : node;
    const children = (node.children ?? [])
      .map(walk)
      .filter((c): c is LayoutNode => c !== null);
    if (children.length === 0) return null;
    if (children.length === 1) return children[0]!; // collapse single-child split
    return { ...node, children };
  };
  return walk(root);
}

// --- Per-tab back/forward history -------------------------------------------

export interface HistoryState {
  history: string[];
  index: number;
}

/**
 * Push `noteId` onto a tab's history, truncating any forward stack (standard
 * browser behaviour). A consecutive duplicate of the current entry is a no-op
 * (the cursor stays put, no new entry). `now`-free and deterministic.
 */
export function pushHistory(
  history: readonly string[],
  index: number,
  noteId: string
): HistoryState {
  const truncated = history.slice(0, index + 1);
  if (truncated.length > 0 && truncated[truncated.length - 1] === noteId) {
    return { history: [...truncated], index: truncated.length - 1 };
  }
  const next = [...truncated, noteId];
  return { history: next, index: next.length - 1 };
}

/** New history index for a back step, or `null` at the earliest entry. */
export function navBack(history: readonly string[], index: number): number | null {
  void history;
  return index > 0 ? index - 1 : null;
}

/** New history index for a forward step, or `null` at the latest entry. */
export function navForward(history: readonly string[], index: number): number | null {
  return index < history.length - 1 ? index + 1 : null;
}