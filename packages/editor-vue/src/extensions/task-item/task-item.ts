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
import TaskItem from "@tiptap/extension-task-item";
import TaskItemComponent from "./TaskItemComponent.vue";
import { ensureLeadingParagraph } from "../../utils/prosemirror";
import { MAX_LIST_INDENT, adjustListIndent } from "../../utils/list-indent";

export type { TaskItemAttributes } from "./types";

// Re-export the shared indent cap under its legacy name so existing imports
// (`MAX_TASK_INDENT`) keep resolving.
export { MAX_LIST_INDENT as MAX_TASK_INDENT } from "../../utils/list-indent";

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
            ? Math.min(MAX_LIST_INDENT, Math.floor(n))
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
      Tab: () => adjustListIndent(this.editor, this.name, +1),
      "Shift-Tab": () => adjustListIndent(this.editor, this.name, -1)
    };
  },

  addNodeView() {
    return VueNodeViewRenderer(TaskItemComponent);
  },

  addInputRules() {
    return [];
  }
});