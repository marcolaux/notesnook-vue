import {
  mergeAttributes,
  Node,
  VueNodeViewRenderer
} from "@tiptap/vue-3";
import DetailsView from "./DetailsView.vue";

export interface DetailsOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    details: {
      setDetails: () => ReturnType;
      toggleDetails: (pos?: number) => ReturnType;
      unsetDetails: () => ReturnType;
    };
  }
}

export const Details = Node.create<DetailsOptions>({
  name: "details",

  addOptions() {
    return {
      HTMLAttributes: {}
    };
  },

  group: "block",

  content: "detailsSummary detailsContent",

  defining: true,

  allowGapCursor: true,

  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML: (element) => element.hasAttribute("open"),
        renderHTML: (attributes) => {
          if (!attributes.open) return {};
          return { open: "" };
        }
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: "details"
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "details",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      0
    ];
  },

  addCommands() {
    return {
      setDetails:
        () =>
        ({ commands }) => {
          return commands.insertContent({
            type: "details",
            attrs: { open: true },
            content: [
              {
                type: "detailsSummary"
              },
              {
                type: "detailsContent",
                content: [{ type: "paragraph" }]
              }
            ]
          });
        },
      toggleDetails:
        (targetPos) =>
        ({ tr, state, dispatch }) => {
          let pos = targetPos;
          if (pos === undefined) {
            const { $from } = state.selection;
            for (let d = $from.depth; d > 0; d--) {
              if ($from.node(d).type.name === "details") {
                pos = $from.before(d);
                break;
              }
            }
          }
          if (pos === undefined) {
            // Not inside a details block -> insert a new details block
            if (dispatch) {
              tr.insert(
                state.selection.from,
                state.schema.nodes.details!.createAndFill({ open: true })!
              );
            }
            return true;
          }

          const node = tr.doc.nodeAt(pos);
          if (!node || node.type.name !== "details") return false;

          if (dispatch) {
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              open: !node.attrs.open
            });
          }
          return true;
        },
      unsetDetails:
        () =>
        ({ commands }) => {
          return commands.lift("details");
        }
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Alt-t": () => this.editor.commands.toggleDetails()
    };
  },

  addNodeView() {
    return VueNodeViewRenderer(DetailsView);
  }
});
