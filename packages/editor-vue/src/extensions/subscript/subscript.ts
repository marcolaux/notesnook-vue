/**
 * Subscript mark (Phase 5.5 toolbar) — a thin re-export of the standard
 * TipTap `@tiptap/extension-subscript`. Pure toggle (`toggleSubscript`) that
 * round-trips as `<sub>`; no custom schema, no node-view. Re-exported here so
 * the editor-vue package owns every extension the editor loads (one import
 * surface for the consumer app), matching how `Underline`/`Highlight` are
 * re-exported from npm.
 *
 * Pinned to `@tiptap/extension-subscript@2.6.6` via the root `overrides` so it
 * shares one ProseMirror core with the rest of the editor (see index.ts
 * header).
 */
export { Subscript } from "@tiptap/extension-subscript";