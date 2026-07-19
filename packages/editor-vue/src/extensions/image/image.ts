/*
Ported from @notesnook/editor (GPL-3.0), extensions/image/image.ts.

The ProseMirror schema (addAttributes/parseHTML/renderHTML) is copied verbatim
so stored images round-trip byte-for-byte: an `<img src width height align
data-align data-hash data-filename data-mime data-size data-aspect-ratio>`
parses back to the same attributes and re-serialises identically. Only
`addNodeView` changes: the React `createNodeView(ImageComponent, { componentKey,
shouldUpdate, forceEnableSelection })` layer is replaced by
`VueNodeViewRenderer(ImageComponent, { update })` from @tiptap/vue-3.

Scoped differences from upstream (this 2.4e increment):
  - `insertImage` inserts `image` nodes directly. Upstream delegates to
    `insertAttachment` which routes by mime to Image/Audio/WebClip/attachment;
    our attachment port (2.4a) always inserts the `attachment` node, so routing
    is folded into each kind's own `insert*` command instead.
  - `addKeyboardShortcuts` is dropped (upstream's `addImage` opens the
    attachment picker via `editor.storage.openAttachmentPicker` and `Mod-c`
    copies the image via `editor.storage.getAttachmentData` + `toBlob` +
    `navigator.clipboard.write`). Both need the toolbar / Phase-6 attachment
    bridge — they land with the toolbar (Phase 2.5) / Phase 6.
  - `componentKey` (React `key`-based remount on hash change) + `shouldUpdate`
    (re-render on attr change) are folded into a single Vue `update` callback:
    remount when the identity (`hash`) or node type changes (so the lazy blob
    fetch re-runs against the new attachment), re-render in place for
    size/align/aspectRatio/src changes (no remount → no scroll/caret jump).
  - `forceEnableSelection` (a Notesnook React-layer option) is not needed: atom
    nodes are node-selectable by default in ProseMirror / the Vue node-view.
  - `textDirection`-derived alignment default is gone (text-direction extension
    not ported); an unset `align` falls back to "left" in the component.
*/
import {
  Node,
  mergeAttributes,
  nodeInputRule,
  VueNodeViewRenderer
} from "@tiptap/vue-3";
import ImageComponent from "./ImageComponent.vue";
import { getDataAttribute } from "../../utils/getDataAttribute";
import { hasSameAttributes } from "../../utils/prosemirror";
import type {
  ImageOptions,
  ImageAttributes,
  ImageAlignmentOptions,
  ImageSize
} from "./types";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    image: {
      /** Add an image. */
      insertImage: (...options: Partial<ImageAttributes>[]) => ReturnType;
      setImageAlignment: (options: ImageAlignmentOptions) => ReturnType;
      setImageSize: (size: ImageSize) => ReturnType;
    };
  }
}

// Markdown image syntax: ![alt](src "title"). `alt`/`title` are not declared as
// node attributes (matching upstream), so they are dropped by ProseMirror's
// `NodeType.create` — the rule effectively inserts an image with `src` set.
const inputRegex = /(!\[(.+|:?)]\((\S+)(?:(?:\s+)["'](\S+)["'])?\))$/;

export const ImageNode = Node.create<ImageOptions>({
  name: "image",
  atom: true,

  addOptions() {
    return {
      inline: false,
      allowBase64: true,
      HTMLAttributes: {}
    };
  },

  inline() {
    return this.options.inline;
  },

  group() {
    return this.options.inline ? "inline" : "block";
  },

  draggable: true,

  addAttributes() {
    return {
      type: { default: "image", rendered: false },
      progress: {
        default: 0,
        rendered: false
      },

      src: {
        default: null
      },
      width: { default: null },
      height: { default: null },

      align: getDataAttribute("align"),

      hash: getDataAttribute("hash"),
      filename: getDataAttribute("filename"),
      mime: getDataAttribute("mime"),
      size: getDataAttribute("size"),
      aspectRatio: {
        default: undefined,
        parseHTML: (element) =>
          element.dataset.aspectRatio
            ? parseFloat(element.dataset.aspectRatio)
            : 1,
        renderHTML: (attributes) => {
          if (!attributes.aspectRatio) {
            return {};
          }

          return {
            [`data-aspect-ratio`]: attributes.aspectRatio
          };
        }
      }
    };
  },

  parseHTML() {
    return [
      // migration for inline image nodes into block nodes: a `<p>` that wraps
      // an `<img>` is skipped so the image parses as a block, not as paragraph
      // content (inline images are not supported — `inline` defaults to false).
      {
        priority: 60,
        tag: "p",
        skip: true,
        getAttrs(node) {
          if (
            (node as HTMLElement).querySelectorAll("img").length <= 0
          )
            return false;
          return null;
        }
      },
      {
        tag: this.options.allowBase64 ? "img" : 'img:not([src^="data:"])'
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "img",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)
    ];
  },

  addNodeView() {
    return VueNodeViewRenderer(ImageComponent, {
      // Remount when the image identity (`hash`) or node type changes so the
      // lazy blob fetch re-runs against the new attachment; otherwise update
      // in place (size/align/aspectRatio/src re-render without a remount).
      update: ({ oldNode, newNode }) => {
        if (oldNode.type !== newNode.type) return false;
        if (oldNode.attrs.hash !== newNode.attrs.hash) return false;
        return !hasSameAttributes(
          oldNode.attrs as Record<string, unknown>,
          newNode.attrs as Record<string, unknown>
        );
      }
    });
  },

  addCommands() {
    return {
      insertImage:
        (...images) =>
        ({ commands, state }) => {
          if (images.length === 0) return false;
          const { $from } = state.selection;
          const selectedNode = state.doc.nodeAt($from.pos);
          if (selectedNode && selectedNode.type.name === this.name) {
            return commands.insertContentAt(
              $from.pos + selectedNode.nodeSize,
              images.map((a) => ({ type: this.name, attrs: a }))
            );
          }
          return commands.insertContent(
            images.map((a) => ({ type: this.name, attrs: a }))
          );
        },
      setImageAlignment:
        (options) =>
        ({ chain, tr }) => {
          const { from } = tr.selection;
          return chain()
            .updateAttributes(this.name, { ...options })
            .setNodeSelection(from)
            .run();
        },
      setImageSize:
        (options) =>
        ({ chain, tr }) => {
          const { from } = tr.selection;
          return chain()
            .updateAttributes(this.name, { ...options })
            .setNodeSelection(from)
            .run();
        }
    };
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: inputRegex,
        type: this.type,
        getAttributes: (match) => {
          const [, , alt, src, title] = match;

          return { src, alt, title };
        }
      })
    ];
  }
});