import {
  mergeAttributes,
  Node,
  textblockTypeInputRule,
  VueNodeViewRenderer
} from "@tiptap/vue-3";
import type { Level } from "@tiptap/extension-heading";
import HeadingView from "./HeadingView.vue";
import { createHeadingCollapsePlugin } from "./collapse-plugin";

export interface HeadingOptions {
  levels: Level[];
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    heading: {
      /** Set the current textblock to a heading of the given level. */
      setHeading: (attributes: { level: Level }) => ReturnType;
      /** Toggle the current textblock between a heading and a paragraph. */
      toggleHeading: (attributes: { level: Level }) => ReturnType;
    };
    headingCollapse: {
      toggleHeadingCollapse: (pos?: number) => ReturnType;
      collapseHeading: (pos?: number) => ReturnType;
      expandHeading: (pos?: number) => ReturnType;
      collapseAllHeadings: (level?: number) => ReturnType;
      expandAllHeadings: () => ReturnType;
    };
  }
}

export const Heading = Node.create<HeadingOptions>({
  name: "heading",

  addOptions() {
    return {
      levels: [1, 2, 3, 4, 5, 6],
      HTMLAttributes: {}
    };
  },

  content: "inline*",

  group: "block",

  defining: true,

  addAttributes() {
    return {
      level: {
        default: 1,
        parseHTML: (element) => {
          const level = Number(element.tagName.substring(1));
          return this.options.levels.includes(level as Level) ? level : 1;
        },
        rendered: false
      },
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
    return this.options.levels.map((level: Level) => ({
      tag: `h${level}`
    }));
  },

  renderHTML({ node, HTMLAttributes }) {
    const hasLevel = this.options.levels.includes(node.attrs.level);
    const level = hasLevel ? node.attrs.level : this.options.levels[0];

    return [
      `h${level}`,
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      0
    ];
  },

  addCommands() {
    return {
      setHeading:
        (attributes) =>
        ({ commands }) => {
          if (!this.options.levels.includes(attributes.level)) {
            return false;
          }
          return commands.setNode(this.name, attributes);
        },
      toggleHeading:
        (attributes) =>
        ({ commands }) => {
          if (!this.options.levels.includes(attributes.level)) {
            return false;
          }
          return commands.toggleNode(this.name, "paragraph", attributes);
        },
      toggleHeadingCollapse:
        (targetPos) =>
        ({ tr, state, dispatch }) => {
          let pos = targetPos;
          if (pos === undefined) {
            const { $from } = state.selection;
            for (let d = $from.depth; d > 0; d--) {
              if ($from.node(d).type.name === "heading") {
                pos = $from.before(d);
                break;
              }
            }
          }
          if (pos === undefined) return false;

          const headingNode = tr.doc.nodeAt(pos);
          if (!headingNode || headingNode.type.name !== "heading") return false;

          if (dispatch) {
            tr.setNodeMarkup(pos, undefined, {
              ...headingNode.attrs,
              collapsed: !headingNode.attrs.collapsed
            });
          }
          return true;
        },
      collapseHeading:
        (targetPos) =>
        ({ tr, state, dispatch }) => {
          let pos = targetPos;
          if (pos === undefined) {
            const { $from } = state.selection;
            for (let d = $from.depth; d > 0; d--) {
              if ($from.node(d).type.name === "heading") {
                pos = $from.before(d);
                break;
              }
            }
          }
          if (pos === undefined) return false;

          const headingNode = tr.doc.nodeAt(pos);
          if (!headingNode || headingNode.type.name !== "heading") return false;

          if (dispatch) {
            tr.setNodeMarkup(pos, undefined, {
              ...headingNode.attrs,
              collapsed: true
            });
          }
          return true;
        },
      expandHeading:
        (targetPos) =>
        ({ tr, state, dispatch }) => {
          let pos = targetPos;
          if (pos === undefined) {
            const { $from } = state.selection;
            for (let d = $from.depth; d > 0; d--) {
              if ($from.node(d).type.name === "heading") {
                pos = $from.before(d);
                break;
              }
            }
          }
          if (pos === undefined) return false;

          const headingNode = tr.doc.nodeAt(pos);
          if (!headingNode || headingNode.type.name !== "heading") return false;

          if (dispatch) {
            tr.setNodeMarkup(pos, undefined, {
              ...headingNode.attrs,
              collapsed: false
            });
          }
          return true;
        },
      collapseAllHeadings:
        (targetLevel) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.doc.descendants((node, pos) => {
              if (
                node.type.name === "heading" &&
                (targetLevel === undefined || node.attrs.level === targetLevel)
              ) {
                tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  collapsed: true
                });
              }
              return true;
            });
          }
          return true;
        },
      expandAllHeadings:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.doc.descendants((node, pos) => {
              if (node.type.name === "heading" && node.attrs.collapsed) {
                tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  collapsed: false
                });
              }
              return true;
            });
          }
          return true;
        }
    };
  },

  addKeyboardShortcuts() {
    return {
      ...this.options.levels.reduce(
        (items, level) => ({
          ...items,
          [`Mod-Alt-${level}`]: () =>
            this.editor.commands.toggleHeading({ level })
        }),
        {} as Record<string, () => boolean>
      ),
      "Mod-Alt-f": () => this.editor.commands.toggleHeadingCollapse()
    };
  },

  addInputRules() {
    return this.options.levels.map((level) =>
      textblockTypeInputRule({
        find: new RegExp(`^(#{1,${level}})\\s$`),
        type: this.type,
        getAttributes: { level }
      })
    );
  },

  addNodeView() {
    return VueNodeViewRenderer(HeadingView);
  },

  addProseMirrorPlugins() {
    return [createHeadingCollapsePlugin()];
  }
});
