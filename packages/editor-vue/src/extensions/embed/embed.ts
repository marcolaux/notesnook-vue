/*
Ported from @notesnook/editor (GPL-3.0), extensions/embed/embed.ts.

The ProseMirror schema (addAttributes/parseHTML/renderHTML) is copied verbatim
so stored embeds round-trip byte-for-byte: an `<iframe src=… width height align>`
parses back to the same attributes and re-serialises identically (TipTap's
default attribute parse/render handles width/height/align — see
utils/sandbox.ts neighbour notes). Only `addNodeView` changes: the React
`createNodeView(EmbedComponent, { shouldUpdate })` layer is replaced by
`VueNodeViewRenderer(EmbedComponent, { update })` from @tiptap/vue-3.

Scoped differences from upstream (this 2.4b increment):
  - `EmbedAlignmentOptions` drops `textDirection` (text-direction extension
    not ported; embed's own schema only carries `align`).
  - The toolbar (align-left/center/right + properties) is not ported —
    alignment is still stored + round-tripped, the UI to change it lands with
    the toolbar (Phase 2.5). `setEmbedAlignment` remains available for the
    command palette / toolbar later.
*/
import { Node, mergeAttributes, VueNodeViewRenderer } from "@tiptap/vue-3";
import EmbedComponent from "./EmbedComponent.vue";
import { hasSameAttributes } from "../../utils/prosemirror";
import type { EmbedOptions, EmbedAttributes, EmbedAlignmentOptions, EmbedSizeOptions } from "./types";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    embed: {
      /** Add an embed. */
      insertEmbed: (options: EmbedAttributes) => ReturnType;
      setEmbedAlignment: (options: EmbedAlignmentOptions) => ReturnType;
      setEmbedSize: (options: EmbedSizeOptions) => ReturnType;
      setEmbedSource: (src: string) => ReturnType;
    };
  }
}

export const EmbedNode = Node.create<EmbedOptions>({
  name: "embed",
  content: "",
  marks: "",
  draggable: true,
  priority: 50,

  addOptions() {
    return {
      HTMLAttributes: {}
    };
  },

  group() {
    return "block";
  },

  addAttributes() {
    return {
      src: {
        default: null
      },
      width: { default: null },
      height: { default: null },
      align: { default: undefined }
    };
  },

  parseHTML() {
    return [
      {
        tag: "iframe[src]"
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "iframe",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)
    ];
  },

  addNodeView() {
    return VueNodeViewRenderer(EmbedComponent, {
      // Re-render only when the embed's attributes change (src/size/align),
      // matching upstream's `shouldUpdate`.
      update: ({ oldNode, newNode }) =>
        !hasSameAttributes(oldNode.attrs as Record<string, unknown>, newNode.attrs as Record<string, unknown>)
    });
  },

  addCommands() {
    return {
      insertEmbed:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options
          });
        },
      setEmbedAlignment:
        (options) =>
        ({ commands }) => {
          return commands.updateAttributes(this.name, { ...options });
        },
      setEmbedSize:
        (options) =>
        ({ commands }) => {
          return commands.updateAttributes(this.name, { ...options });
        },
      setEmbedSource:
        (src) =>
        ({ commands }) => {
          return commands.updateAttributes(this.name, { src });
        }
    };
  }
});