import { mergeAttributes, Node } from "@tiptap/vue-3";

export interface OutlineListOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    outlineList: {
      toggleOutlineList: () => ReturnType;
    };
  }
}

export const OutlineList = Node.create<OutlineListOptions>({
  name: "outlineList",

  priority: 1000,

  addOptions() {
    return {
      HTMLAttributes: {}
    };
  },

  group: "block list",

  content: "outlineListItem+",

  addAttributes() {
    return {
      collapsed: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-collapsed") === "true",
        renderHTML: (attributes) => {
          if (!attributes.collapsed) return {};
          return { "data-collapsed": "true" };
        }
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: 'ul[data-type="outlineList"]'
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "ul",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "outlineList"
      }),
      0
    ];
  },

  addCommands() {
    return {
      toggleOutlineList:
        () =>
        ({ commands }) => {
          return commands.toggleList("outlineList", "outlineListItem");
        }
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Shift-u": () => this.editor.commands.toggleOutlineList()
    };
  }
});
