/*
Ported from @notesnook/editor (GPL-3.0), extensions/task-list/utils.ts.
`sortList` is deferred (sort button not in 2.4a). The rest is verbatim — these
helpers drive the task-list stats / parent-child auto-check behaviour.
*/
import type { Transaction } from "@tiptap/pm/state";
import { Fragment, Node as ProsemirrorNode } from "@tiptap/pm/model";
import type { NodeWithPos } from "@tiptap/vue-3";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { findParentNodeClosestToPos } from "../../utils/prosemirror";
import { TaskItemNode } from "../task-item/task-item";

export function countCheckedItems(node: ProsemirrorNode): { checked: number; total: number } {
  let checked = 0;
  let total = 0;
  node.descendants((child) => {
    if (child.type.name === TaskItem.name) {
      if (child.attrs.checked) checked++;
      total++;
    }
  });
  return { checked, total };
}

export function deleteCheckedItems(tr: Transaction, pos: number): Transaction | null {
  const node = tr.doc.nodeAt(pos);
  const parent = node ? { node, pos } : null;
  if (!parent || parent.node.type.name !== TaskList.name) return null;

  const sublists: NodeWithPos[] = [];
  parent.node.descendants((child, nodePos) => {
    if (child.type.name === TaskList.name) sublists.push({ node: child, pos: pos + nodePos + 1 });
  });
  if (sublists.length > 1) sublists.reverse();
  sublists.push(parent);

  for (const list of sublists) {
    const listNode = tr.doc.nodeAt(tr.mapping.map(list.pos));
    if (!listNode) continue;

    const children: ProsemirrorNode[] = [];
    listNode.forEach((child, _offset, index) => {
      if (!child.attrs.checked) children.push(listNode.child(index));
    });
    // if all items are unchecked, skip
    if (children.length === listNode.childCount) continue;

    tr.replaceWith(
      tr.mapping.map(list.pos + 1),
      tr.mapping.map(list.pos + list.node.nodeSize - 1),
      Fragment.from(children)
    );
  }

  if (!tr.steps.length) return null;
  return tr;
}

const invalidTaskListParents = [TaskList.name, TaskItem.name];
export function findRootTaskList(
  doc: ProsemirrorNode,
  pos?: number
): { pos: number; start: number; depth: number; node: ProsemirrorNode } | undefined {
  if (!pos) return undefined;
  return findParentNodeClosestToPos(
    doc.resolve(pos),
    (node, parent) =>
      node.type.name === TaskList.name &&
      (!parent || !invalidTaskListParents.includes(parent.type.name))
  );
}

export function toggleChildren(
  tr: Transaction,
  node: ProsemirrorNode,
  toggleState: boolean,
  parentPos: number
): number {
  let changes = 0;
  node.descendants((child, pos) => {
    if (child.type.name === TaskItemNode.name && toggleState !== child.attrs.checked) {
      const actualPos = pos + parentPos + 1;
      tr.setNodeMarkup(tr.mapping.map(actualPos), undefined, {
        ...child.attrs,
        checked: toggleState
      });
      changes++;
    }
  });
  return changes;
}