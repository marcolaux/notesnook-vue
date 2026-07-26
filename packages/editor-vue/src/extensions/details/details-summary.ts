import { mergeAttributes, Node } from "@tiptap/vue-3";

export interface DetailsSummaryOptions {
  HTMLAttributes: Record<string, unknown>;
}

export const DetailsSummary = Node.create<DetailsSummaryOptions>({
  name: "detailsSummary",

  addOptions() {
    return {
      HTMLAttributes: {}
    };
  },

  content: "inline*",

  defining: true,

  selectable: false,

  parseHTML() {
    return [
      {
        tag: "summary"
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "summary",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      0
    ];
  }
});
