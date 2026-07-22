/**
 * FontFamily mark (Phase 5.5 toolbar) — a thin re-export of the standard TipTap
 * `@tiptap/extension-font-family`. Sets `textStyle.fontFamily` via
 * `setFontFamily(family)` / `unsetFontFamily()`, so `TextStyle` MUST also be
 * registered. Re-exported here so the editor-vue package owns every extension
 * the editor loads, matching how `Underline`/`Highlight` are re-exported from
 * npm.
 *
 * Pinned to `@tiptap/extension-font-family@2.6.6` via the root `overrides` so
 * it shares one ProseMirror core with the rest of the editor (see index.ts
 * header).
 */
export { FontFamily } from "@tiptap/extension-font-family";
export type { FontFamilyOptions } from "@tiptap/extension-font-family";