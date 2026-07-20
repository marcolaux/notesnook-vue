/**
 * Highlight mark (Phase 5.3) — a thin re-export of the standard TipTap
 * `@tiptap/extension-highlight`. It is a pure toggle (`toggleHighlight()`, no
 * colour argument) that round-trips as `<mark>`; no custom schema, no
 * node-view. Re-exported here so the editor-vue package owns every extension the
 * editor loads (one import surface for the consumer app), matching how
 * `TableRow` is re-exported from npm.
 *
 * Upstream `@notesnook/editor`'s Highlight takes a `backgroundColor` argument
 * (multicolour) — the colour-picker surface is deferred (see EditorToolbar.vue
 * header); this plain toggle covers the MVP "highlight selection" button.
 *
 * Pinned to `@tiptap/extension-highlight@2.6.6` via the root `overrides` so it
 * shares one ProseMirror core with the rest of the editor (see index.ts header).
 */
export { Highlight } from "@tiptap/extension-highlight";
export type { HighlightOptions } from "@tiptap/extension-highlight";