/**
 * Superscript mark (Phase 5.5 toolbar) — a thin re-export of the standard
 * TipTap `@tiptap/extension-superscript`. Pure toggle (`toggleSuperscript`)
 * that round-trips as `<sup>`; no custom schema, no node-view. Re-exported here
 * so the editor-vue package owns every extension the editor loads, matching
 * how `Underline`/`Highlight` are re-exported from npm.
 *
 * Pinned to `@tiptap/extension-superscript@2.6.6` via the root `overrides` so
 * it shares one ProseMirror core with the rest of the editor (see index.ts
 * header).
 */
export { Superscript } from "@tiptap/extension-superscript";