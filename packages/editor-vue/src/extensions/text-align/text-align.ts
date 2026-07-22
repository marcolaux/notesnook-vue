/**
 * TextAlign extension (Phase 5.5 toolbar) — a thin re-export of the standard
 * TipTap `@tiptap/extension-text-align`. Applies `text-align` to the configured
 * node types (here `["heading", "paragraph"]`) via `setTextAlign(align)` /
 * `unsetTextAlign()`. Re-exported here so the editor-vue package owns every
 * extension the editor loads, matching how `Underline`/`Highlight` are
 * re-exported from npm.
 *
 * Pinned to `@tiptap/extension-text-align@2.6.6` via the root `overrides` so
 * it shares one ProseMirror core with the rest of the editor (see index.ts
 * header).
 */
export { TextAlign } from "@tiptap/extension-text-align";
export type { TextAlignOptions } from "@tiptap/extension-text-align";