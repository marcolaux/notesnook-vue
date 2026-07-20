/*
Ported verbatim from @notesnook/editor (GPL-3.0), extensions/task-item/task-item.ts.
The schema (addAttributes/parseHTML/renderHTML) is the round-trip contract —
stored notes use `<li class="checklist--item [checked]">`, so this must not
change. Only `addNodeView` differs: the React `createNodeView` is replaced by
`VueNodeViewRenderer`; the `wrapperFactory`/`contentDOMFactory` map to
`<NodeViewWrapper as="li">` + `<NodeViewContent as="div">` in the SFC.

Mobile/iOS touch handling (decision #8 — desktop first) is dropped.
*/
import { mergeAttributes, VueNodeViewRenderer } from "@tiptap/vue-3";
import type { Editor } from "@tiptap/core";
import TaskItem from "@tiptap/extension-task-item";
import TaskItemComponent from "./TaskItemComponent.vue";
import { ensureLeadingParagraph, findParentNodeClosestToPos } from "../../utils/prosemirror";

export type { TaskItemAttributes } from "./types";

/**
 * Furthest a task item can be visually indented via Tab. Caps runaway nesting
 * of the left padding and keeps the rendered HTML tidy.
 */
export const MAX_TASK_INDENT = 8;

export const TaskItemNode = TaskItem.extend({
  draggable: true,

  addAttributes() {
    return {
      checked: {
        default: false,
        keepOnSplit: false,
        parseHTML: (element) => element.classList.contains("checked"),
        renderHTML: (attributes) => ({
          class: attributes.checked ? "checked" : ""
        })
      },
      // Visual-only indentation. Tab/Shift-Tab adjust this instead of
      // sinking/lifting the item into a nested `<ul class="checklist">` — the
      // stock `sinkListItem`/`liftListItem` behaviour creates inner checklists
      // (Tab) and pops first-level items out of the checklist (Shift-Tab),
      // which then no longer round-trips as a checklist on reload. Stored as
      // `data-indent` on the `<li>`; rendered as left padding by the node-view.
      indent: {
        default: 0,
        keepOnSplit: true,
        parseHTML: (element) => {
          const n = Number(element.dataset.indent);
          return Number.isFinite(n) && n > 0
            ? Math.min(MAX_TASK_INDENT, Math.floor(n))
            : 0;
        },
        renderHTML: (attributes) => {
          const n = Number(attributes.indent ?? 0);
          return n > 0 ? { "data-indent": String(n) } : {};
        }
      }
    };
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "li",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: "checklist--item"
      }),
      0
    ];
  },

  parseHTML() {
    return [
      {
        tag: ".checklist > li",
        priority: 100,
        getContent: ensureLeadingParagraph
      }
    ];
  },

  addKeyboardShortcuts() {
    return {
      // Keep the stock Enter (split the current item into a new unchecked one).
      Enter: () => this.editor.commands.splitListItem(this.name),
      // Tab/Shift-Tab adjust the visual `indent` attribute instead of
      // sinking/lifting the list item. At the floor (indent 0) Shift-Tab is a
      // no-op so first-level items stay in their checklist; at the ceiling
      // (MAX_TASK_INDENT) Tab is a no-op. When the caret is not inside a task
      // item, both return false so other handlers (e.g. code-block indent)
      // take the key.
      Tab: () => adjustIndent(this.editor, this.name, +1),
      "Shift-Tab": () => adjustIndent(this.editor, this.name, -1)
    };
  },

  addNodeView() {
    return VueNodeViewRenderer(TaskItemComponent);
  },

  addInputRules() {
    return [];
  }
});

/**
 * Adjust the `indent` attribute of the task item wrapping the selection by
 * `delta` (Tab = +1, Shift-Tab = -1), clamped to `[0, MAX_TASK_INDENT]`.
 *
 * Returns `true` (key handled) whenever the caret sits in a task item — even
 * when already at the floor/ceiling, so the browser's default Tab focus-move
 * (and the stock `liftListItem`/`sinkListItem`) never fire. Returns `false`
 * when the caret is outside a task item so other shortcuts can claim the key.
 */
function adjustIndent(editor: Editor, typeName: string, delta: number): boolean {
  const { state, view } = editor;
  const item = findParentNodeClosestToPos(
    state.selection.$from,
    (node) => node.type.name === typeName
  );
  if (!item) return false;

  const current = Number(item.node.attrs.indent ?? 0);
  const next = Math.max(0, Math.min(MAX_TASK_INDENT, current + delta));
  if (next === current) return true;

  const tr = state.tr;
  tr.setNodeMarkup(item.pos, undefined, { ...item.node.attrs, indent: next });
  view.dispatch(tr);
  return true;
}