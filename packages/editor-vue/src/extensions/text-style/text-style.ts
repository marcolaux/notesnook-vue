/**
 * TextStyle mark (Phase 5.5 toolbar) — a thin re-export of the standard TipTap
 * `@tiptap/extension-text-style`. Provides the `textStyle` mark that carries
 * `color` (set by `@tiptap/extension-color`) and `fontFamily` (set by
 * `@tiptap/extension-font-family`); both ride on this mark, so it MUST be
 * registered before/alongside `Color` and `FontFamily`. Re-exported here so
 * the editor-vue package owns every extension the editor loads, matching how
 * `Underline`/`Highlight` are re-exported from npm.
 *
 * Pinned to `@tiptap/extension-text-style@2.6.6` via the root `overrides` so it
 * shares one ProseMirror core with the rest of the editor (see index.ts
 * header).
 */
export { TextStyle } from "@tiptap/extension-text-style";
export type { TextStyleOptions } from "@tiptap/extension-text-style";