/*
Video node — an atom block node for inline-playable video attachments, modelled
on extensions/image/image.ts (GPL-3.0 port lineage). The ProseMirror schema
(addAttributes/parseHTML/renderHTML) mirrors the image node so a
`<video src width height align data-align data-hash data-filename data-mime
data-size data-aspect-ratio controls>` parses back to the same attributes and
re-serialises identically. Only `addNodeView` differs: it renders a styled
`<video controls>` player (VideoComponent) that lazy-loads the encrypted blob
via `editor.storage.getAttachmentData({ hash })` — the same hook the image
node-view uses (attachments-bridge.ts `wireAttachmentStorage`), so no new
storage wiring is required.

The Standard Notes importer emits hash-only `<video data-hash …>` nodes for
video `snfile`/`inline-file` attachments (e.g. example1's MP4); the player
resolves the blob on view. Notesnook has no prior native video node — this
fills that gap so SN video imports play inline with the app's design pattern.
*/
import {
  Node,
  mergeAttributes,
  VueNodeViewRenderer
} from "@tiptap/vue-3";
import VideoComponent from "./VideoComponent.vue";
import { getDataAttribute } from "../../utils/getDataAttribute";
import { hasSameAttributes } from "../../utils/prosemirror";
import type {
  VideoOptions,
  VideoAttributes,
  VideoAlignmentOptions,
  VideoSize
} from "./types";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    video: {
      /** Add a video node. */
      insertVideo: (...options: Partial<VideoAttributes>[]) => ReturnType;
      setVideoAlignment: (options: VideoAlignmentOptions) => ReturnType;
      setVideoSize: (size: VideoSize) => ReturnType;
    };
  }
}

export const VideoNode = Node.create<VideoOptions>({
  name: "video",
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
      type: { default: "video", rendered: false },
      progress: { default: 0, rendered: false },

      src: { default: null },
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
          return { [`data-aspect-ratio`]: attributes.aspectRatio };
        }
      }
    };
  },

  parseHTML() {
    return [
      // A `<p>` wrapping a `<video>` is skipped so the video parses as a block,
      // not as paragraph content (inline video is not supported — `inline`
      // defaults to false). Mirrors the image node's inline→block migration.
      {
        priority: 60,
        tag: "p",
        skip: true,
        getAttrs(node) {
          if ((node as HTMLElement).querySelectorAll("video").length <= 0)
            return false;
          return null;
        }
      },
      {
        tag: this.options.allowBase64 ? "video" : 'video:not([src^="data:"])'
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    // `<video>` is a void element — a single-element array renders no closing
    // tag. `controls` is always present so the player is interactive.
    return [
      "video",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        controls: true
      })
    ];
  },

  addNodeView() {
    return VueNodeViewRenderer(VideoComponent, {
      // Remount when the attachment identity (`hash`) or node type changes so
      // the lazy blob fetch re-runs against the new attachment; otherwise
      // update in place (size/align/src re-render without a remount).
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
      insertVideo:
        (...videos) =>
        ({ commands, state }) => {
          if (videos.length === 0) return false;
          const { $from } = state.selection;
          const selectedNode = state.doc.nodeAt($from.pos);
          if (selectedNode && selectedNode.type.name === this.name) {
            return commands.insertContentAt(
              $from.pos + selectedNode.nodeSize,
              videos.map((a) => ({ type: this.name, attrs: a }))
            );
          }
          return commands.insertContent(
            videos.map((a) => ({ type: this.name, attrs: a }))
          );
        },
      setVideoAlignment:
        (options) =>
        ({ chain, tr }) => {
          const { from } = tr.selection;
          return chain()
            .updateAttributes(this.name, { ...options })
            .setNodeSelection(from)
            .run();
        },
      setVideoSize:
        (options) =>
        ({ chain, tr }) => {
          const { from } = tr.selection;
          return chain()
            .updateAttributes(this.name, { ...options })
            .setNodeSelection(from)
            .run();
        }
    };
  }
});