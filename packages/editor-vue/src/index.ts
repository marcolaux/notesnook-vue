/**
 * @notesnook-vue/editor-vue — Vue 3 port of selected @notesnook/editor
 * node-views. Pure ProseMirror schema is copied from upstream so stored notes
 * round-trip byte-for-byte; the React node-view layer is replaced by
 * `VueNodeViewRenderer` + `<NodeViewWrapper>`/`<NodeViewContent>` from
 * `@tiptap/vue-3`.
 *
 * Import `Node`, `mergeAttributes`, `VueNodeViewRenderer` etc. from
 * `@tiptap/vue-3` (which re-exports `@tiptap/core`) — never from `@tiptap/core`
 * directly, so the editor and its extensions share one ProseMirror schema.
 */
export { AttachmentNode } from "./extensions/attachment/attachment";
export type { AttachmentOptions, FileAttachment } from "./extensions/attachment/types";

export { TaskItemNode } from "./extensions/task-item/task-item";
export type { TaskItemAttributes } from "./extensions/task-item/types";

export { TaskListNode } from "./extensions/task-list/task-list";
export type { TaskListAttributes } from "./extensions/task-list/types";

export { EmbedNode } from "./extensions/embed/embed";
export type { EmbedOptions, EmbedAttributes, EmbedAlignmentOptions, EmbedSizeOptions, Embed } from "./extensions/embed/types";

export { getSandboxFeatures } from "./utils/sandbox";