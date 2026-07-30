import { mergeAttributes, Node, VueNodeViewRenderer } from "@tiptap/vue-3";
import OutlineListItemView from "./OutlineListItemView.vue";

export interface OutlineListItemOptions {
  HTMLAttributes: Record<string, unknown>;
}

export const OutlineListItem = Node.create<OutlineListItemOptions>({
  name: "outlineListItem",

  priority: 1000,

  // Enable drag-to-reorder (the `ListDragReorder` plugin moves a parent and its
  // nested outline subtree as a group). The grip in `OutlineListItemView`
  // (`data-drag-handle` + `draggable="true"`) initiates the drag.
  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {}
    };
  },

  content: "paragraph block*",

  defining: true,

  parseHTML() {
    return [
      {
        tag: 'li[data-type="outlineListItem"]'
      },
      {
        tag: 'ul[data-type="outlineList"] > li'
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "li",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "outlineListItem"
      }),
      0
    ];
  },

  addKeyboardShortcuts() {
    return {
      Enter: () => this.editor.commands.splitListItem(this.name),
      Tab: () => this.editor.commands.sinkListItem(this.name),
      "Shift-Tab": () => this.editor.commands.liftListItem(this.name)
    };
  },

  addNodeView() {
    return VueNodeViewRenderer(OutlineListItemView);
  }
});
