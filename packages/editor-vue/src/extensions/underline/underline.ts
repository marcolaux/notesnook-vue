/**
 * Underline mark (Phase 5.3) — a thin re-export of the standard TipTap
 * `@tiptap/extension-underline`. It is a pure toggle (`toggleUnderline`) that
 * round-trips as `<u>`; no custom schema, no node-view. Re-exported here so the
 * editor-vue package owns every extension the editor loads (one import surface
 * for the consumer app), matching how `TableRow` is re-exported from npm.
 *
 * Pinned to `@tiptap/extension-underline@2.6.6` via the root `overrides` so it
 * shares one ProseMirror core with the rest of the editor (see index.ts header).
 */
export { Underline } from "@tiptap/extension-underline";
export type { UnderlineOptions } from "@tiptap/extension-underline";