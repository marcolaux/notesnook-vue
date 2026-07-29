/*
Shared visual-indent helper for checklist item nodes (`taskItem` rich
task-list + `checkListItem` simple checklist). Both indent VISUALLY via a
`data-indent` attribute adjusted by Tab/Shift-Tab, instead of sinking/lifting
into real nested `<ul>` containers (see `task-item.ts` and
`check-list-item.ts`). Kept here so both extensions share one implementation.
*/
import type { Editor } from "@tiptap/core";
import { findParentNodeClosestToPos } from "./prosemirror";

/**
 * Furthest a checklist item can be visually indented via Tab. Caps runaway
 * nesting of the left padding and keeps the rendered HTML tidy. Shared by
 * `taskItem` and `checkListItem`.
 */
export const MAX_LIST_INDENT = 8;

/** Back-compat alias for callers that imported the task-list-specific name. */
export const MAX_TASK_INDENT = MAX_LIST_INDENT;

/**
 * Adjust the `indent` attribute of the checklist item wrapping the selection by
 * `delta` (Tab = +1, Shift-Tab = -1), clamped to `[0, {@link MAX_LIST_INDENT}]`.
 *
 * Returns `true` (key handled) whenever the caret sits in an item of `typeName`
 * — even when already at the floor/ceiling, so the browser's default Tab
 * focus-move (and the stock `liftListItem`/`sinkListItem`) never fire. Returns
 * `false` when the caret is outside such an item so other shortcuts can claim
 * the key.
 */
export function adjustListIndent(
  editor: Editor,
  typeName: string,
  delta: number
): boolean {
  const { state, view } = editor;
  const item = findParentNodeClosestToPos(
    state.selection.$from,
    (node) => node.type.name === typeName
  );
  if (!item) return false;

  const current = Number(item.node.attrs.indent ?? 0);
  const next = Math.max(0, Math.min(MAX_LIST_INDENT, current + delta));
  if (next === current) return true;

  const tr = state.tr;
  tr.setNodeMarkup(item.pos, undefined, { ...item.node.attrs, indent: next });
  view.dispatch(tr);
  return true;
}