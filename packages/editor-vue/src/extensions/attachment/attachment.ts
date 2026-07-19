/*
Ported from @notesnook/editor (GPL-3.0), extensions/attachment/attachment.ts.

The ProseMirror schema (addAttributes/parseHTML/renderHTML) is copied
verbatim so notes round-trip byte-for-byte. The React `createNodeView` layer is
replaced by `VueNodeViewRenderer` from @tiptap/vue-3.

Differences from upstream (scoped to this 2.4a increment):
  - `insertAttachment` always inserts as the `attachment` node (upstream routes
    by mime to Image/Audio/WebClip nodes, which are not ported yet — they land
    in 2.4b/2.4e + Phase 6 for blobs).
  - `updateAttachment` is kept verbatim (it drives upload progress UI).
  - `addKeyboardShortcuts` (openAttachmentPicker) is dropped — the attachment
    picker is a toolbar/Phase-6 concern.
  - `hasPermission` checks are dropped (no toolbar permission system yet).
*/
import { Node, mergeAttributes, findChildren, VueNodeViewRenderer } from "@tiptap/vue-3";
import AttachmentComponent from "./AttachmentComponent.vue";
import { getDataAttribute } from "../../utils/getDataAttribute";
import type { AttachmentOptions, FileAttachment } from "./types";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    attachment: {
      insertAttachment: (...attachment: FileAttachment[]) => ReturnType;
      removeAttachment: () => ReturnType;
      updateAttachment: (
        attachment: Partial<FileAttachment>,
        options: {
          preventUpdate?: boolean;
          ignoreEdit?: boolean;
          query: (attachment: FileAttachment) => boolean;
        }
      ) => ReturnType;
    };
  }
}

export const AttachmentNode = Node.create<AttachmentOptions>({
  name: "attachment",
  content: "inline*",
  marks: "",
  inline: true,
  atom: true,

  addOptions() {
    return {
      types: [this.name],
      HTMLAttributes: {}
    };
  },

  group() {
    return "inline";
  },

  draggable: true,

  addAttributes() {
    return {
      type: { default: "file", rendered: false },
      progress: { default: 0, rendered: false },
      hash: getDataAttribute("hash"),
      filename: getDataAttribute("filename"),
      mime: getDataAttribute("mime"),
      size: getDataAttribute("size")
    };
  },

  parseHTML() {
    return [{ tag: "span[data-hash]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)];
  },

  addNodeView() {
    return VueNodeViewRenderer(AttachmentComponent);
  },

  addCommands() {
    return {
      insertAttachment:
        (...attachments) =>
        ({ commands, state }) => {
          if (attachments.length === 0) return false;
          const { $from } = state.selection;
          const selectedNode = state.doc.nodeAt($from.pos);
          if (selectedNode && selectedNode.type.name === this.name) {
            return commands.insertContentAt(
              $from.pos + selectedNode.nodeSize,
              attachments.map((a) => ({ type: this.name, attrs: a }))
            );
          }
          return commands.insertContent(
            attachments.map((a) => ({ type: this.name, attrs: a }))
          );
        },
      removeAttachment:
        () =>
        ({ commands }) => commands.deleteSelection(),
      updateAttachment:
        (attachment, options) =>
        ({ state, tr, dispatch }) => {
          const attachments = findChildren(state.doc, (node) =>
            this.options.types.includes(node.type.name) &&
            options.query(node.attrs as FileAttachment)
          );
          if (!attachments.length) return false;

          for (const { node, pos } of attachments) {
            const progress = attachment.progress ?? (node.attrs.progress as number | undefined);
            tr.setNodeMarkup(pos, node.type, {
              ...node.attrs,
              ...attachment,
              progress: progress !== undefined && progress < 100 ? progress : undefined
            });
          }
          tr.setMeta("preventUpdate", options.preventUpdate ?? false);
          tr.setMeta("ignoreEdit", options.ignoreEdit ?? false);
          tr.setMeta("addToHistory", false);
          if (dispatch) dispatch(tr);
          return true;
        }
    };
  }
});