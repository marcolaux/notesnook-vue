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

// Image node-view (2.4e). The blob path is Phase-6-gated (attachments auth);
// images with an inline `src` (data URL / external URL) render immediately.
export { ImageNode } from "./extensions/image/image";
export type { ImageOptions, ImageAttributes, ImageAlignmentOptions, ImageSize, ImageAttachment } from "./extensions/image/types";

export { CodeBlock, backtickInputRegex, tildeInputRegex, setLastUsedLanguage } from "./extensions/code-block/code-block";
export type { CodeBlockAttributes, CodeBlockOptions } from "./extensions/code-block/code-block";

// Table node-views (2.4h). `TableRow` is the standard TipTap extension (npm);
// `Table`/`TableCell`/`TableHeader` are ported from @notesnook/editor with the
// vendored prosemirror-tables fork (see extensions/table/prosemirror-tables).
export { Table } from "./extensions/table/table";
export type { TableOptions } from "./extensions/table/table";
export { TableCell } from "./extensions/table-cell/table-cell";
export type { TableCellOptions } from "./extensions/table-cell/table-cell";
export { TableHeader } from "./extensions/table-header/table-header";
export type { TableHeaderOptions } from "./extensions/table-header/table-header";
export { TableRow } from "@tiptap/extension-table-row";

export { getSandboxFeatures } from "./utils/sandbox";