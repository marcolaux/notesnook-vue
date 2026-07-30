/*
Pure helpers for the list drag-reorder plugin (see ./index.ts).

`computeDragGroup` is fully pure (takes a doc + the grabbed item's position) and
collapses the editor's TWO list-indentation models into one "group range":

  - Checklist items (`taskItem` / `checkListItem`) indent VISUALLY via a flat
    `data-indent` attribute on sibling rows. Indented "sub-tasks" are later
    siblings with a higher `indent`, not descendants — so the group is the grabbed
    row PLUS the following consecutive siblings whose `indent` exceeds the
    grabbed row's. Default ProseMirror drag moves only the one grabbed row and
    leaves those sub-tasks behind; this scan is what fixes that.
  - `listItem` / `outlineListItem` indent via REAL ProseMirror nesting, so the
    grabbed item's nested subtree is already part of the node — the group is just
    the single item node (`to = from + nodeSize`) and children ride along
    automatically.

`computeDropTarget` needs an `EditorView` (for `posAtCoords`). The target row's
rect is read from the DOM (`event.target`'s closest `<li>`) — NOT
`view.coordsAtPos`, which is unreliable at node boundaries for TipTap Vue node
views and was the cause of on-device outdent flakiness. A drop can RE-LEVEL the
group, so any item can be moved to ANY depth. BOTH list kinds now use the SAME
vertical 3-band interaction (so every list type behaves identically):

  - Top 35% → sibling BEFORE the row, at the row's depth.
  - Bottom 35% → sibling AFTER the row's subtree.
  - Middle 30% → NEST as the row's child (one level deeper).
  - OUTDENT = drop the child onto a SHALLOWER row (an ancestor): its depth is
    smaller, so the sibling insert lands in the shallower list — one gesture to
    any depth (a level-4 child to level 1 by dropping it on the top-level row).

The bands are measured on the row's OWN text line (its first `<p>`), NOT the
full `<li>` rect: a real-nesting `<li>` contains its subtree, so the `<li>` rect
spans the children and would put the nest band over them, where `closest('li')`
returns a child and nest became unreachable. For flat checklists the `<li>` rect
IS the row (sub-items are siblings, not children), so the two coincide.

The difference between the two kinds is only in HOW a sibling drop changes depth:
  - Flat checklists (`taskItem`/`checkListItem`): sibling drops RE-`indent` the
    group rows to the target's `indent` (`rebuildChecklistGroup`, relative
    structure preserved); nest re-`indent`s to `target.indent + 1`.
  - Real-nesting (`listItem`/`outlineListItem`): the group's depth is set by
    whichever list it's inserted into, so no re-indent — `realNestingDropTarget`
    resolves the insert position at the target depth; nest moves the grabbed
    item into the target's child list (or creates one).

Drops are constrained to the SAME top-level list TREE as the source (the source
and target must share one outermost list node). This permits moving between the
nested levels of one list — the whole point — while forbidding leaping between
two unrelated lists. A cross-level move can take the only item out of a nested
list; `deleteSourceGroup` (used by the plugin's `handleDrop`) then deletes that
whole list node instead of just the item, so no empty list or empty-item shell
is left behind (a `listItem` always keeps its required paragraph).

Nest math differs by indent model and lives in `nestInsert` (used by the plugin's
`handleDrop`): checklists re-`indent` the group rows to `target.indent + 1`
(preserving relative structure) and insert at the end of the target's subtree;
real-nesting types move the grabbed item into the target's existing child list of
the same type, or create a new child list inside the target.
*/
import { Fragment, type Node as ProsemirrorNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import { findParentNodeClosestToPos } from "../../utils/prosemirror";
import { MAX_LIST_INDENT } from "../../utils/list-indent";

/** Node names that can be grabbed + reordered as a list row. */
export const LIST_ITEM_TYPES = new Set([
  "taskItem",
  "checkListItem",
  "listItem",
  "outlineListItem"
]);

/** Container node names whose direct children are list items. */
export const LIST_NODE_TYPES = new Set([
  "taskList",
  "checkList",
  "bulletList",
  "orderedList",
  "outlineList"
]);

/** Checklist item node names — the ones using the flat `data-indent` model. */
export const CHECKLIST_ITEM_TYPES = new Set(["taskItem", "checkListItem"]);

export interface DragGroup {
  /** Doc pos of the first node in the group (before it). */
  from: number;
  /** Doc pos after the last node in the group. */
  to: number;
  /** Doc pos of the containing list node (before it). */
  listPos: number;
  /** Containing list node type name (e.g. `taskList`). */
  listType: string;
}

/** A resolved drop target.
 *  - `reorder` = insert as a sibling of an item at `insertPos`; the group is
 *    re-leveled to `baseIndent` (flat checklists) or to whatever depth the
 *    target list sits at (real-nesting, `baseIndent === null`).
 *  - `nest` = drop onto `targetPos`'s item to make the group its sub-item;
 *    `before` = insert as the first child (else the last). */
export type DropTarget =
  | { kind: "reorder"; insertPos: number; baseIndent: number | null }
  | { kind: "nest"; targetPos: number; before: boolean };

/** A resolved drop + the DOM rect to draw the marker at (the anchor `<li>` for a
 *  reorder, the row `<li>` for a nest). `markerBefore` places the reorder line
 *  at the anchor's top (before) or bottom (after its subtree). `markerRect` is
 *  `null` when no DOM row was available (list-padding / fallback) — the caller
 *  then falls back to `coordsAtPos`. */
export interface DropResolution {
  target: DropTarget;
  markerRect: DOMRect | null;
  markerBefore: boolean;
}

/**
 * Doc pos of the OUTERMOST list ancestor containing the list at `listPos` (walk
 * up to the highest `LIST_NODE_TYPES` node). Used to confine a drag to one list
 * tree: a nested item lives in a different list INSTANCE than its parent, so a
 * same-instance check would wrongly forbid cross-level moves — we compare the
 * shared top-level list instead.
 */
export function topLevelListPos(doc: ProsemirrorNode, listPos: number): number {
  // Resolve just inside the list (listPos + 1 = before its first child).
  const $pos = doc.resolve(listPos + 1);
  // `$pos.node(i)` climbs ancestors OUTER (i=1, just inside the doc) → INNER
  // (i=depth, the list itself). The OUTERMOST list ancestor is the FIRST match
  // (smallest i), so return it immediately — do NOT keep overwriting `top` with
  // later (inner) matches, which would wrongly return the INNERMOST list and
  // reject every cross-level move (a nested item's innermost list ≠ its parent's).
  for (let i = 1; i <= $pos.depth; i += 1) {
    if (LIST_NODE_TYPES.has($pos.node(i).type.name)) {
      return $pos.before(i);
    }
  }
  return listPos;
}

/** Index within `list` of the child whose doc pos is `childPos`, or -1. `list`
 *  is a `findParentNodeClosestToPos` result (`{ node, start }`): `start` is the
 *  pos before the first child, and we accumulate `nodeSize` to match `childPos`.
 *  Shared by `computeDragGroup` and `endOfChecklistSubtree` (both walk siblings
 *  by accumulated size). */
function indexOfListItem(
  list: { node: ProsemirrorNode; start: number },
  childPos: number
): number {
  let acc = list.start;
  for (let i = 0; i < list.node.childCount; i += 1) {
    if (acc === childPos) return i;
    acc += list.node.child(i).nodeSize;
  }
  return -1;
}

/**
 * Compute the contiguous group of list-item nodes that should move together when
 * the item at `itemPos` is dragged. See the file header for the two models.
 * Returns `null` if `itemPos` isn't inside a list (e.g. a non-list block was
 * grabbed).
 */
export function computeDragGroup(
  doc: ProsemirrorNode,
  itemPos: number
): DragGroup | null {
  const node = doc.nodeAt(itemPos);
  if (!node || !LIST_ITEM_TYPES.has(node.type.name)) return null;

  const $pos = doc.resolve(itemPos);
  const list = findParentNodeClosestToPos($pos, (n) =>
    LIST_NODE_TYPES.has(n.type.name)
  );
  if (!list) return null;

  const from = itemPos;
  let to = itemPos + node.nodeSize;

  // Checklist visual-indent model: extend to following higher-indent siblings.
  if (CHECKLIST_ITEM_TYPES.has(node.type.name)) {
    const grabbedIndent = Number(node.attrs.indent ?? 0);
    const index = indexOfListItem(list, itemPos);
    if (index !== -1) {
      for (let i = index + 1; i < list.node.childCount; i += 1) {
        const sib = list.node.child(i);
        const sibIndent = Number(sib.attrs.indent ?? 0);
        if (sibIndent <= grabbedIndent) break;
        to += sib.nodeSize;
      }
    }
  }

  return { from, to, listPos: list.pos, listType: list.node.type.name };
}

/**
 * Ancestor chain of the list item at `itemPos`, OUTERMOST (top-level) first:
 * `chain[0]` = the top-level item, `chain[chain.length - 1]` = the item itself.
 * Pure (no view). Resolved just INSIDE the item (`itemPos + 1`, before its first
 * child) so `$pos.node(i)` climbs the item + its containing items; the
 * `paragraph block*` content model guarantees the item's own paragraph is the
 * first child, so this position is always inside the item (never in a child
 * list). `rowDepth = chain.length - 1` (0 = top level).
 */
export function itemAncestorChain(
  doc: ProsemirrorNode,
  itemPos: number
): { pos: number; node: ProsemirrorNode }[] {
  const $pos = doc.resolve(itemPos + 1);
  const items: { pos: number; node: ProsemirrorNode }[] = [];
  for (let i = 1; i <= $pos.depth; i += 1) {
    const n = $pos.node(i);
    if (LIST_ITEM_TYPES.has(n.type.name)) {
      items.push({ pos: $pos.before(i), node: n });
    }
  }
  return items;
}

/**
 * Real-nesting drop target for a given `targetDepth` (0 = top level): insert the
 * group as a SIBLING at `targetDepth` — before/after the anchor item at that
 * depth on the row's ancestor chain — or NEST when `targetDepth` is one deeper
 * than the row. Pure (no view, no DOM) so it is unit-tested directly; the
 * view-dependent `computeDropTarget` resolves `targetDepth` from the vertical
 * band the cursor is in on the row's text line (`rowDepth` for a sibling drop,
 * `rowDepth + 1` for the nest band) and calls this. Outdent to a shallower level
 * is reached by dropping on a shallower row (whose `rowDepth` is smaller), so
 * the sibling insert lands in that shallower list.
 *
 * `chain` is the row's `itemAncestorChain` (`chain[T]` = the item at depth T).
 * `targetDepth == rowDepth + 1` → nest under the row; `<= rowDepth` → sibling
 * at that depth (`chain[targetDepth]` is the anchor; before → its start, after
 * → past its whole subtree). Cross-branch moves work because the anchor is on
 * the ROW's chain, not the source's; the group is deleted from its own branch
 * and inserted into the anchor's parent list at depth T. Self-drops (the
 * computed insert position lands on the source's own span/boundary) are rejected.
 */
export function realNestingDropTarget(
  doc: ProsemirrorNode,
  itemPos: number,
  targetDepth: number,
  before: boolean,
  source: DragGroup
): DropTarget | null {
  const chain = itemAncestorChain(doc, itemPos);
  if (chain.length === 0) return null;
  const rowDepth = chain.length - 1;
  if (targetDepth > rowDepth) {
    // One level deeper than the row → nest as the row's child.
    return { kind: "nest", targetPos: itemPos, before };
  }
  const anchor = chain[targetDepth]!;
  const insertPos = before ? anchor.pos : anchor.pos + anchor.node.nodeSize;
  if (isReorderSelfDrop(insertPos, source)) return null;
  return { kind: "reorder", insertPos, baseIndent: null };
}

/**
 * Resolve a drop at `event`'s pointer into a `reorder` / `nest` plus the DOM
 * rect to draw the marker at. ONE interaction for BOTH list kinds — the vertical
 * 3-band model (so every list type behaves identically):
 *
 *  - Top 35% → sibling BEFORE the row, at the row's depth.
 *  - Bottom 35% → sibling AFTER the row's subtree.
 *  - Middle 30% → NEST as the row's child (one level deeper).
 *  - OUTDENT = drop the child onto a SHALLOWER row (an ancestor); its smaller
 *    depth makes the sibling insert land in the shallower list — one gesture to
 *    any depth (a level-4 child to level 1 by dropping it on the top-level row).
 *
 * The bands are measured on the row's OWN text line (its first `<p>`), NOT the
 * full `<li>` rect: a real-nesting `<li>` contains its subtree, so the `<li>`
 * rect spans the children and would put the middle (nest) band over them, where
 * `closest('li')` returns a child and nest became unreachable. For flat
 * checklists the `<li>` rect IS the row (sub-items are siblings, not children),
 * so the band surface coincides with the `<li>` rect there.
 *
 * The only difference between the two kinds is how a sibling drop sets depth:
 * flat checklists RE-`indent` the group rows to the target's `indent`
 * (`rebuildChecklistGroup`); real-nesting types let the insert list set the
 * depth (`realNestingDropTarget` resolves the position at the target depth, no
 * re-indent). Nest: checklists re-`indent` to `target.indent + 1`; real-nesting
 * moves the grabbed item into the target's child list (or creates one).
 *
 * GEOMETRY: the row's rect is read from the DOM (`event.target`'s closest
 * `<li>`), NOT `view.coordsAtPos` — `coordsAtPos` at a node boundary is
 * unreliable for TipTap Vue node views (wrong wrapper / throws), which was the
 * on-device flakiness root cause. The PM position is derived from the SAME row
 * via `posAtCoords` at its content-box top-left (lands in the row's own first
 * paragraph), so rect + position always describe one row. A `coordsAtPos`
 * fallback is kept only for the rare no-`<li>` case (list padding).
 *
 * Confined to the SAME top-level list tree. Returns `null` for cross-tree
 * targets, drops onto the dragged group itself (or its descendants), and no-op
 * self-drops.
 */
export function computeDropTarget(
  view: EditorView,
  event: DragEvent,
  source: DragGroup
): DropResolution | null {
  const doc = view.state.doc;

  // Resolve the target row <li> straight from the DOM (reliable) and derive the
  // PM position from that same row so rect + position agree (see JSDoc). Cache the
  // rect: `dragover` fires rapidly and the marker below re-reads it.
  const rowEl = (event.target as Element | null)?.closest?.("li") ?? null;
  let rowRect: DOMRect | null = null;
  let pos: number;
  let topY: number;
  let bottomY: number;
  let haveRect = false;
  if (rowEl) {
    rowRect = rowEl.getBoundingClientRect();
    const inside = view.posAtCoords({ left: rowRect.left + 4, top: rowRect.top + 4 });
    if (!inside) return null;
    pos = inside.pos;
    topY = rowRect.top;
    bottomY = rowRect.bottom;
    haveRect = true;
  } else {
    const c = view.posAtCoords({ left: event.clientX, top: event.clientY });
    if (!c) return null;
    pos = c.pos;
    topY = bottomY = event.clientY;
  }

  const $pos = doc.resolve(pos);
  const item = findParentNodeClosestToPos($pos, (n) =>
    LIST_ITEM_TYPES.has(n.type.name)
  );
  const list = findParentNodeClosestToPos($pos, (n) =>
    LIST_NODE_TYPES.has(n.type.name)
  );
  if (!list) return null;
  // Confine to the SAME top-level list tree. Comparing the shared outermost
  // list (not the immediate list instance) is what allows a nested item to be
  // dragged to its parent's level — those are different list instances but one
  // tree. Different trees ⇒ unrelated lists ⇒ reject.
  if (topLevelListPos(doc, list.pos) !== topLevelListPos(doc, source.listPos)) {
    return null;
  }

  const { from, to } = source;

  if (item) {
    const itemPos = item.pos;
    const itemNode = item.node;
    const itemEnd = itemPos + itemNode.nodeSize;
    // Don't drop onto an item inside the dragged group (cycle / no-op). This
    // also covers a target that is a descendant of the grabbed item.
    if (itemPos >= from && itemPos < to) return null;

    // No DOM row under the pointer (rare — list padding): fall back to
    // `coordsAtPos` for the rect. The common path above already has the rect.
    if (!haveRect) {
      try {
        topY = view.coordsAtPos(itemPos, 1).top;
        bottomY = view.coordsAtPos(itemEnd, -1).bottom;
      } catch {
        return null;
      }
    }
    const h = bottomY - topY;
    const y = event.clientY;
    const before = y < topY + h * 0.5;

    // Flat checklists: vertical 3-band (the proven model — unchanged).
    if (CHECKLIST_ITEM_TYPES.has(itemNode.type.name)) {
      const itemIndent = Number(itemNode.attrs.indent ?? 0);
      const isAncestor = itemPos < from && itemEnd > to;
      if (!isAncestor && y >= topY + h * 0.35 && y <= topY + h * 0.65) {
        return {
          target: { kind: "nest", targetPos: itemPos, before },
          markerRect: rowRect,
          markerBefore: before
        };
      }
      const insertPos = before
        ? itemPos
        : endOfChecklistSubtree(doc, itemPos, itemIndent);
      if (isReorderSelfDrop(insertPos, source)) return null;
      return {
        target: { kind: "reorder", insertPos, baseIndent: itemIndent },
        markerRect: null,
        markerBefore: before
      };
    }

    // Real-nesting (`listItem` / `outlineListItem`) — VERTICAL 3-band model,
    // the SAME interaction as the flat checklists (Aufgabenliste) above, so every
    // list type behaves identically. The earlier horizontal-X "drag left to
    // outdent" geometry is gone: its valid X band for a same-depth sibling
    // reorder was too narrow (ancestor <li> left-edges close together → silent
    // no-ops, the on-device "can't move a child" flakiness). Now the row under
    // the pointer has three vertical bands measured on the row's OWN text line
    // (its first <p> — NOT the full <li> rect: a real-nesting <li> contains its
    // subtree, so the <li> rect spans the children and would put the nest band
    // over them, where `closest('li')` returns a child and nest became
    // unreachable):
    //   top 35%    → sibling BEFORE the row (at the row's depth)
    //   bottom 35% → sibling AFTER the row's subtree
    //   middle 30% → NEST as the row's child (one level deeper)
    // OUTDENT = drop the child onto a shallower row (an ancestor): its `rowDepth`
    // is smaller, so the sibling insert lands in the shallower list — one gesture
    // to any depth, exactly like the Aufgabenliste. `realNestingDropTarget` does
    // the pure math; markers use DOM rects (reliable), not `coordsAtPos`
    // (unreliable at node boundaries for Vue node views).
    if (!rowEl) {
      // No DOM row (rare — list padding): safe same-level sibling reorder.
      const insertPos = before ? itemPos : itemEnd;
      if (isReorderSelfDrop(insertPos, source)) return null;
      return {
        target: { kind: "reorder", insertPos, baseIndent: null },
        markerRect: null,
        markerBefore: before
      };
    }
    const chain = itemAncestorChain(doc, itemPos);
    const rowDepth = chain.length - 1;
    // The row's own text line (first <p>) — the band surface. Falls back to the
    // <li> rect only when there's no <p> (shouldn't happen: `paragraph block*`).
    const lineEl = rowEl.querySelector("p");
    const lineRect = lineEl
      ? lineEl.getBoundingClientRect()
      : rowRect!; // rowRect is non-null here (rowEl was guarded above)
    const lineTop = lineRect.top;
    const lineH = lineRect.height;
    const lineBefore = y < lineTop + lineH * 0.5;
    const isAncestor = itemPos < from && itemEnd > to;
    // Middle band = nest (one level deeper). Skip when the row is an ancestor of
    // the dragged group — nesting onto your own subtree is a no-op/cycle; that
    // move is reached via the sibling band instead (outdent onto the ancestor).
    if (!isAncestor && y >= lineTop + lineH * 0.35 && y <= lineTop + lineH * 0.65) {
      const target = realNestingDropTarget(doc, itemPos, rowDepth + 1, lineBefore, source);
      if (!target) return null;
      // Nest marker = the row's text line (highlights just this row, not its
      // subtree — clearer than the full <li> rect which would span the children).
      return { target, markerRect: lineRect, markerBefore: lineBefore };
    }
    const target = realNestingDropTarget(doc, itemPos, rowDepth, lineBefore, source);
    if (!target) return null;
    // Sibling marker = the row <li> rect: its top = before the row, its bottom =
    // after the row's whole subtree (the nested list is a DOM child of the <li>,
    // so the <li> rect encompasses the subtree). A reliable DOM-rect line.
    return { target, markerRect: rowRect!, markerBefore: lineBefore };
  }

  // No item under the pointer (over the list's own padding / below last item):
  // append at the end of the list under the pointer, at that list's level. For a
  // flat checklist, level = the list's first-child indent (its root indent — 0 for
  // a normal list, but a legacy really-nested checklist may start higher); for a
  // real-nesting list, `null` (the insert list sets the depth).
  const insertPos = list.pos + list.node.nodeSize - 1;
  if (isReorderSelfDrop(insertPos, source)) return null;
  const firstChild = list.node.firstChild;
  const baseIndent =
    firstChild && CHECKLIST_ITEM_TYPES.has(firstChild.type.name)
      ? Number(firstChild.attrs.indent ?? 0)
      : null;
  return {
    target: { kind: "reorder", insertPos, baseIndent },
    markerRect: null,
    markerBefore: false
  };
}

/** A reorder self-drop: inside the group, or exactly at either boundary (no-op). */
function isReorderSelfDrop(insertPos: number, source: DragGroup): boolean {
  if (insertPos > source.from && insertPos < source.to) return true;
  if (insertPos === source.from || insertPos === source.to) return true;
  return false;
}

/** Position right after the last descendant of the checklist item at `tPos`
 *  (its following higher-`indent` siblings) — where a nested group is appended. */
function endOfChecklistSubtree(doc: ProsemirrorNode, tPos: number, tIndent: number): number {
  const tNode = doc.nodeAt(tPos);
  if (!tNode) return tPos;
  let end = tPos + tNode.nodeSize;
  const $t = doc.resolve(tPos);
  const list = findParentNodeClosestToPos($t, (n) => LIST_NODE_TYPES.has(n.type.name));
  if (!list) return end;
  const idx = indexOfListItem(list, tPos);
  if (idx === -1) return end;
  for (let i = idx + 1; i < list.node.childCount; i += 1) {
    const sib = list.node.child(i);
    if (Number(sib.attrs.indent ?? 0) <= tIndent) break;
    end += sib.nodeSize;
  }
  return end;
}

/** Rebuild the checklist group `[from, to)` with indents shifted so its first
 *  row sits at `baseIndent` (relative structure preserved, clamped to
 *  `[0, MAX_LIST_INDENT]`). `baseIndent` = target's indent for a sibling drop,
 *  target's indent + 1 for a nest. */
function rebuildChecklistGroup(
  doc: ProsemirrorNode,
  from: number,
  to: number,
  baseIndent: number
): Fragment {
  const slice = doc.slice(from, to);
  const first = slice.content.firstChild;
  const firstIndent = Number(first?.attrs.indent ?? 0);
  const nodes: ProsemirrorNode[] = [];
  slice.content.forEach((child) => {
    const orig = Number(child.attrs.indent ?? 0);
    const ni = Math.max(0, Math.min(MAX_LIST_INDENT, baseIndent + (orig - firstIndent)));
    nodes.push(child.type.create({ ...child.attrs, indent: ni }, child.content, child.marks));
  });
  return Fragment.from(nodes);
}

/** Build the fragment to insert for a REORDER drop. `baseIndent === null` means
 *  a real-nesting list: insert the source item node verbatim — its depth is set
 *  by whichever list it's inserted into, so no re-indent. A number means a flat
 *  checklist: re-`indent` the group rows to `baseIndent` (preserving relative
 *  structure). `doc` is the PRE-deletion document. */
export function reorderFragment(
  doc: ProsemirrorNode,
  source: DragGroup,
  baseIndent: number | null
): Fragment {
  if (baseIndent == null) return doc.slice(source.from, source.to).content;
  return rebuildChecklistGroup(doc, source.from, source.to, baseIndent);
}

/** Find a child list of `tNode` whose type matches `listTypeName`. Returns its
 *  doc pos + node, or null. */
function childListOf(tNode: ProsemirrorNode, listTypeName: string, tPos: number): { pos: number; node: ProsemirrorNode } | null {
  let found: { pos: number; node: ProsemirrorNode } | null = null;
  tNode.forEach((child, offset) => {
    if (!found && child.type.name === listTypeName) {
      found = { pos: tPos + 1 + offset, node: child };
    }
  });
  return found;
}

/**
 * Compute the insert position + fragment for a NEST drop (making the source group
 * a sub-item of the item at `targetPos`). `before` inserts it as the FIRST child
 * of the target, else the LAST. Returns `{ insertPos, fragment, selOffset }`
 * where `selOffset` is how far past `insertPos` the first moved item lands (1
 * when a new child list had to be created around it, else 0) — the caller maps
 * `insertPos` through its deletion and adds `selOffset` to place the
 * `NodeSelection`. `doc` is the PRE-deletion document.
 */
export function nestInsert(
  doc: ProsemirrorNode,
  source: DragGroup,
  targetPos: number,
  before: boolean
): { insertPos: number; fragment: Fragment; selOffset: number } | null {
  const tNode = doc.nodeAt(targetPos);
  if (!tNode) return null;

  // Checklists (flat `data-indent`): shift the group's indents to target+1.
  // `before` = right after the target's own row (its first child slot); else
  // the end of the target's visual subtree (after existing children).
  if (CHECKLIST_ITEM_TYPES.has(tNode.type.name)) {
    const tIndent = Number(tNode.attrs.indent ?? 0);
    const insertPos = before
      ? targetPos + tNode.nodeSize
      : endOfChecklistSubtree(doc, targetPos, tIndent);
    const fragment = rebuildChecklistGroup(doc, source.from, source.to, tIndent + 1);
    return { insertPos, fragment, selOffset: 0 };
  }

  // Real-nesting (`listItem` / `outlineListItem`): move the single grabbed item
  // into the target's existing child list of the same type, or create one.
  const item = doc.slice(source.from, source.to).content.firstChild;
  if (!item) return null;
  const existing = childListOf(tNode, source.listType, targetPos);
  if (existing) {
    // The target's child list IS the source's own list ⇒ the grabbed item is
    // already a direct child of the target. Nesting would be a no-op, and worse,
    // if the grabbed item was the only child, `deleteSourceGroup` would delete
    // that list right after we picked it, then the bare item would be inserted
    // straight into the target (listItem can't nest in a listItem). Reject so
    // the drop is a clean no-op.
    if (existing.pos === source.listPos) return null;
    const insertPos = before
      ? existing.pos + 1 // before the first existing child
      : existing.pos + existing.node.nodeSize - 1; // after the last child
    return { insertPos, fragment: Fragment.from(item), selOffset: 0 };
  }
  // No matching child list — create one as the target's last block child.
  const listType = tNode.type.schema.nodes[source.listType];
  if (!listType) return null;
  const insertPos = targetPos + tNode.nodeSize - 1;
  const fragment = Fragment.from(listType.create(null, Fragment.from(item)));
  return { insertPos, fragment, selOffset: 1 };
}

/**
 * Delete the dragged group from `doc` via `tr`. When the group IS the entire
 * content of its source list (a real-nesting cross-level move taking the only
 * item — or any move emptying the list), delete the whole list node instead of
 * `[from, to)`: ProseMirror's `tr.delete(from, to)` won't remove an only child
 * cleanly — it leaves an empty item shell, because removing the child would
 * empty the list (`listItem+`) and PM's slice-fitting keeps a minimal valid
 * node. Deleting the whole list is clean: its parent `listItem` just keeps its
 * required paragraph. When the group is a proper subset (siblings remain) the
 * plain `tr.delete(from, to)` removes the nodes cleanly. `doc` is the
 * PRE-deletion document; call before mapping the insert position.
 */
export function deleteSourceGroup(
  tr: { delete: (a: number, b: number) => void },
  doc: ProsemirrorNode,
  source: DragGroup
): void {
  const list = doc.nodeAt(source.listPos);
  if (!list) {
    tr.delete(source.from, source.to);
    return;
  }
  const contentStart = source.listPos + 1;
  const contentEnd = source.listPos + list.nodeSize - 1;
  if (source.from === contentStart && source.to === contentEnd) {
    tr.delete(source.listPos, source.listPos + list.nodeSize);
  } else {
    tr.delete(source.from, source.to);
  }
}