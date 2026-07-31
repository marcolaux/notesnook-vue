/*
ListDragReorder — drag-to-reorder list items, moving an indented parent AND its
sub-items as a group, with a visible drop marker. Works across ALL list types:
rich `taskList`, simple `checkList`, collapsible `bulletList`/`orderedList`, and
`outlineList`. Each item has three vertical drop zones: top band = drop as a
sibling BEFORE the item, bottom band = sibling AFTER the item's subtree, middle
band = NEST as a sub-item of that item (outliner-style). Sibling drops RE-LEVEL
the group to the target item's depth, so dragging a child onto a shallower item
outdents it (level 2 → 1) and onto a deeper one indents it — any item can be
moved to any depth in the list tree, children following along.

Why the marker is a DOM overlay, NOT a ProseMirror decoration: a decoration is
updated by dispatching a transaction on `dragover`. A widget decoration adds 2px
of layout, which shifts `posAtCoords`, which flips the resolved target, which
moves the widget — a feedback loop that makes the indicator flicker/shake.
Instead the marker is a `position: fixed` element appended to `document.body`
and positioned from `view.coordsAtPos` / the target item's rect. No transactions
are dispatched during the drag (only on drop), so the editor DOM never re-renders
mid-drag and the indicator is rock-stable. The overlay is removed before the drop
transaction is dispatched.

How it intercepts (this ProseMirror version has no `handleDragStart` prop):
  - `handleDOMEvents.dragstart`: by the time it runs, TipTap's NodeView
    `onDragStart` (bound on the `[data-drag-handle]` wrapper) has already
    dispatched a `NodeSelection` at the grabbed item. We read that selection,
    compute the group, stash it on a per-view `WeakMap`, and create the overlay
    elements. We return `false` so PM's built-in `handlers.dragstart` still sets
    `view.dragging` + the drag image (overridden for multi-row groups).
  - `handleDOMEvents.dragover`: compute the drop target and position/show the
    overlay (line for reorder, rectangle for nest). No dispatch. Return `false`
    so PM's built-in `dragover` still `preventDefault()`s (allowing the drop).
  - `handleDrop`: read the stashed group, recompute the target from the drop
    coords, remove the overlay, then a single `delete` + `insert` transaction
    moves the group; `NodeSelection` on the first moved item. Return `true` to
    suppress PM's single-node default. When the drag isn't ours (no stashed
    group), return `false` so other handlers (attachments-bridge, etc.) run.
  - `handleDOMEvents.dragend`: safety cleanup of the overlay + stashed group
    (e.g. cancelled drags with no drop).
*/
import { Extension } from "@tiptap/vue-3";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import type { Fragment } from "@tiptap/pm/model";
import {
  computeDragGroup,
  computeDropTarget,
  deleteSourceGroup,
  LIST_ITEM_TYPES,
  nestInsert,
  reorderFragment,
  type DragGroup
} from "./drag-group";

const listDragKey = new PluginKey("listDragReorder");

/** Per-view drag session: the stashed source + the overlay marker elements. */
interface DragSession {
  source: DragGroup;
  line: HTMLElement;
  nest: HTMLElement;
  /** The currently-shown target kind, to skip redundant DOM writes. */
  current: string;
}
const sessions = new WeakMap<EditorView, DragSession | null>();

/** Build the reorder indicator: a thin accent line (fixed, body-level). */
function createLineMarker(): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("contenteditable", "false");
  Object.assign(el.style, {
    position: "fixed",
    left: "0",
    top: "0",
    height: "2px",
    background: "var(--accent, currentColor)",
    borderRadius: "1px",
    pointerEvents: "none",
    opacity: "0",
    zIndex: "50",
    transition: "opacity 70ms linear"
  } as Partial<CSSStyleDeclaration>);
  return el;
}

