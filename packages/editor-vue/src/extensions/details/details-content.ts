import { mergeAttributes, Node } from "@tiptap/vue-3";

export interface DetailsContentOptions {
  HTMLAttributes: Record<string, unknown>;
}

export const DetailsContent = Node.create<DetailsContentOptions>({
  name: "detailsContent",

  addOptions() {
    return {
      HTMLAttributes: {}
    };
  },

  content: "block+",

  defining: true,

  selectable: false,

  parseHTML() {
    return [
      {
        tag: 'div[data-type="details-content"]'
      },
      {
        tag: "details > div"
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "details-content"
      }),
      0
    ];
  }
});
