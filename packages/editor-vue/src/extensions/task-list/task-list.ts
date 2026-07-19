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
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Node as ProsemirrorNode } from "@tiptap/pm/model";
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
        }
    };
  },

  addNodeView() {
    return VueNodeViewRenderer(TaskListComponent, {
      // Re-render the header when attrs (stats/title/readonly) or the set of
      // checked children changes.
      update: ({ oldNode, newNode }) =>
        !hasSameAttributes(oldNode.attrs, newNode.attrs) ||
        !hasSameAttributes(
          oldNode.attrs.stats as Record<string, unknown>,
          newNode.attrs.stats as Record<string, unknown>
        ) ||
        oldNode.childCount !== newNode.childCount ||
        countCheckedItems(oldNode).checked !== countCheckedItems(newNode).checked
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