/** Build the nest indicator: a highlighted rectangle over the target item. */
function createNestMarker(): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("contenteditable", "false");
  Object.assign(el.style, {
    position: "fixed",
    left: "0",
    top: "0",
    border: "2px solid var(--accent, currentColor)",
    borderRadius: "4px",
    background: "color-mix(in oklab, var(--accent, currentColor) 14%, transparent)",
    pointerEvents: "none",
    opacity: "0",
    zIndex: "50",
    transition: "opacity 70ms linear"
  } as Partial<CSSStyleDeclaration>);
  return el;
}

/** Position the line marker at the reorder insert point (viewport coords). */
function showLine(view: EditorView, s: DragSession, insertPos: number): void {
  const coords = view.coordsAtPos(insertPos);
  const line = s.line;
  line.style.left = `${coords.left}px`;
  line.style.top = `${coords.top - 1}px`;
  line.style.width = `${Math.max(0, coords.right - coords.left)}px`;
  line.style.opacity = "1";
  s.nest.style.opacity = "0";
}

/** Position the line marker from a DOM rect (the anchor `<li>` at the target
 *  depth): the line sits at the anchor's top (before) or bottom (after its
 *  subtree), spanning the row, at the anchor's left edge = the target indent.
 *  Reliable (DOM rect) — the fallback `showLine` uses `coordsAtPos` at a node
 *  boundary, which is unreliable for TipTap Vue node views. */
function showLineRect(s: DragSession, rect: DOMRect, before: boolean): void {
  const line = s.line;
  line.style.left = `${rect.left}px`;
  line.style.top = `${(before ? rect.top : rect.bottom) - 1}px`;
  line.style.width = `${rect.width}px`;
  line.style.opacity = "1";
  s.nest.style.opacity = "0";
}

/** Position the nest rectangle over a target item's DOM rect. `rect` is the
 *  `<li>` under the pointer (the nest target) — read from the DOM in the dragover
 *  handler, NOT via `view.nodeDOM` (unreliable for TipTap Vue node views). */
function showNestRect(s: DragSession, rect: DOMRect): void {
  const nest = s.nest;
  nest.style.left = `${rect.left}px`;
  nest.style.top = `${rect.top}px`;
  nest.style.width = `${rect.width}px`;
  nest.style.height = `${rect.height}px`;
  nest.style.opacity = "1";
  s.line.style.opacity = "0";
}

function hideMarker(s: DragSession): void {
  s.line.style.opacity = "0";
  s.nest.style.opacity = "0";
}

/** Tear down the overlay elements + per-view session. */
function endSession(view: EditorView): void {
  const s = sessions.get(view);
  if (s) {
    s.line.remove();
    s.nest.remove();
  }
  sessions.delete(view);
}

/** Override the drag image with a small "N items" pill when a group > 1 row is
 *  being dragged, so the drag preview reflects the group, not a single row. */
