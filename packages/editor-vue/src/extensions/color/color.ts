/**
 * Color mark (Phase 5.5 toolbar) — a thin re-export of the standard TipTap
 * `@tiptap/extension-color`. Sets `textStyle.color` via `setColor(code)` /
 * `unsetColor()`, so `TextStyle` MUST also be registered. Re-exported here so
 * the editor-vue package owns every extension the editor loads, matching how
 * `Underline`/`Highlight` are re-exported from npm.
 *
 * Pinned to `@tiptap/extension-color@2.6.6` via the root `overrides` so it
 * shares one ProseMirror core with the rest of the editor (see index.ts
 * header).
 */
export { Color } from "@tiptap/extension-color";
export type { ColorOptions } from "@tiptap/extension-color";