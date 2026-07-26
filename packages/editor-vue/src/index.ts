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
export {
  moveColumnLeft,
  moveColumnRight,
  moveRowDown,
  moveRowUp,
  selectRow,
  selectColumn
} from "./extensions/table/actions";
export { TableCell } from "./extensions/table-cell/table-cell";
export type { TableCellOptions } from "./extensions/table-cell/table-cell";
export { TableHeader } from "./extensions/table-header/table-header";
export type { TableHeaderOptions } from "./extensions/table-header/table-header";
export { TableRow } from "@tiptap/extension-table-row";

// Heading extension with collapsible sections (h1-h6).
export { Heading } from "./extensions/heading/heading";
export type { HeadingOptions } from "./extensions/heading/heading";

// Slash-commands (2.5). A TipTap extension wiring `@tiptap/suggestion` to a Vue
// render menu (`SlashMenu.vue`) driven by the vendored slash items below.
export { SlashCommands } from "./extensions/slash-commands/slash-commands";
export { default as SlashMenu } from "./extensions/slash-commands/SlashMenu.vue";

// Tag-mention (Phase 5.4). `TagMention` is an inline-atom `#tag` chip node that
// round-trips as `<span data-tag-id data-tag-title>`; `TagSuggest` is the
// `@tiptap/suggestion` extension that opens a picker on `#` (anywhere, via
// `allowedPrefixes: null`, with its own `PluginKey`). The host injects the tag
// list + assign/create callbacks onto `editor.storage` (`wireTagMention` in
// the renderer) — editor-vue has no Pinia access.
export { TagMention } from "./extensions/tag-mention/tag-mention";
export { TagSuggest } from "./extensions/tag-mention/tag-suggest";
export { findTagSuggestionMatch } from "./extensions/tag-mention/tag-suggest-match";
export { default as TagMenu } from "./extensions/tag-mention/TagMenu.vue";
export type { TagMentionAttributes, TagMentionOptions, TagSuggestionItem, ReconcileOptions } from "./extensions/tag-mention/types";
export {
  RECONCILE_META,
  collectTagMentionTagIds,
  findOrphanTagMentionRanges,
  diffDeletedTagIds
} from "./extensions/tag-mention/reconcile";
export type { TagMentionRange } from "./extensions/tag-mention/reconcile";

// Note-linking (inline `@`/`[[` note links + a toolbar "Link to note" button).
// `Link` is a fresh port of upstream's standard TipTap `link` mark so inserted
// HTML is byte-compatible with upstream Notesnook (`<a href="nn://note/<id>">`).
// `NoteSuggest` is the `@tiptap/suggestion` extension (its own `PluginKey`)
// triggered by `@` OR `[[` via a custom finder; `NoteLinkPicker` is the shared
// popup (note list + block drilldown). The host injects `getNoteSuggestions`/
// `getContentBlocks`/`openLink` via `wireNoteLink` in the renderer — editor-vue
// has no Pinia/db access. Pure `nn://` URL helpers live here (not in contracts,
// which transitively pulls `@notesnook/core`) so editor-vue stays self-contained.
export { Link } from "./extensions/link/link";
export type { LinkOptions, LinkAttributes } from "./extensions/link/link";
export { insertNoteLink, setNoteLink, linkMarkAttrs } from "./extensions/link/insert";
export type { NoteLinkPayload } from "./extensions/link/insert";
export {
  createInternalLink,
  parseInternalLink,
  isInternalLink,
  isNoteLink,
  noteIdFromLink,
  blockIdFromLink,
  NN_PROTOCOL
} from "./extensions/link/internal-link";
export type { InternalLinkType, InternalLinkParams, ParsedInternalLink } from "./extensions/link/internal-link";
export { collectNoteLinkIds, addedNoteLinkIds, removedNoteLinkIds } from "./extensions/link/scan";
export { NoteSuggest } from "./extensions/note-link/note-suggest";
export type { NoteSuggestOptions } from "./extensions/note-link/note-suggest";
export { findNoteSuggestionMatch } from "./extensions/note-link/note-suggest-match";
export { default as NoteLinkPicker } from "./extensions/note-link/NoteLinkPicker.vue";
export type {
  NoteSuggestionItem,
  ContentBlockItem,
  NoteLinkResult,
  NoteLinkLabels
} from "./extensions/note-link/types";
export { DEFAULT_NOTE_LINK_LABELS } from "./extensions/note-link/types";

// Find & Replace (per-tab in-content find). A TipTap extension wrapping a
// ProseMirror highlight plugin + commands (`setFind`/`findNext`/`findPrev`/
// `replace`/`replaceAll`/`clearFind`); the pure matcher lives in
// `./extensions/search/match`. `findReplacePluginKey` is exported so the
// `FindBar` component can read live match state for its counter.
export { FindReplace, findReplacePluginKey, scrollPosIntoView, findScrollContainer } from "./extensions/search/find-replace";
export type { FindReplaceState } from "./extensions/search/find-replace";
export {
  findMatches,
  buildTextMap
} from "./extensions/search/match";
export type { SearchMatch, SearchOptions, TextMap } from "./extensions/search/match";

// Editor-action metadata (2.5) — vendored parity source for the command
// palette + slash menu. `import type { ToolId }` from @notesnook/editor is
// erased, so React/theme-ui/zustand stay out of the renderer bundle.
export {
  EDITOR_ACTIONS,
  EDITOR_ACTION_BY_ID,
  SLASH_ITEMS,
  filterSlashItems,
  PARITY,
  DEFAULT_TOOLBAR
} from "./tool-definitions";
export type {
  EditorAction,
  EditorActionKind,
  SlashItem,
  ToolbarItem,
  ToolbarDefinition,
  ToolbarMenuItem,
  ToolbarMenuSubmenu
} from "./tool-definitions";

// Inline marks (Phase 5.3) — thin re-exports of the standard TipTap mark
// extensions, pinned to 2.6.6 via the root overrides (see header). Pure
// toggles, no node-view; exported here so the editor-vue package owns every
// extension the editor loads. Underline round-trips as `<u>`, Highlight as
// `<mark>` (plain toggle, no colour arg — the colour picker is deferred).
export { Underline } from "./extensions/underline/underline";
export type { UnderlineOptions } from "./extensions/underline/underline";
export { Highlight } from "./extensions/highlight/highlight";
export type { HighlightOptions } from "./extensions/highlight/highlight";

// Phase 5.5 toolbar marks/options — thin re-exports of the standard TipTap
// extensions, pinned to 2.6.6 via the root overrides. `TextStyle` carries the
// `color` (set by `Color`) and `fontFamily` (set by `FontFamily`) attrs, so it
// MUST be registered alongside those two. `TextAlign` applies to paragraph +
// heading. Subscript/Superscript are plain toggles.
export { Subscript } from "./extensions/subscript/subscript";
export { Superscript } from "./extensions/superscript/superscript";
export { TextStyle } from "./extensions/text-style/text-style";
export type { TextStyleOptions } from "./extensions/text-style/text-style";
export { Color } from "./extensions/color/color";
export type { ColorOptions } from "./extensions/color/color";
export { FontFamily } from "./extensions/font-family/font-family";
export type { FontFamilyOptions } from "./extensions/font-family/font-family";
export { TextAlign } from "./extensions/text-align/text-align";
export type { TextAlignOptions } from "./extensions/text-align/text-align";

export { getSandboxFeatures } from "./utils/sandbox";
export { filterByKey, subsequenceMatch, cycleIndex } from "./utils/filter";
export { toBlobURL, revokeBloburl } from "./utils/downloader";