function setGroupDragImage(event: DragEvent, doc: EditorView["state"]["doc"], group: DragGroup): void {
  const dt = event.dataTransfer;
  if (!dt) return;
  const count = doc.slice(group.from, group.to).content.childCount;
  if (count <= 1) return;
  const pill = document.createElement("div");
  pill.textContent = `${count} items`;
  Object.assign(pill.style, {
    position: "fixed",
    top: "-1000px",
    left: "-1000px",
    padding: "2px 8px",
    borderRadius: "6px",
    background: "var(--accent, #333)",
    color: "#fff",
    fontSize: "12px",
    fontFamily: "sans-serif",
    pointerEvents: "none"
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(pill);
  dt.setDragImage(pill, 8, 8);
  // The browser snapshots the drag image synchronously; remove the pill after.
  window.setTimeout(() => pill.remove(), 0);
}

function createListDragReorderPlugin(): Plugin {
  return new Plugin({
    key: listDragKey,
    props: {
      handleDOMEvents: {
        dragstart: (view, event) => {
          // TipTap's NodeView onDragStart has already dispatched a NodeSelection
          // at the grabbed item (the event bubbled from the handle wrapper up to
          // view.dom). Read it to identify the dragged list item.
          const { selection } = view.state;
          if (!(selection instanceof NodeSelection)) return false;
          const node = selection.node;
          if (!node || !LIST_ITEM_TYPES.has(node.type.name)) return false;
          const group = computeDragGroup(view.state.doc, selection.from);
          if (!group) return false;

          const line = createLineMarker();
          const nest = createNestMarker();
          document.body.appendChild(line);
          document.body.appendChild(nest);
          sessions.set(view, { source: group, line, nest, current: "none" });

          setGroupDragImage(event as DragEvent, view.state.doc, group);
          return false; // let PM set view.dragging + default image
        },

        dragover: (view, event) => {
          const s = sessions.get(view);
          if (!s) return false;
          const res = computeDropTarget(view, event as DragEvent, s.source);
          const t = res?.target;
          const key = !t
            ? "none"
            : t.kind === "reorder"
              ? `r:${t.insertPos}`
              : `n:${t.targetPos}:${t.before ? 1 : 0}`;
          if (s.current === key) return false; // skip redundant DOM writes
          s.current = key;
          if (!t) {
            hideMarker(s);
          } else if (t.kind === "reorder") {
            if (res?.markerRect) showLineRect(s, res.markerRect, res.markerBefore);
            else showLine(view, s, t.insertPos); // fallback (no DOM row)
          } else {
            // Nest: the marker rect is the row <li> under the pointer (resolved
            // in computeDropTarget) — reliable, unlike view.nodeDOM.
            if (res?.markerRect) showNestRect(s, res.markerRect);
            else hideMarker(s);
          }
          return false; // let PM's built-in dragover preventDefault (allow drop)
        },

        dragend: (view) => {
          endSession(view);
          return false;
        }
      },

      handleDrop: (view, event) => {
        const s = sessions.get(view);
        if (!s) return false; // not a list-item drag — let other handlers run
        const source = s.source;

        const res = computeDropTarget(view, event as DragEvent, source);
        // Remove the overlay BEFORE dispatching so PM's re-render doesn't see it.
        endSession(view);
        if (!res) {
          // Invalid target (outside the source tree / over a non-list area):
          // swallow to avoid PM's default moving only the single grabbed row and
          // splitting the group.
          return true;
        }
        const target = res.target;

        const doc = view.state.doc;

        // `insertPosPre` / `selOffset` are in the PRE-deletion doc. We delete the
        // source group first (deleting the whole source list when the group is
        // its entire content, so no empty list / empty-item shell is left),
        // THEN map the insert position through that deletion and insert.
        let insertPosPre: number;
        let fragment: Fragment | null;
        let selOffset: number;
        if (target.kind === "reorder") {
          insertPosPre = target.insertPos;
          fragment = reorderFragment(
            doc,
            source,
            target.baseIndent,
            target.targetItemType,
            target.targetListType
          );
          selOffset = 0;
        } else {
          const nested = nestInsert(
            doc,
            source,
            target.targetPos,
            target.before,
            target.targetItemType,
            target.targetListType
          );
          if (!nested) return true;
          insertPosPre = nested.insertPos;
          fragment = nested.fragment;
          selOffset = nested.selOffset;
        }

        const tr = view.state.tr;
        deleteSourceGroup(tr, doc, source);
        const at = tr.mapping.map(insertPosPre);
        // `fragment` is `Fragment | null` (conversion can bail when the schema
        // can't fit the converted content). A null fragment means a cross-type
        // drop that can't be represented in the target list — clean no-op.
        if (!fragment) return true;
        tr.insert(at, fragment);
        tr.setSelection(NodeSelection.create(tr.doc, at + selOffset));
        view.dispatch(tr);
        return true;
      }
    }
  });
}

export const ListDragReorder = Extension.create({
  name: "listDragReorder",
  addProseMirrorPlugins() {
    return [createListDragReorderPlugin()];
  }
});