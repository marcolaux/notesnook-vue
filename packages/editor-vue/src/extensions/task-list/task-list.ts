/*
Ported from @notesnook/editor (GPL-3.0), extensions/task-list/task-list.ts.

Schema (addAttributes/parseHTML/renderHTML) is copied verbatim — stored notes
use `<ul class="checklist">` with `data-title`/`data-readonly` and a class-based
checked state on the task items. Only `addNodeView` changes (React
`createNodeView` → `VueNodeViewRenderer`).

Differences from upstream (scoped to this 2.4a increment):
  - The drop-override plugin is dropped (UX nicety for drag-to-end; needs
    `findChildrenByType` non-descending which TipTap core lacks). Deferred.
  - The `[]`/`[x]` input rule is dropped (fiddly `oldHandler` mutation; the
    stock TaskList has no input rule either). Typing shortcut deferred.
  - `hasPermission` guards dropped (no toolbar permission system yet).
  - `addNodeView` omits the `shouldUpdate` optimisation — TipTap Vue updates
    props reactively on every node change (correct, slightly less optimal).
*/
import { mergeAttributes, VueNodeViewRenderer } from "@tiptap/vue-3";
import { TaskList } from "@tiptap/extension-task-list";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { type Node as ProsemirrorNode, type NodeType } from "@tiptap/pm/model";
import TaskListComponent from "./TaskListComponent.vue";
import { countCheckedItems, findRootTaskList, toggleChildren } from "./utils";
import {
  findParentNodeClosestToPos,
  getDeletedNodes,
  getExactChangedNodes,
  getParentAttributes,
  hasSameAttributes
} from "../../utils/prosemirror";
import { TaskItemNode } from "../task-item/task-item";

export type { TaskListAttributes } from "./types";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    // Declared under a fresh namespace key (not the base `taskList`) — TS won't
    // let a second `taskList` property add a method (TS2717), and `SingleCommands`
    // flattens every namespace's methods together, so `editor.commands
    // .toggleChecklistItem` resolves regardless of the key.
    checklistItem: {
      /** Toggle the current block into a checklist item, or — when the cursor
       *  is already inside a `taskItem` (rich) or `checkListItem` (simple) —
       *  flip that item's `checked` state. Bound to `Mod-l` (see
       *  `addKeyboardShortcuts`); also exposed in the command palette via the
       *  `toggleChecklistItem` editor action in `tool-definitions.ts`. */
      toggleChecklistItem: () => ReturnType;
    };
  }
}

