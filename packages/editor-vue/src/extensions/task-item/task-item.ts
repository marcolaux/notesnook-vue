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

export type { TaskItemAttributes } from "./types";

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
      ...this.parent?.()
    };
  },

  addNodeView() {
    return VueNodeViewRenderer(TaskItemComponent);
  },

  addInputRules() {
    return [];
  }
});