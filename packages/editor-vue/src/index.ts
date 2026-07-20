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

// Slash-commands (2.5). A TipTap extension wiring `@tiptap/suggestion` to a Vue
// render menu (`SlashMenu.vue`) driven by the vendored slash items below.
export { SlashCommands } from "./extensions/slash-commands/slash-commands";
export { default as SlashMenu } from "./extensions/slash-commands/SlashMenu.vue";

// Find & Replace (per-tab in-content find). A TipTap extension wrapping a
// ProseMirror highlight plugin + commands (`setFind`/`findNext`/`findPrev`/
// `replace`/`replaceAll`/`clearFind`); the pure matcher lives in
// `./extensions/search/match`. `findReplacePluginKey` is exported so the
// `FindBar` component can read live match state for its counter.
export { FindReplace } from "./extensions/search/find-replace";
export { findReplacePluginKey } from "./extensions/search/find-replace";
export type { FindReplaceState } from "./extensions/search/find-replace";
export {
  findMatches,
  buildTextMap
} from "./extensions/search/match";
export type { SearchMatch, SearchOptions, TextMap } from "./extensions/search/match";

// Editor-action metadata (2.5) — vendored parity source for the command
// palette + slash menu. `import type { ToolId }` from @notesnook/editor is
// erased, so React/theme-ui/zustand stay out of the renderer bundle.
export { EDITOR_ACTIONS, SLASH_ITEMS, filterSlashItems, PARITY } from "./tool-definitions";
export type { EditorAction, SlashItem } from "./tool-definitions";

export { getSandboxFeatures } from "./utils/sandbox";
export { filterByKey, subsequenceMatch, cycleIndex } from "./utils/filter";