export const TaskListNode = TaskList.extend({
  addAttributes() {
    return {
      stats: {
        default: { checked: 0, total: 0 },
        rendered: false,
        parseHTML: (element: HTMLElement) => {
          // do not update stats for nested task lists
          if (element.parentElement?.closest("ul")) return { checked: 0, total: 0 };
          const total = element.querySelectorAll("li.checklist--item").length;
          const checked = element.querySelectorAll("li.checklist--item.checked").length;
          return { checked, total };
        }
      },
      title: {
        default: null,
        keepOnSplit: false,
        parseHTML: (element) => element.dataset.title,
        renderHTML: (attributes) => {
          if (!attributes.title || attributes.nested) return {};
          return { "data-title": attributes.title };
        }
      },
      readonly: {
        default: false,
        keepOnSplit: false,
        parseHTML: (element) => element.dataset.readonly,
        renderHTML: (attributes) => {
          if (!attributes.readonly) return {};
          return { "data-readonly": attributes.readonly };
        }
      }
    };
  },

  parseHTML() {
    return [{ tag: "ul.checklist", priority: 51 }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "ul",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { class: "checklist" }),
      0
    ];
  },

  addCommands() {
    return {
      toggleTaskList:
        () =>
        ({ editor, chain, state, tr }) => {
          const { $from, $to } = state.selection;
          chain()
            .toggleList(this.name, this.options.itemTypeName, true, getParentAttributes(this.editor, true, true))
            .run();
          const position = { from: tr.mapping.map($from.pos), to: tr.mapping.map($to.pos) };
          // Workaround a PM/TipTap selection glitch when creating nested node
          // views — force the editor back to the correct position.
          setTimeout(() => editor.commands.setTextSelection(position), 0);
          return true;
        },
      toggleChecklistItem:
        () =>
        ({ state, chain }) => {
          // Walk up from the cursor to find the nearest checklist item node
          // (rich `taskItem` or simple `checkListItem`). If found, flip its
          // `checked` attribute via a raw `tr.setNodeMarkup` (there is no chain
          // command for it) — the task-list-state-management plugin then
          // propagates to children/parents + syncs `stats` (rich), and the
          // checkListItem node-view `update` syncs its `.checked` CSS class
          // (simple). If NOT inside a checklist item, convert the current line
          // into a simple (bare-checkbox) checklist item — in place when the
          // cursor is inside another list type (see below).
          const { $from } = state.selection;
          const taskItem = state.schema.nodes.taskItem;
          const checkListItem = state.schema.nodes.checkListItem;
          let itemNode: ProsemirrorNode | null = null;
          let itemPos = -1;
          for (let depth = $from.depth; depth > 0; depth--) {
            const node = $from.node(depth);
            if (
              (taskItem && node.type === taskItem) ||
              (checkListItem && node.type === checkListItem)
            ) {
              itemNode = node;
              itemPos = $from.before(depth);
              break;
            }
          }
          if (itemNode && itemPos >= 0) {
            const checked = Boolean(itemNode.attrs.checked);
            return chain()
              .command(({ tr }) => {
                tr.setNodeMarkup(itemPos, undefined, {
                  ...itemNode.attrs,
                  checked: !checked
                });
                return true;
              })
              .run();
          }
          // Not inside a checklist item. If the cursor is inside a list of
          // another type (bullet / ordered / outline), convert the INNERMOST
          // containing list into a simple checklist IN PLACE — rebuild that
          // one list as `checkList`/`checkListItem` and replace it atomically
          // — so the line becomes a check item WITHOUT being lifted out of
          // its parent. Only the items at the caret's level become check
          // items; any lists NESTED inside them are left at their original
          // type (a `checkListItem` with `nested: true` holds `paragraph
          // block*`, so it can contain a nested bullet/ordered list — the
          // children stay bullets, only the toggled row gains a checkbox).
          // Stock `toggleList` can't do this: it only swaps the list type when
          // the items are already compatible (validContent), and otherwise
          // falls back to `wrapInList`, which lifts the item to the top level
          // (the "moved to the first level" bug). A plain block (no list
          // ancestor) is wrapped in a new simple checklist via
          // `toggleCheckList`.
          const checkListType = state.schema.nodes.checkList;
          const checkListItemType = state.schema.nodes.checkListItem;
          let listNode: ProsemirrorNode | null = null;
          let listDepth = -1;
          for (let depth = $from.depth; depth > 0; depth--) {
            const node = $from.node(depth);
            if (node.type.spec.group?.includes("list")) {
              listNode = node;
              listDepth = depth;
              break;
            }
          }
          const listName = listNode?.type.name;
          if (
            listNode &&
            listDepth > 0 &&
            checkListType &&
            checkListItemType &&
            listName !== "taskList" &&
            listName !== "checkList"
          ) {
            // Convert ONLY the innermost enclosing list: its direct items
            // become `checkListItem`s, and each item's content (including any
            // nested bullet/ordered/outline list) is reused VERBATIM, so
            // nested children keep their original list type instead of being
            // recursively rewritten into check items. We REBUILD the one list
            // as `checkList`/`checkListItem` and `tr.replaceWith` it in ONE
            // step: per-node `setNodeMarkup` can't work, because
            // `setNodeMarkup` validates content on each call, and every
            // intermediate state is invalid (a `bulletList` holding a
            // `checkListItem`, or a `checkList` holding a `listItem`,
            // violates the parent's content rule). The rebuilt subtree has
            // the same shape/size as the original, so it drops into the same
            // range.
            const listPos = $from.before(listDepth);
            const end = listPos + listNode.nodeSize;
            const newNode = toChecklistSubtree(
              listNode,
              checkListType,
              checkListItemType
            );
            return chain()
              .command(({ tr }) => {
                tr.replaceWith(listPos, end, newNode);
                // The rebuilt subtree has the SAME shape/size as the original
                // (only node TYPES change — paragraphs + inline marks are
                // reused), so the caret's absolute position is still valid in
                // the new doc and points into the converted check item's text.
                // Restore it explicitly: `replaceWith` of a closed-node slice
                // otherwise maps interior positions to the END of the inserted
                // range (the next line), jumping the cursor down. Preserve both
                // anchor and head (same positions) so a range selection is kept.
                const { anchor, head } = state.selection;
                tr.setSelection(TextSelection.create(tr.doc, anchor, head));
                return true;
              })
              .run();
          }
          return chain().toggleCheckList().run();
        }
    };
  },

  addKeyboardShortcuts() {
    // Preserve the base `Mod-Shift-9` (toggle task list) from
    // `@tiptap/extension-task-list` while adding `Mod-l` (Cmd/Ctrl+L) for the
    // toggle-checklist-item action.
    return {
      ...this.parent?.(),
      "Mod-l": () => this.editor.commands.toggleChecklistItem()
    };
  },

  addNodeView() {
    return VueNodeViewRenderer(TaskListComponent, {
      // Re-render the header only when attrs (stats/title/readonly) or the set
      // of checked children changes — content keystrokes are handled by the
      // child task-item node views + ProseMirror's contentDOM, so they don't
      // need a header re-render. CRITICAL: a custom `update` MUST call
      // `updateProps()` to push the new node to the Vue component; returning
      // true alone only tells ProseMirror to reuse this node view, leaving the
      // component pinned to the OLD node (so the progress bar + N/M count would
      // never update despite `stats` changing in the doc).
      update: ({ oldNode, newNode, updateProps }) => {
        if (newNode.type !== oldNode.type) return false;
        const needsRender =
          !hasSameAttributes(oldNode.attrs, newNode.attrs) ||
          !hasSameAttributes(
            oldNode.attrs.stats as Record<string, unknown>,
            newNode.attrs.stats as Record<string, unknown>
          ) ||
          oldNode.childCount !== newNode.childCount ||
          countCheckedItems(oldNode).checked !== countCheckedItems(newNode).checked;
        if (needsRender) updateProps();
        return true;
      }
    });
  },

  addProseMirrorPlugins() {
    return [
      // Keeps task-list state reactive: auto-check parents when all children
      // are checked, propagate parent toggles to children, and sync the
      // `stats` attribute (drives the progress bar) on the root task list.
      new Plugin({
        key: new PluginKey("task-list-state-management"),
        appendTransaction(transactions, oldState, newState) {
          const userTr = transactions[0];
          if (!userTr || !userTr.docChanged) return;

          const changedNodes = getExactChangedNodes(
            userTr,
            (node) => node.type.name === TaskItemNode.name
          );
          const deletedNodes = getDeletedNodes(userTr, (node) =>
            node.type.name === TaskList.name
          );
          if (changedNodes.length <= 0 && deletedNodes.length <= 0) return;

          let changeCount = 0;
          const { tr } = newState;
          const roots = new WeakSet<{ node: ProsemirrorNode; pos: number }>();

          for (const edit of [...changedNodes, ...deletedNodes]) {
            // Case 1: a task item with a nested task list was toggled →
            // propagate the new checked state to all its descendants.
            if (
              edit.node.lastChild?.type.name === TaskList.name &&
              !!oldState.doc.nodeAt(edit.pos)?.attrs.checked !==
                !!newState.doc.nodeAt(edit.pos)?.attrs.checked
            ) {
              changeCount += toggleChildren(
                tr,
                edit.node,
                Boolean(edit.node.attrs.checked),
                tr.mapping.map(edit.pos)
              );
            }

            // Case 2: a leaf task item was toggled → walk up and check any
            // parent task item whose children are now all checked (or uncheck).
            let childPos: number | undefined = edit.pos;
            while (childPos !== undefined) {
              const resolvedPos = tr.doc.resolve(tr.mapping.map(childPos));
              const parentTaskItem = findParentNodeClosestToPos(resolvedPos, (n) =>
                n.type.name === TaskItemNode.name
              );
              if (!parentTaskItem) break;

              const allChecked = areAllChecked(parentTaskItem.node);
              if (allChecked === Boolean(parentTaskItem.node.attrs.checked)) break;

              changeCount++;
              tr.setNodeMarkup(tr.mapping.map(parentTaskItem.pos), undefined, {
                ...parentTaskItem.node.attrs,
                checked: allChecked
              });
              childPos = parentTaskItem.pos;
            }

            // Sync stats on the root task list (deduped per root).
            const root = findRootTaskList(tr.doc, edit.pos) || edit;
            if (root && !roots.has(root)) {
              roots.add(root);
              const stats = countCheckedItems(root.node);
              tr.setNodeMarkup(root.pos, undefined, { ...root.node.attrs, stats });
              changeCount++;
            }
          }
          return changeCount > 0 ? tr : null;
        }
      })
    ];
  }
});

function areAllChecked(node: ProsemirrorNode): boolean {
  const taskList = node.lastChild;
  if (!taskList || taskList.type.name !== TaskList.name) return Boolean(node.attrs.checked);
  let allChecked = true;
  for (let i = 0; i < taskList.childCount; ++i) {
    const child = taskList.child(i);
    if (!child.attrs.checked) {
      allChecked = false;
      break;
    }
  }
  return allChecked;
}

/**
 * A list *container* that {@link toChecklistSubtree} should rewrite to a
 * `checkList`: bullet / ordered / outline (group "block list"), but NOT
 * `taskList` / `checkList` (the conversion only targets non-check lists).
 */
function isConvertibleList(node: ProsemirrorNode): boolean {
  return (
    Boolean(node.type.spec.group?.includes("list")) &&
    node.type.name !== "taskList" &&
    node.type.name !== "checkList"
  );
}

/**
 * Rebuild `list` (a bullet / ordered / outline list) as a single-level
 * `checkList`, for {@link toggleChecklistItem}'s in-place conversion.
 *
 * Every DIRECT item of `list` becomes a `checkListItem` — preserving a
 * converted task item's existing `checked` state (plain list / outline
 * items start unchecked), with `indent` left at its default (0). Each
 * item's content (paragraph + any nested bullet/ordered/outline list) is
 * reused VERBATIM, so nested children keep their original list type — only
 * the rows at the caret's level gain a checkbox. Reused paragraphs /
 * blocks keep their inline marks (the node objects are reused as-is; only
 * the one list container and its direct items are re-typed).
 *
 * The rebuilt subtree has the SAME shape and size as the original, so it
 * can replace the original range in one atomic `tr.replaceWith` — which
 * matters because per-node `setNodeMarkup` cannot do this conversion:
 * `setNodeMarkup` validates content on each call, and every intermediate
 * state is invalid (a `bulletList` holding a `checkListItem` — or a
 * `checkList` holding a `listItem` — breaks the parent's content rule).
 */
function toChecklistSubtree(
  list: ProsemirrorNode,
  checkListType: NodeType,
  checkListItemType: NodeType
): ProsemirrorNode {
  const children: ProsemirrorNode[] = [];
  list.forEach((child) => {
    if (isConvertibleList(child)) {
      // A list nested directly inside another list (defensive — normally
      // lists nest inside list items, not directly). Leave it at its
      // original type: only the caret's level converts.
      children.push(child);
    } else {
      // A list item → checkListItem, reusing its content verbatim — any
      // nested list inside the item stays its original type.
      children.push(
        checkListItemType.create(
          { checked: Boolean(child.attrs.checked) },
          child.content
        )
      );
    }
  });
  return checkListType.create({}, children);
}